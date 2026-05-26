# Failure Map

This file tracks known production risks and how the current prepared local tree handles them.

## Fixed Or Reduced

| Risk | Current Protection |
|---|---|
| Client-controlled admin role | Active admin login resolves admin user server-side through Supabase/Auth and `admin_users`. |
| Dev admin shortcut | Removed from active `apps/web` route. |
| Missing Redis in production | Rate limiting fails closed instead of falling back to process memory. |
| Membership activated before payment | Membership stays pending and activates only after verified payment or webhook capture. |
| Webhook replay | Events are persisted in `payment_webhook_events`; duplicate provider events are skipped. |
| Payment amount mismatch | Captured webhook with mismatched amount marks payment failed and audits the mismatch. |
| Payment order not persisted | Order creation fails if payment record insert fails. |
| Account deletion as memory flag | Durable deletion request/status/process workflow added. |
| Mobile bearer auth incompatibility | Backend member auth accepts `Authorization: Bearer` for mobile REST calls. |

## Still To Verify With Tests

| Area | Required Test |
|---|---|
| Admin auth | Non-admin credentials cannot access admin routes. |
| OTP | Expired/replayed OTP fails, valid OTP creates usable mobile bearer session. |
| Rate limits | Two app instances share Redis limits. |
| Payments | Duplicate order creation returns stable existing order. |
| Webhooks | Duplicate webhook is a no-op. |
| Webhooks | Amount mismatch does not activate booking or membership. |
| Membership | Membership activates only after captured payment. |
| Deletion | Personal profile/push data anonymizes while required audit/finance records remain. |
| Mobile | 401 clears SecureStore and returns to auth flow. |
| Mobile | Offline dashboard shows cached data with last-updated banner. |

## Operational Blockers

- Real Supabase project and secrets.
- Redis/Upstash configuration.
- Razorpay provider configuration.
- Sentry DSN.
- Apple Team ID and Android signing certificate SHA-256 for universal/app links.
- pnpm lockfile generated from a clean install.
- Local GitHub credentials or deploy key for pushing the prepared full project tree.
