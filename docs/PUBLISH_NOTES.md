# Publish Notes

## 2026-05-27 - Initial Local Foundation Publish

Publisher: super man 🦸‍♂️

Target repo: `Teamtrue/new-luxury`

### Included In The Prepared Local Tree

- Monorepo structure for web, mobile, worker, shared, config, and database packages.
- Prior PlutusClub web/admin/API work under `apps/web`.
- Onboarding design handoff under `docs/design_handoff_signup_flow`.
- Expo mobile app with onboarding, OTP, biometric unlock, mandatory update gate, offline banner, Sentry setup, secure token storage, and tab shell.
- PostgreSQL/Supabase migrations, including reliability tables for idempotency, webhook replay, job outbox, app versions, push subscriptions, account deletion, and membership-payment linking.
- Worker scaffold for queue-backed jobs.
- Production notes, mobile strategy, attachment review, test strategy, and local build status.

### Verification Before Publish Attempt

- `packages/shared` typecheck passed.
- `packages/config` typecheck passed.
- `packages/db` typecheck passed.
- Active unsafe mock payment order path was removed.
- Active admin dev shortcut was removed.
- Production Redis rate limiting fails closed when Redis is missing.

### Publish State

- Repo initialized successfully.
- README and engineering notes were published through the GitHub connector.
- Full 204-file project commit was created locally in staging with message `super man 🦸‍♂️: publish production foundation`.
- Normal Git push is blocked because the local environment has no GitHub HTTPS credentials and no SSH deploy key.

### Known Non-Blocking Gaps

- Full monorepo install/build still needs pnpm available.
- Web and mobile full typecheck require installing all app dependencies.
- Store deep-link files need Apple Team ID and Android signing SHA-256 before production.
- Provider credentials, Supabase project values, Redis values, and Sentry DSN are not committed and must be supplied through environment configuration.

### Next Publish Target

- Push the prepared local tree once GitHub credentials are available locally.
- Complete payment webhook replay tests and membership activation tests.
- Add integration tests with Postgres and Redis services.
- Wire mobile Razorpay checkout after backend order/verify tests are green.
