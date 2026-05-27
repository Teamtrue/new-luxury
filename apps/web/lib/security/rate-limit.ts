/**
 * lib/security/rate-limit.ts
 * ---------------------------------------------------------------------------
 * Distributed rate limiting for PlutusClub API routes.
 * Production requires Upstash Redis REST; local development can fall back to
 * in-process memory so UI work is not blocked.
 * ---------------------------------------------------------------------------
 */

export const RATE_LIMITS = {
  'auth:send-otp':    { requests: 3,   windowMs: 60_000 },
  'auth:verify-otp':  { requests: 5,   windowMs: 300_000 },
  'auth:login':       { requests: 10,  windowMs: 900_000 },
  'payments:create':  { requests: 5,   windowMs: 60_000 },
  'bookings:create':  { requests: 10,  windowMs: 3_600_000 },
  'api:general':      { requests: 100, windowMs: 60_000 },
  'api:public':       { requests: 300, windowMs: 60_000 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryBucket>();

if (typeof globalThis !== 'undefined') {
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const g = globalThis as typeof globalThis & { __rlCleanup?: boolean };
  if (!g.__rlCleanup) {
    g.__rlCleanup = true;
    setInterval(() => {
      const now = Date.now();
      memoryStore.forEach((bucket, key) => {
        if (bucket.resetAt < now) memoryStore.delete(key);
      });
    }, CLEANUP_INTERVAL_MS).unref?.();
  }
}

function checkMemoryLimit(
  storeKey: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = memoryStore.get(storeKey);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryStore.set(storeKey, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt) };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const allowed = bucket.count <= limit;
  return { allowed, remaining, resetAt: new Date(bucket.resetAt) };
}

async function callUpstashPipeline(
  commands: Array<[string, ...string[]]>
): Promise<Array<number | string | null> | null> {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis rate limiting is required in production.');
    }
    return null;
  }

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2_000),
    });

    if (!res.ok) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Redis rate limiting failed with status ${res.status}.`);
      }
      return null;
    }

    const json = (await res.json()) as Array<{ result: number | string | null }>;
    return json.map((r) => r.result);
  } catch {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis rate limiting is unavailable in production.');
    }
    return null;
  }
}

async function checkRedisLimit(
  storeKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const windowSecs = Math.ceil(windowMs / 1000);
  const results = await callUpstashPipeline([
    ['INCR', storeKey],
    ['TTL', storeKey],
  ]);

  if (!results) return null;

  const [incrResult, ttlResult] = results;
  const count = typeof incrResult === 'number' ? incrResult : parseInt(String(incrResult), 10);
  const ttl   = typeof ttlResult  === 'number' ? ttlResult  : parseInt(String(ttlResult),  10);

  if (count === 1 || ttl === -1) {
    await callUpstashPipeline([['EXPIRE', storeKey, String(windowSecs)]]);
  }

  const currentTtl = count === 1 ? windowSecs : Math.max(ttl, 0);
  const resetAt = new Date(Date.now() + currentTtl * 1000);
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  return { allowed, remaining, resetAt };
}

export async function checkRateLimit(
  key: RateLimitKey,
  identifier: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[key];
  const storeKey = `plutus:rl:${key}:${identifier}`;

  const redisResult = await checkRedisLimit(storeKey, config.requests, config.windowMs);
  if (redisResult) return redisResult;

  return checkMemoryLimit(storeKey, config.requests, config.windowMs);
}

export async function assertRateLimit(
  key: RateLimitKey,
  identifier: string
): Promise<Response | null> {
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(key, identifier);
  } catch (error) {
    console.error('[rate-limit] fail-closed:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Rate limit service unavailable.' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30',
        },
      }
    );
  }

  const retryAfterSecs = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
  const headers: Record<string, string> = {
    'X-RateLimit-Limit':     String(RATE_LIMITS[key].requests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.floor(result.resetAt.getTime() / 1000)),
  };

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: retryAfterSecs,
      }),
      {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Retry-After':  String(retryAfterSecs),
        },
      }
    );
  }

  return null;
}

export function getClientIP(request: Request): string {
  const h = (name: string) => request.headers.get(name);

  const cfIp = h('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const realIp = h('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = h('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return '0.0.0.0';
}
