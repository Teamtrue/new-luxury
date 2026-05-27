/**
 * lib/supabase/service.ts
 * ---------------------------------------------------------------------------
 * Supabase service-role client for privileged server-side operations.
 * ---------------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
      detectSessionInUrl: false,
    },
  });
}
