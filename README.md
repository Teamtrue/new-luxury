# new-luxury

PlutusClub production rebuild: web, admin, backend, workers, and mobile apps.

## Stack

- Next.js + TypeScript for web, admin, and REST APIs.
- PostgreSQL/Supabase for durable membership, payment, audit, and compliance data.
- Redis for rate limits, idempotency, caching, and queue infrastructure.
- BullMQ-style workers for webhooks, notifications, reconciliation, refunds, and lifecycle jobs.
- React Native + Expo for Android and iOS.
- Shared TypeScript packages for contracts, validation, tier logic, currency helpers, config, and database utilities.

## Repository Shape

- `apps/web`: Next.js product site, member area, admin, and API.
- `apps/mobile`: Expo mobile app.
- `apps/worker`: queue worker scaffold.
- `packages/shared`: shared contracts and utilities.
- `packages/config`: strict environment parsing.
- `packages/db`: database helper and canonical migrations.
- `docs`: architecture, strategy, review, status, and design handoff notes.

## Current Status

Local foundation is built and production-directed. The clean source tree is prepared locally with 214 source files, excluding generated folders such as `node_modules`, `.next`, `dist`, and TypeScript build info.

Local verification currently passes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Prepared local commits:

- `276a4c1` — `super man 🦸‍♂️: publish production foundation`
- `81c791e` — `super man 🦸‍♂️: harden production checkpoint`

GitHub connector remains connected and repo notes are updated. Direct full-tree Git push from this machine is currently blocked by missing local GitHub HTTPS credentials and missing SSH deploy key.

See:

- `docs/PUBLISH_NOTES.md`
- `docs/FAILURE_MAP.md`

Maintained by super man 🦸‍♂️.
