import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { fmtINR } from "@plutusclub/shared";
import { apiFetch } from "../../lib/api";
import { relativeMinutes } from "../../lib/time";

export function DashboardScreen() {
  const netInfo = useNetInfo();
  const profile = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<{ name: string; tier: string; tokenBalance: number; savingsThisYear: number }>("/api/members/me")
  });
  const lastUpdatedAt = profile.dataUpdatedAt ? relativeMinutes(profile.dataUpdatedAt) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0A12" }}
      contentContainerStyle={{ gap: 16, padding: 20 }}
      refreshControl={<RefreshControl refreshing={profile.isFetching} onRefresh={profile.refetch} tintColor="#C9A961" />}
    >
      {netInfo.isConnected === false ? (
        <View style={{ borderRadius: 4, backgroundColor: "#2A2417", padding: 10 }}>
          <Text style={{ color: "#C9A961", fontSize: 12 }}>
            Offline mode{lastUpdatedAt ? ` · Last updated ${lastUpdatedAt}` : ""}
          </Text>
        </View>
      ) : null}
      <Text style={{ color: "#F7F1DF", fontSize: 24, fontWeight: "700" }}>Hello {profile.data?.name ?? "Member"}</Text>
      <View style={{ gap: 8, borderRadius: 8, backgroundColor: "#15131D", padding: 16 }}>
        <Text style={{ color: "#C9A961", fontSize: 14 }}>{profile.data?.tier ?? "silver"}</Text>
        <Text style={{ color: "#F7F1DF", fontSize: 36, fontWeight: "700" }}>{profile.data?.tokenBalance ?? 0} tokens</Text>
        <Text style={{ color: "#B9B4C7" }}>Saved {fmtINR(profile.data?.savingsThisYear ?? 0)} this year</Text>
      </View>
    </ScrollView>
  );
}
