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

Local foundation is in progress and production-directed. Core package checks pass:

- `packages/shared`
- `packages/config`
- `packages/db`

The full project tree is prepared locally. Normal Git push is currently blocked by missing GitHub credentials in the local environment, so publish notes are kept here until the full tree can be pushed.

See:

- `docs/PUBLISH_NOTES.md`
- `docs/FAILURE_MAP.md`

Maintained by super man 🦸‍♂️.
