import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from("app_versions")
      .select("platform, minimum_version, latest_version, store_url")
      .in("platform", ["ios", "android"]);

    if (error) {
      throw error;
    }

    const byPlatform = Object.fromEntries((data ?? []).map((row) => [row.platform, row]));
    const ios = byPlatform.ios as Record<string, string> | undefined;
    const android = byPlatform.android as Record<string, string> | undefined;

    return NextResponse.json({
      minimum_version: {
        ios: ios?.minimum_version ?? "1.0.0",
        android: android?.minimum_version ?? "1.0.0"
      },
      latest_version: {
        ios: ios?.latest_version ?? "1.0.0",
        android: android?.latest_version ?? "1.0.0"
      },
      ios_url: ios?.store_url ?? "https://apps.apple.com/app/plutusclub",
      android_url: android?.store_url ?? "https://play.google.com/store/apps/details?id=in.plutusclub.app"
    });
  } catch {
    return NextResponse.json({
      minimum_version: {
        ios: "1.0.0",
        android: "1.0.0"
      },
      latest_version: {
        ios: "1.0.0",
        android: "1.0.0"
      },
      ios_url: "https://apps.apple.com/app/plutusclub",
      android_url: "https://play.google.com/store/apps/details?id=in.plutusclub.app"
    });
  }
}
