-- Platform reliability layer for idempotency, webhook replay, worker outbox,
-- mobile version gates, and compliant deletion workflows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'dead_letter');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deletion_status') THEN
    CREATE TYPE deletion_status AS ENUM ('requested', 'identity_verified', 'processing', 'completed', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope             TEXT NOT NULL,
  key_hash          TEXT NOT NULL,
  actor_type        actor_type NOT NULL DEFAULT 'member',
  actor_id          UUID,
  request_hash      TEXT NOT NULL,
  response_status   INTEGER,
  response_body     JSONB,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  UNIQUE (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_actor_idx
  ON idempotency_keys (actor_type, actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL,
  provider_event_id   TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  signature           TEXT NOT NULL,
  payload             JSONB NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ,
  processing_error    TEXT,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_unprocessed_idx
  ON payment_webhook_events (received_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS job_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name      TEXT NOT NULL,
  job_name        TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          job_status NOT NULL DEFAULT 'queued',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_outbox_ready_idx
  ON job_outbox (queue_name, run_after, created_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS app_versions (
  platform          TEXT PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  minimum_version   TEXT NOT NULL,
  latest_version    TEXT NOT NULL,
  store_url         TEXT NOT NULL,
  force_update_note TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id     TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, device_id)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_token_idx
  ON push_subscriptions (token)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  status            deletion_status NOT NULL DEFAULT 'requested',
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at       TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  retained_reason   TEXT,
  audit_log_id      UUID REFERENCES audit_logs(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_user_idx
  ON account_deletion_requests (user_id, requested_at DESC);

SELECT _attach_updated_at_trigger('job_outbox');
SELECT _attach_updated_at_trigger('push_subscriptions');
