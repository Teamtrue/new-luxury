import { Text, View } from "react-native";
import { Hairline, PCMonogram, PrimaryButton } from "../../components/Brand";
import { colors, spacing } from "../../theme";

export function OnboardingAdmittedScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 24, padding: spacing.screenX, backgroundColor: colors.obsidian }}>
      <View style={{ alignItems: "center" }}>
        <PCMonogram size={48} />
        <Text style={{ marginTop: 18, color: colors.gold, fontSize: 10, fontWeight: "700", letterSpacing: 3 }}>
          MEMBERSHIP ADMITTED
        </Text>
        <Text style={{ marginTop: 16, color: colors.cream, fontSize: 36, textAlign: "center", lineHeight: 40 }}>
          Welcome to{"\n"}PlutusClub.
        </Text>
      </View>

      <View style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.gold, padding: 18, gap: 14 }}>
        <Text style={{ color: colors.muteDk, fontSize: 9, letterSpacing: 3, textAlign: "center" }}>PRIVATE MEMBER CERTIFICATE</Text>
        <Hairline dark />
        <Text style={{ color: colors.cream, fontSize: 24, textAlign: "center" }}>Founding Member #01,247</Text>
        <Text style={{ color: colors.muteDk, fontSize: 12, lineHeight: 19, textAlign: "center" }}>
          Your negotiated access is now active across eligible categories, deals, wallet rewards, and concierge benefits.
        </Text>
      </View>

      <PrimaryButton variant="gold">Enter the Club</PrimaryButton>
    </View>
  );
}
