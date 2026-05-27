import { apiError, apiSuccess, requireAuth } from "@/lib/api-helpers";
import { createServiceRoleClient } from "@/lib/supabase/service";

type MembershipRow = {
  id: string;
  status: string;
  membership_plans: { slug?: string; name?: string } | { slug?: string; name?: string }[] | null;
};

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const db = createServiceRoleClient();

  try {
    const { data: profile, error: profileError } = await db
      .from("user_profiles")
      .select(
        `
          id,
          full_name,
          phone,
          memberships (
            id,
            status,
            membership_plans ( slug, name )
          )
        `
      )
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[GET /api/members/me] profile error:", profileError.message);
      return apiError("Failed to fetch member profile.", 500);
    }

    const rawMemberships = profile?.memberships as MembershipRow | MembershipRow[] | null | undefined;
    const memberships = (
      Array.isArray(rawMemberships) ? rawMemberships : [rawMemberships]
    ).filter((membership): membership is MembershipRow => Boolean(membership));
    const activeMembership = memberships.find((membership) => membership.status === "active") ?? memberships[0];
    const plan = activeMembership
      ? (Array.isArray(activeMembership.membership_plans)
        ? activeMembership.membership_plans[0]
        : activeMembership.membership_plans)
      : null;

    const { data: tokenRows } = await db
      .from("token_transactions")
      .select("amount")
      .eq("user_id", auth.user.id);

    const tokenBalance = (tokenRows ?? []).reduce(
      (sum: number, row: { amount: number }) => sum + row.amount,
      0
    );

    return apiSuccess({
      id: auth.user.id,
      name: profile?.full_name ?? "Member",
      phone: profile?.phone ?? auth.user.phone ?? "",
      tier: plan?.slug ?? "silver",
      tierName: plan?.name ?? "Silver",
      tokenBalance,
      savingsThisYear: 0
    });
  } catch (error) {
    console.error("[GET /api/members/me] unexpected:", error);
    return apiError("Internal server error.", 500);
  }
}
