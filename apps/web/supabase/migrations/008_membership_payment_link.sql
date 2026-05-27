-- Link membership payments to the exact pending membership they activate.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_membership_id_idx
  ON payments (membership_id);

CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_membership_order_idx
  ON payments (membership_id)
  WHERE payment_type = 'membership' AND status IN ('created', 'authorized');

COMMENT ON COLUMN payments.membership_id IS
  'Pending membership activated by this payment after provider capture.';
