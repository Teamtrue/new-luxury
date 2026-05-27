/**
 * lib/api-helpers.ts
 * ---------------------------------------------------------------------------
 * Shared utilities used by every PlutusClub API route handler.
 * ---------------------------------------------------------------------------
 */

import type { ZodSchema } from 'zod';
import { getSecurityHeaders }   from './security/headers';
import { getAuthUser }          from './auth/session';
import { getAdminSession }      from './auth/session';
import { assertPermission }     from './auth/rbac';

export type { AuthUser, AdminSession } from './auth/session';

export function apiSuccess<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...getSecurityHeaders(),
      },
    }
  );
}

export function apiError(message: string, status = 400, details?: unknown): Response {
  const body: { success: false; error: string; details?: unknown } = {
    success: false,
    error: message,
  };
  if (details !== undefined) body.details = details;

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getSecurityHeaders(),
    },
  });
}

export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: Response }> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return {
      error: apiError('Invalid JSON in request body.', 400),
    };
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      error: apiError(
        firstIssue?.message ?? 'Request body validation failed.',
        400,
        result.error.issues
      ),
    };
  }

  return { data: result.data };
}

export async function requireAuth(
  request?: Request
): Promise<{ user: import('./auth/session').AuthUser } | { error: Response }> {
  const user = await getAuthUser(request);
  if (!user) {
    return { error: apiError('Authentication required.', 401) };
  }
  return { user };
}

export async function requireAdmin(
  request: Request,
  permission?: string
): Promise<{ session: import('./auth/session').AdminSession } | { error: Response }> {
  const session = await getAdminSession(request);

  if (!session) {
    return { error: apiError('Admin authentication required.', 401) };
  }

  if (permission) {
    const permError = assertPermission(session, permission);
    if (permError) return { error: permError };
  }

  return { session };
}

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export function getPagination(searchParams: URLSearchParams): Pagination {
  const rawPage  = parseInt(searchParams.get('page')  ?? '1',  10);
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);

  const page  = isNaN(rawPage)  || rawPage  < 1  ? 1   : rawPage;
  const limit = isNaN(rawLimit) || rawLimit < 1  ? 20  :
                rawLimit > 100                    ? 100 : rawLimit;

  return { page, limit, offset: (page - 1) * limit };
}

export interface AuditLogEntry {
  action:      string;
  actor_type:  'member' | 'admin' | 'system';
  actor_id?:   string;
  target_type?: string;
  target_id?:  string;
  details:     Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export function buildAuditEntry(params: {
  action:      string;
  actorType:   'member' | 'admin' | 'system';
  actorId?:    string;
  targetType?: string;
  targetId?:   string;
  details?:    Record<string, unknown>;
  request?:    Request;
}): AuditLogEntry {
  const { action, actorType, actorId, targetType, targetId, details = {}, request } = params;

  const entry: AuditLogEntry = {
    action,
    actor_type:  actorType,
    details,
  };

  if (actorId)     entry.actor_id    = actorId;
  if (targetType)  entry.target_type = targetType;
  if (targetId)    entry.target_id   = targetId;

  if (request) {
    const h = (name: string) => request.headers.get(name);
    const ip =
      h('cf-connecting-ip') ??
      h('x-real-ip') ??
      h('x-forwarded-for')?.split(',')[0]?.trim() ??
      undefined;

    if (ip) entry.ip_address = ip;
    const ua = h('user-agent');
    if (ua) entry.user_agent = ua;
  }

  return entry;
}
