import { z } from "zod";
import { apiError, apiSuccess, parseBody, requireAuth } from "@/lib/api-helpers";
import { createServiceRoleClient } from "@/lib/supabase/service";

const pushSubscribeSchema = z.object({
  token: z.string().min(16),
  platform: z.enum(["android", "ios"]),
  device_id: z.string().min(1).max(200)
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = await parseBody(request, pushSubscribeSchema);
  if ("error" in parsed) {
    return parsed.error;
  }

  const db = createServiceRoleClient();

  try {
    const { error } = await db.from("push_subscriptions").upsert(
      {
        user_id: auth.user.id,
        token: parsed.data.token,
        platform: parsed.data.platform,
        device_id: parsed.data.device_id,
        is_active: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,platform,device_id" }
    );

    if (error) {
      console.error("[POST /api/push/subscribe] db error:", error.message);
      return apiError("Failed to save push subscription.", 500);
    }

    return apiSuccess({ subscribed: true });
  } catch (error) {
    console.error("[POST /api/push/subscribe] unexpected:", error);
    return apiError("Internal server error.", 500);
  }
}
