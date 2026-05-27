import { apiError, apiSuccess } from "@/lib/api-helpers";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";

function assertInternalAuth(request: Request): Response | null {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  if (!expected) {
    return new Response(
      JSON.stringify({ success: false, error: "Internal job token not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${expected}`) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const authError = assertInternalAuth(request);
  if (authError) return authError;

  const db = createServiceRoleClient();
  const now = new Date().toISOString();
  let processed = 0;

  try {
    const { data: requests, error } = await db
      .from("account_deletion_requests")
      .select("id, user_id")
      .eq("status", "identity_verified")
      .order("verified_at", { ascending: true })
      .limit(25);

    if (error) {
      console.error("[account/deletion/process] fetch error:", error.message);
      return apiError("Failed to fetch deletion requests.", 500);
    }

    for (const deletion of requests ?? []) {
      await db
        .from("account_deletion_requests")
        .update({ status: "processing" })
        .eq("id", deletion.id)
        .eq("status", "identity_verified");

      await db
        .from("push_subscriptions")
        .update({ is_active: false, token: `deleted:${deletion.id}` })
        .eq("user_id", deletion.user_id);

      await db
        .from("user_profiles")
        .update({
          full_name: "Deleted Member",
          phone: `deleted:${deletion.id}`,
          avatar_url: null
        })
        .eq("id", deletion.user_id);

      await db
        .from("account_deletion_requests")
        .update({
          status: "completed",
          completed_at: now,
          retained_reason: "Financial, invoice, payment, fraud, and audit records retained as legally required with personal profile anonymized."
        })
        .eq("id", deletion.id);

      await logAudit({
        action: "member.deleted",
        actor_type: "system",
        actor_id: deletion.user_id,
        target_type: "account_deletion_request",
        target_id: deletion.id,
        details: { event: "deletion_completed" }
      });

      processed++;
    }

    return apiSuccess({ processed, ran_at: now });
  } catch (error) {
    console.error("[account/deletion/process] unexpected:", error);
    return apiError("Internal server error.", 500);
  }
}
