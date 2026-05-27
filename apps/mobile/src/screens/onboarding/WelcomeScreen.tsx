import { Text, View } from "react-native";
import { Display, Eyebrow, Hairline, PCMonogram, PrimaryButton } from "../../components/Brand";
import { colors, spacing } from "../../theme";

export function WelcomeScreen({ navigation }: { navigation: { navigate: (screen: string) => void } }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.obsidian }}>
      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: spacing.screenX, paddingTop: 76 }}>
        <PCMonogram />
        <Text style={{ marginTop: 14, color: colors.gold, fontSize: 11, fontWeight: "600", letterSpacing: 4 }}>
          PLUTUSCLUB
        </Text>
        <Text style={{ marginTop: 2, color: colors.muteDk, fontSize: 9, letterSpacing: 3 }}>
          EST. MMXXVI · PRIVATE MEMBERSHIP
        </Text>

        <View style={{ marginTop: 64, alignItems: "center" }}>
          <Eyebrow dark>THE FOUNDING MANIFESTO</Eyebrow>
          <Display dark style={{ marginTop: 18, textAlign: "center", fontSize: 34, lineHeight: 39 }}>
            The price you pay{"\n"}is not the price{"\n"}you deserve.
          </Display>
          <Text style={{ marginTop: 22, color: colors.muteDk, fontSize: 13, lineHeight: 21, textAlign: "center", maxWidth: 280 }}>
            A private buying club. The institutional pricing once reserved for armies, corporations, and the well-connected, now open to you.
          </Text>
        </View>

        <View style={{ marginTop: "auto", width: "100%", paddingBottom: 18 }}>
          <Hairline dark />
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 18 }}>
            {[
              ["60", "Categories"],
              ["10K+", "Private Members"],
              ["18-40%", "Avg. Savings"]
            ].map(([value, label]) => (
              <View key={label} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.gold, fontSize: 30, fontWeight: "500" }}>{value}</Text>
                <Text style={{ color: colors.cream, fontSize: 8, letterSpacing: 2, textTransform: "uppercase" }}>{label}</Text>
              </View>
            ))}
          </View>
          <Hairline dark />
          <Text style={{ marginTop: 14, color: colors.muteDk, fontSize: 8, letterSpacing: 3, textAlign: "center" }}>
            CRAFTED IN INDIA · MEMBER OWNED
          </Text>
        </View>
      </View>

      <View style={{ padding: spacing.screenX }}>
        <PrimaryButton variant="gold" onPress={() => navigation.navigate("Phone")}>
          Request Membership
        </PrimaryButton>
        <Text style={{ marginTop: 16, color: colors.muteDk, textAlign: "center", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Already a member? <Text style={{ color: colors.gold, fontWeight: "700" }}>Sign in</Text>
        </Text>
      </View>
    </View>
  );
}
