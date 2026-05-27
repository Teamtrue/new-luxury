/**
 * app/api/admin/providers/route.ts
 * ---------------------------------------------------------------------------
 * Admin: list and manage payment/SMS/email provider configurations.
 *
 * GET  /api/admin/providers — list all providers grouped by type
 * POST /api/admin/providers — activate / deactivate / update_config / toggle_test_mode
 *
 * SECURITY CRITICAL: never return config_encrypted or webhook_secret_encrypted.
 * ---------------------------------------------------------------------------
 */

import { z }                           from 'zod';
import { apiSuccess, apiError, requireAdmin, buildAuditEntry } from '@/lib/api-helpers';
import { assertCsrf }                  from '@/lib/security/csrf';
import { createServiceRoleClient }     from '@/lib/supabase/service';
import { invalidateProviderCache }     from '@/lib/providers/config';
import type { ProviderType }           from '@/lib/providers/types';

// ---------------------------------------------------------------------------
// Required config fields per provider name
// ---------------------------------------------------------------------------

const REQUIRED_CONFIG_FIELDS: Record<string, string[]> = {
  razorpay:  ['key_id', 'key_secret', 'webhook_secret'],
  stripe:    ['publishable_key', 'secret_key', 'webhook_secret'],
  payu:      ['merchant_key', 'merchant_salt'],
  msg91:     ['auth_key', 'sender_id', 'otp_template_id'],
  twilio:    ['account_sid', 'auth_token', 'from_number'],
  smtp:      ['host', 'port', 'user', 'pass', 'from_email', 'from_name'],
  sendgrid:  ['api_key', 'from_email', 'from_name'],
};

// ---------------------------------------------------------------------------
// Shape of a safe (credential-stripped) provider row for API responses
// ---------------------------------------------------------------------------

interface SafeProviderRow {
  id:               string;
  provider_type:    string;
  provider_name:    string;
  display_name:     string;
  is_active:        boolean;
  is_test_mode:     boolean;
  has_credentials:  boolean;
  created_at:       string;
  updated_at:       string;
}

// DB row type (includes sensitive columns that must be stripped before responding)
interface RawProviderRow {
  id:                       string;
  provider_type:            string;
  provider_name:            string;
  display_name:             string;
  is_active:                boolean;
  is_test_mode:             boolean;
  config_encrypted:         Record<string, string> | null;
  webhook_secret_encrypted: string | null;
  created_at:               string;
  updated_at:               string;
}

function toSafeRow(row: RawProviderRow): SafeProviderRow {
  return {
    id:               row.id,
    provider_type:    row.provider_type,
    provider_name:    row.provider_name,
    display_name:     row.display_name,
    is_active:        row.is_active,
    is_test_mode:     row.is_test_mode,
    has_credentials:  Boolean(
      row.config_encrypted &&
      typeof row.config_encrypted === 'object' &&
      Object.keys(row.config_encrypted).length > 0
    ),
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };
}

