import { NextResponse } from "next/server";

/**
 * Deprecated compatibility endpoint.
 *
 * Membership payments must go through /api/payments/create-order so the same
 * auth, CSRF, idempotency, provider, audit, and webhook rules protect both
 * booking payments and membership payments.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Use /api/payments/create-order with { membership_tier }."
    },
    { status: 410 }
  );
}
