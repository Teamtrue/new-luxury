import { z } from "zod";
import { apiError, apiSuccess, parseBody, requireAuth } from "@/lib/api-helpers";
import { assertCsrf } from "@/lib/security/csrf";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { getClientIP } from "@/lib/security/rate-limit";

const deletionRequestSchema = z.object({
  reason: z.string().max(500).optional(),
  confirm: z.literal(true)
});

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const db = createServiceRoleClient();

  try {
    const { data, error } = await db
      .from("account_deletion_requests")
      .select("id, status, requested_at, verified_at, completed_at, retained_reason")
      .eq("user_id", auth.user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/account/deletion] db error:", error.message);
      return apiError("Failed to fetch deletion request.", 500);
    }

    return apiSuccess({ request: data ?? null });
  } catch (error) {
    console.error("[GET /api/account/deletion] unexpected:", error);
    return apiError("Internal server error.", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const csrfError = assertCsrf(request, auth.user.id);
  if (csrfError) return csrfError;

  const parsed = await parseBody(request, deletionRequestSchema);
  if ("error" in parsed) return parsed.error;

  const db = createServiceRoleClient();
  const ip = getClientIP(request);

  try {
    const { data: existing, error: existingError } = await db
      .from("account_deletion_requests")
      .select("id, status")
      .eq("user_id", auth.user.id)
      .in("status", ["requested", "identity_verified", "processing"])
      .maybeSingle();

    if (existingError) {
      console.error("[POST /api/account/deletion] lookup error:", existingError.message);
      return apiError("Failed to check existing deletion request.", 500);
    }

    if (existing) {
      return apiSuccess({ request_id: existing.id, status: existing.status });
    }

    const { data: created, error: insertError } = await db
      .from("account_deletion_requests")
      .insert({
        user_id: auth.user.id,
        status: "requested",
        metadata: {
          reason: parsed.data.reason ?? null,
          requested_from: "api"
        }
      })
      .select("id, status")
      .single();

    if (insertError || !created) {
      console.error("[POST /api/account/deletion] insert error:", insertError?.message);
      return apiError("Failed to create deletion request.", 500);
    }

    await logAudit({
      action: "member.deleted",
      actor_type: "member",
      actor_id: auth.user.id,
      target_type: "account_deletion_request",
      target_id: created.id,
      details: {
        event: "deletion_requested",
        reason: parsed.data.reason ?? null
      },
      ip_address: ip,
      user_agent: request.headers.get("user-agent") ?? undefined
    });

    return apiSuccess({ request_id: created.id, status: created.status }, 201);
  } catch (error) {
    console.error("[POST /api/account/deletion] unexpected:", error);
    return apiError("Internal server error.", 500);
  }
}