function groupByType(rows: SafeProviderRow[]) {
  const groups: Record<string, SafeProviderRow[]> = {
    payment_gateway: [],
    sms:             [],
    email:           [],
  };
  for (const row of rows) {
    if (groups[row.provider_type]) {
      groups[row.provider_type].push(row);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// GET /api/admin/providers
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, 'providers:read');
  if ('error' in auth) return auth.error;

  try {
    const db = createServiceRoleClient();

    const { data, error } = await db
      .from('provider_config')
      .select('id, provider_type, provider_name, display_name, is_active, is_test_mode, config_encrypted, webhook_secret_encrypted, created_at, updated_at')
      .order('provider_type')
      .order('provider_name');

    if (error) {
      console.error('[admin/providers] GET query error:', error.message);
      return apiError('Failed to fetch provider configuration.', 500);
    }

    const safeRows = (data as RawProviderRow[]).map(toSafeRow);
    return apiSuccess(groupByType(safeRows));
  } catch (err) {
    console.error('[admin/providers] GET unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/providers
// ---------------------------------------------------------------------------

const providerActionSchema = z.object({
  provider_type: z.enum(['payment_gateway', 'sms', 'email']),
  provider_name: z.string().min(1, 'provider_name is required.'),
  action: z.enum(['activate', 'deactivate', 'update_config', 'toggle_test_mode']),
  config:        z.record(z.string(), z.string()).optional(),
  is_test_mode:  z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  // 1. Require admin with providers:write permission
  const auth = await requireAdmin(request, 'providers:write');
  if ('error' in auth) return auth.error;
  const { session } = auth;

  // 2. CSRF check
  const csrfError = assertCsrf(request, session.id);
  if (csrfError) return csrfError;

  // 3. Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON in request body.', 400);
  }

  const parsed = providerActionSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? 'Validation failed.', 400, parsed.error.issues);
  }

  const { provider_type, provider_name, action, config, is_test_mode } = parsed.data;

  const db = createServiceRoleClient();

  try {
    switch (action) {
      // -----------------------------------------------------------------------
      case 'update_config': {
        if (!config) {
          return apiError('config object is required for update_config action.', 400);
        }

        const requiredFields = REQUIRED_CONFIG_FIELDS[provider_name];
        if (requiredFields) {
          const missing = requiredFields.filter(
            (f) => f !== 'webhook_secret' && !config[f]
          );
          if (missing.length > 0) {
            return apiError(
              `Missing required config fields for ${provider_name}: ${missing.join(', ')}`,
              400
            );
          }
        }

        // Separate webhook_secret from the rest of the config
        // TODO: V2 — encrypt config with AES-256-GCM before storing
        const { webhook_secret, ...credentialConfig } = config;

        const updatePayload: Record<string, unknown> = {
          config_encrypted:       credentialConfig,
          updated_by_admin_id:    session.adminUserId,
        };
        if (webhook_secret) {
          updatePayload.webhook_secret_encrypted = webhook_secret;
        }

        const { error } = await db
          .from('provider_config')
          .update(updatePayload)
          .eq('provider_type', provider_type)
          .eq('provider_name', provider_name);

        if (error) {
          console.error('[admin/providers] update_config error:', error.message);
          return apiError('Failed to update provider config.', 500);
        }

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'provider.config_updated',
            actorType:  'admin',
            actorId:    session.adminUserId,
            targetType: 'provider_config',
            details:    { provider_type, provider_name, fields_updated: Object.keys(credentialConfig) },
            request,
          })
        );
        break;
      }

      // -----------------------------------------------------------------------
      case 'activate': {
        // Call the DB function that atomically swaps active providers.
        const { error } = await db.rpc('activate_provider', {
          p_provider_type: provider_type,
          p_provider_name: provider_name,
          p_admin_id:      session.adminUserId,
        });

        if (error) {
          console.error('[admin/providers] activate_provider RPC error:', error.message);
          if (error.message.includes('no_data_found') || error.message.includes('not found')) {
            return apiError(`Provider '${provider_name}' not found in ${provider_type}.`, 404);
          }
          return apiError('Failed to activate provider.', 500);
        }

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'provider.activated',
            actorType:  'admin',
            actorId:    session.adminUserId,
            targetType: 'provider_config',
            details:    { provider_type, provider_name },
            request,
          })
        );
        break;
      }

      // -----------------------------------------------------------------------
      case 'deactivate': {
        const { error } = await db.rpc('deactivate_provider', {
          p_provider_type: provider_type,
          p_admin_id:      session.adminUserId,
        });

        if (error) {
          console.error('[admin/providers] deactivate_provider RPC error:', error.message);
          return apiError('Failed to deactivate provider.', 500);
        }

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'provider.deactivated',
            actorType:  'admin',
            actorId:    session.adminUserId,
            targetType: 'provider_config',
            details:    { provider_type, provider_name },
            request,
          })
        );
        break;
      }

      // -----------------------------------------------------------------------
      case 'toggle_test_mode': {
        if (is_test_mode === undefined) {
          return apiError('is_test_mode (boolean) is required for toggle_test_mode action.', 400);
        }

        const { error } = await db.rpc('toggle_provider_test_mode', {
          p_provider_type: provider_type,
          p_provider_name: provider_name,
          p_test_mode:     is_test_mode,
          p_admin_id:      session.adminUserId,
        });

        if (error) {
          console.error('[admin/providers] toggle_provider_test_mode RPC error:', error.message);
          if (error.message.includes('not found')) {
            return apiError(`Provider '${provider_name}' not found.`, 404);
          }
          return apiError('Failed to toggle test mode.', 500);
        }

        await db.from('audit_logs').insert(
          buildAuditEntry({
            action:     'provider.test_mode_toggled',
            actorType:  'admin',
            actorId:    session.adminUserId,
            targetType: 'provider_config',
            details:    { provider_type, provider_name, is_test_mode },
            request,
          })
        );
        break;
      }
    }

    // 4. Invalidate provider cache so next request picks up fresh config.
    invalidateProviderCache(provider_type as ProviderType);

    // 5. Return updated provider list (safe — no credentials)
    const { data: updatedRows, error: fetchError } = await db
      .from('provider_config')
      .select('id, provider_type, provider_name, display_name, is_active, is_test_mode, config_encrypted, webhook_secret_encrypted, created_at, updated_at')
      .order('provider_type')
      .order('provider_name');

    if (fetchError) {
      console.error('[admin/providers] POST re-fetch error:', fetchError.message);
      return apiSuccess({ message: 'Action completed.' });
    }

    const safeRows = (updatedRows as RawProviderRow[]).map(toSafeRow);
    return apiSuccess(groupByType(safeRows));
  } catch (err) {
    console.error('[admin/providers] POST unexpected error:', err);
    return apiError('An unexpected error occurred.', 500);
  }
}
