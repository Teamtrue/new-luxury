/**
 * lib/providers/config.ts
 *
 * Database-backed provider configuration loader with an in-memory cache.
 *
 * Uses the Supabase service-role client to query provider_config directly
 * (bypassing RLS – safe here because this only runs server-side).
 *
 * Cache TTL is 5 minutes.  Call invalidateProviderCache() after the admin
 * changes a provider so the next request picks up fresh credentials.
 *
 * TODO: V2 — decrypt config_encrypted with AES-256-GCM before returning;
 *       use PROVIDER_ENCRYPTION_KEY env var as the key material.
 */

import { createClient } from '@supabase/supabase-js'
import type { ProviderConfig, ProviderType } from './types'

// ---------------------------------------------------------------------------
// Service-role Supabase client (never expose to browser)
// ---------------------------------------------------------------------------

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  value: ProviderConfig | null
  expiresAt: number
}

/** Keyed by ProviderType string */
const cache = new Map<ProviderType, CacheEntry>()

function getCached(type: ProviderType): ProviderConfig | null | undefined {
  const entry = cache.get(type)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(type)
    return undefined
  }
  return entry.value
}

function setCached(type: ProviderType, value: ProviderConfig | null): void {
  cache.set(type, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ---------------------------------------------------------------------------
// Shape of a raw provider_config row from Supabase
// ---------------------------------------------------------------------------

interface RawProviderConfigRow {
  id: string
  provider_type: string
  provider_name: string
  is_active: boolean
  is_test_mode: boolean
  /**
   * In V1 this is the raw (unencrypted) JSONB credentials object.
   * TODO: V2 — This will be an AES-256-GCM encrypted string; decrypt before use.
   */
  config_encrypted: Record<string, string> | null
  webhook_secret_encrypted: string | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the active ProviderConfig for the given provider type.
 * Returns null if no active provider is configured.
 *
 * Results are cached for 5 minutes.  On cache miss the DB is queried via the
 * service-role client so credentials are never exposed to the browser.
 */
export async function loadProviderConfig(
  type: ProviderType
): Promise<ProviderConfig | null> {
  // Check in-memory cache first
  const cached = getCached(type)
  if (cached !== undefined) {
    return cached
  }

  // Cache miss – hit the DB
  const supabase = getServiceRoleClient()

  const { data, error } = await supabase
    .from('provider_config')
    .select(
      'id, provider_type, provider_name, is_active, is_test_mode, config_encrypted, webhook_secret_encrypted'
    )
    .eq('provider_type', type)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle<RawProviderConfigRow>()

  if (error) {
    // Log but don't crash – treat as unconfigured; caller should throw ProviderNotConfiguredError
    console.error(
      `[providers/config] Failed to load ${type} config from DB:`,
      error.message
    )
    setCached(type, null)
    return null
  }

  if (!data) {
    setCached(type, null)
    return null
  }

  const config: ProviderConfig = {
    id: data.id,
    providerType: type,
    providerName: data.provider_name,
    isActive: data.is_active,
    isTestMode: data.is_test_mode,
    // V1: config_encrypted is stored as plain JSONB; cast to Record<string,string>
    // TODO: V2 — decrypt data.config_encrypted with AES-256-GCM here
    config: (data.config_encrypted as Record<string, string>) ?? {},
    webhookSecret: data.webhook_secret_encrypted ?? undefined,
  }

  setCached(type, config)
  return config
}

/**
 * Removes cached provider config entries.
 *
 * Call this immediately after the admin activates/deactivates/updates a
 * provider in the admin panel so that the next API call picks up fresh
 * credentials.
 *
 * @param type  If provided, only invalidates the cache for that type.
 *              If omitted, the entire provider cache is cleared.
 */
export function invalidateProviderCache(type?: ProviderType): void {
  if (type) {
    cache.delete(type)
  } else {
    cache.clear()
  }
}
