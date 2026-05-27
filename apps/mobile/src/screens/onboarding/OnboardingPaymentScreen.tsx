import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { apiFetch } from "../../lib/api";
import { colors, spacing } from "../../theme";

const prices: Record<string, number> = {
  silver: 999,
  gold: 3999,
  platinum: 9999,
  obsidian: 24999
};

interface ProfileParams {
  name: string;
  email: string;
  city: string;
  phone: string;
}

export function OnboardingPaymentScreen({ navigation, route }: { navigation: { navigate: (screen: string, params?: unknown) => void }; route: { params?: { tier?: string; profile?: ProfileParams } } }) {
  const tier = route.params?.tier ?? "platinum";
  const [method, setMethod] = useState("upi");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const price = prices[tier] ?? prices.platinum;

  async function preparePayment() {
    const profile = route.params?.profile;
    if (!profile?.phone) {
      setMessage("Profile session missing. Please restart signup.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/api/members", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          tier
        })
      });

      const order = await apiFetch<{ order_id: string }>("/api/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ membership_tier: tier })
      });

      setMessage(`Secure payment order ready: ${order.order_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare payment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 16, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="06" kicker="Activation" title={<>Activate your{"\n"}{tier} tier.</>} />
      <Text style={{ color: colors.mute, fontSize: 13, lineHeight: 20 }}>
        Payment orders are created on the server and activation happens only after provider confirmation.
      </Text>

      <View style={{ backgroundColor: "#fff", borderRadius: 4, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
        <Text style={{ color: colors.goldDeep, fontSize: 10, fontWeight: "700", letterSpacing: 2 }}>PLUTUSCLUB · {tier.toUpperCase()}</Text>
        <Text style={{ color: colors.obsidian, fontSize: 20 }}>Annual Membership</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.mute }}>Total due</Text>
          <Text style={{ color: colors.obsidian, fontSize: 30, fontWeight: "500" }}>₹{price.toLocaleString("en-IN")}</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {["upi", "card", "netbanking"].map((item) => (
          <Pressable
            key={item}
            onPress={() => setMethod(item)}
            style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 4, borderWidth: 1, borderColor: method === item ? colors.obsidian : colors.line, backgroundColor: "#fff", paddingHorizontal: 14 }}
          >
            <Text style={{ color: colors.obsidian, textTransform: "uppercase", letterSpacing: 1.4 }}>{item}</Text>
            <Text style={{ color: method === item ? colors.goldDeep : colors.mute }}>{method === item ? "●" : "○"}</Text>
          </Pressable>
        ))}
      </View>

      {message ? <Text style={{ color: message.includes("ready") ? colors.goldDeep : colors.danger, fontSize: 12, lineHeight: 18 }}>{message}</Text> : null}

      <PrimaryButton disabled={loading} onPress={preparePayment}>
        {loading ? "Preparing..." : "Prepare Secure Payment"}
      </PrimaryButton>
    </View>
  );
}
