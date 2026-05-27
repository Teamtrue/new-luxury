# Publish Notes

## 2026-05-27 - Initial Local Foundation Publish

Publisher: super man 🦸‍♂️

Target repo: `Teamtrue/new-luxury`

### Included

- Monorepo structure for web, mobile, worker, shared, config, and database packages.
- Imported prior PlutusClub web/admin/API work into `apps/web`.
- Imported onboarding design handoff into `docs/design_handoff_signup_flow`.
- Expo mobile app with onboarding, OTP, biometric unlock, mandatory update gate, offline banner, Sentry setup, secure token storage, and tab shell.
- PostgreSQL/Supabase migrations, including reliability tables for idempotency, webhook replay, job outbox, app versions, push subscriptions, account deletion, and membership-payment linking.
- Worker scaffold for queue-backed jobs.
- Production notes, mobile strategy, attachment review, test strategy, and local build status.

### Verification Before Publish

- `packages/shared` typecheck passed.
- `packages/config` typecheck passed.
- `packages/db` typecheck passed.
- Active unsafe mock payment order path was removed.
- Active admin dev shortcut was removed.
- Production Redis rate limiting fails closed when Redis is missing.
- Full workspace install completed with `pnpm@9.15.0`; `pnpm-lock.yaml` is now present.
- `apps/web` typecheck passed.
- `apps/web` unit tests passed: 3 files, 11 tests.
- `packages/shared`, `packages/config`, and `packages/db` typechecks passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` now pass locally.
- Production preview smoke check passes on `http://127.0.0.1:3002/` and `/signin` with local placeholder env values.
- Browser OTP sign-in now stores the returned Supabase session before redirect.
- Admin session cookie scope is corrected for `/api/admin/*` calls and logout clearing.
- Browser CSRF issuance/helper is added and wired into key mutation flows.
- Razorpay signature verification now fails closed on missing secret and uses timing-safe comparison.
- Next.js startup now runs the production required-env assertion through `instrumentation.ts`.

### Publish State

- Full source-only tree is prepared locally at `/private/tmp/new-luxury-publish/source-20260527`.
- Clean local Git commit is prepared at `/private/tmp/new-luxury-publish/repo`:
  - `276a4c1` — `super man 🦸‍♂️: publish production foundation`
  - `81c791e` — `super man 🦸‍♂️: harden production checkpoint`
- Clean source file count prepared for publish: 214 files.
- Generated folders were excluded: `node_modules`, `.next`, `dist`, and `tsconfig.tsbuildinfo`.
- GitHub connector upload layers completed:
  - Root workspace files and CI workflow.
  - Package manifests for web, mobile, worker, shared, config, and db.
  - `packages/shared`, `packages/config`, and `packages/db` source/config files.
  - `apps/worker` source/config files.
  - Full `apps/mobile` Expo source/config shell.
- Direct local Git push remains blocked by missing local GitHub HTTPS credentials and missing SSH deploy key.

### Known Non-Blocking Gaps

- `corepack` is not installed in the local shell; use `npx pnpm@9.15.0` or install pnpm before handoff.
- Mobile full native smoke testing still needs simulator/device execution.
- Current CI provisions Postgres and Redis but does not explicitly apply migrations.
- Current CI does not run coverage, E2E smoke tests, dependency scan, secret scan, or migration application checks.
- Store deep-link files need Apple Team ID and Android signing SHA-256 before production.
- Provider credentials, Supabase project values, Redis values, and Sentry DSN are not committed and must be supplied through environment configuration.
- Booking/payment/refund updates still need database transaction/RPC hardening.
- Provider credentials still need encrypted-at-rest implementation before real secrets are entered.
- Webhook retry processing needs to move from persisted event table to active worker reconciliation.

### Next Publish Target

- Upload `apps/web` foundation, tests, and API/page source layers through the GitHub connector.
- First checkpoint is complete locally: root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- Push the prepared local commits once local GitHub credentials or an SSH deploy key are available.
- Apply migrations `001` through `008` against a disposable database; keep `packages/db/migrations` as canonical and verify `apps/web/supabase/migrations` stays mirrored.
- Complete payment webhook replay tests and membership activation tests.
- Add integration tests with Postgres and Redis services.
- Wire mobile Razorpay checkout after backend order/verify tests are green.
