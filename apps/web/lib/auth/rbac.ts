/**
 * lib/auth/rbac.ts
 * ---------------------------------------------------------------------------
 * Role-Based Access Control (RBAC) for the PlutusClub admin console.
 * ---------------------------------------------------------------------------
 */

import type { AdminSession } from './session';

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'finance' | 'partner_manager';

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],

  admin: [
    'members:read',
    'members:write',
    'members:suspend',
    'deals:read',
    'deals:write',
    'deals:approve',
    'bookings:read',
    'bookings:refund',
    'disputes:read',
    'disputes:resolve',
    'refunds:read',
    'refunds:approve',
    'analytics:read',
    'providers:read',
    'notifications:send',
    'audit:read',
  ],

  support: [
    'members:read',
    'members:suspend',
    'bookings:read',
    'disputes:read',
    'disputes:resolve',
    'refunds:read',
  ],

  finance: [
    'bookings:read',
    'payments:read',
    'payments:reconcile',
    'refunds:read',
    'refunds:approve',
    'analytics:read',
  ],

  partner_manager: [
    'deals:read',
    'deals:write',
    'analytics:read',
  ],
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  const grants = ROLE_PERMISSIONS[role];
  if (!grants) return false;
  if (grants.includes('*')) return true;
  return grants.includes(permission);
}

export function assertPermission(session: AdminSession, permission: string): Response | null {
  if (!hasPermission(session.role as AdminRole, permission)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Forbidden: your role (${session.role}) does not have the '${permission}' permission.`,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null;
}

export function listPermissions(role: AdminRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function canAccessResource(role: AdminRole, resource: string): boolean {
  const grants = ROLE_PERMISSIONS[role] ?? [];
  if (grants.includes('*')) return true;
  return grants.some((p) => p.startsWith(`${resource}:`));
}
