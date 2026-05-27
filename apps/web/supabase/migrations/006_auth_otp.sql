-- =============================================================================
-- PlutusClub – Migration 006: auth_otp table
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS auth_otp (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT        NOT NULL,
  otp_hash      TEXT        NOT NULL,
  purpose       TEXT        NOT NULL CHECK (purpose IN ('signin', 'verify')),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  attempt_count INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  auth_otp IS 'Stores hashed OTPs for phone-based authentication. Service role only; never expose to client.';
COMMENT ON COLUMN auth_otp.otp_hash IS 'SHA-256 hash of the raw OTP — the plaintext OTP is never stored at rest.';
COMMENT ON COLUMN auth_otp.purpose IS 'Flow that triggered this OTP: signin (login flow) or verify (phone verification).';
COMMENT ON COLUMN auth_otp.used_at IS 'Timestamp when the OTP was successfully verified or manually invalidated. NULL = still active.';
COMMENT ON COLUMN auth_otp.attempt_count IS 'Number of verification attempts made against this OTP. Burned after 3 failed attempts.';

CREATE INDEX IF NOT EXISTS idx_auth_otp_phone_purpose
  ON auth_otp (phone, purpose, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_otp_expires
  ON auth_otp (expires_at);

ALTER TABLE auth_otp ENABLE ROW LEVEL SECURITY;

COMMIT;
