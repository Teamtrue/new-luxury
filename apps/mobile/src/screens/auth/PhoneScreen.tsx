import { indianPhoneSchema } from "@plutusclub/shared";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { apiFetch } from "../../lib/api";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { colors, spacing } from "../../theme";

export function PhoneScreen({ navigation }: { navigation: { navigate: (screen: string, params: unknown) => void } }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    const parsed = indianPhoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone })
      });
      navigation.navigate("OTP", { phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 18, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="01" kicker="Identity" title={<>What's your{"\n"}number?</>} />
      <Text style={{ color: colors.mute, fontSize: 14, lineHeight: 21 }}>
        We'll send a one-time code to confirm. Your number is never shared with brands.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 56, borderColor: colors.obsidian, borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, backgroundColor: "#fff" }}>
        <Text style={{ color: colors.obsidian, fontSize: 16, fontWeight: "600" }}>+91</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="number-pad"
          maxLength={10}
          placeholder="Mobile number"
          placeholderTextColor={colors.mute}
          style={{ flex: 1, color: colors.obsidian, fontSize: 18, paddingLeft: 12 }}
        />
      </View>
      <View style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: "#fff", padding: 16 }}>
        <Text style={{ color: colors.obsidian, fontWeight: "700" }}>The member is never the product.</Text>
        <Text style={{ marginTop: 4, color: colors.mute, fontSize: 12, lineHeight: 18 }}>Your data is never sold to brands.</Text>
      </View>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <PrimaryButton onPress={sendOtp} disabled={loading}>
        {loading ? "Sending..." : "Send Code"}
      </PrimaryButton>
    </View>
  );
}
