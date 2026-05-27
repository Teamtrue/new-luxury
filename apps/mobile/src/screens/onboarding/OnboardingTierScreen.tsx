import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MemberTier } from "@plutusclub/shared";
import { TIER_COLORS } from "@plutusclub/shared";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { colors, spacing } from "../../theme";

const tiers: Array<{ tier: MemberTier; name: string; price: string; cats: string }> = [
  { tier: "silver", name: "Silver", price: "₹999", cats: "12 categories" },
  { tier: "gold", name: "Gold", price: "₹3,999", cats: "28 categories" },
  { tier: "platinum", name: "Platinum", price: "₹9,999", cats: "46 categories" },
  { tier: "obsidian", name: "Obsidian", price: "₹24,999", cats: "All 60 + concierge" }
];

export function OnboardingTierScreen({ navigation, route }: { navigation: { navigate: (screen: string, params?: unknown) => void }; route: { params?: { profile?: unknown } } }) {
  const [selected, setSelected] = useState<MemberTier>("platinum");

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 16, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="04" kicker="The Tier" title={<>Choose your{"\n"}standing.</>} />
      <Text style={{ color: colors.mute, fontSize: 13, lineHeight: 20 }}>
        Each tier unlocks deeper categories and bigger savings. Upgrade anytime.
      </Text>

      <View style={{ gap: 8 }}>
        {tiers.map((item) => {
          const active = item.tier === selected;
          return (
            <Pressable
              key={item.tier}
              onPress={() => setSelected(item.tier)}
              style={{
                minHeight: 74,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 4,
                padding: 14,
                backgroundColor: active ? colors.obsidian : "#fff",
                borderWidth: active ? 0 : 1,
                borderColor: colors.line
              }}
            >
              <View style={{ width: 3, height: 42, backgroundColor: TIER_COLORS[item.tier] }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: active ? colors.cream : colors.obsidian, fontSize: 22, fontWeight: "500" }}>{item.name}</Text>
                <Text style={{ color: active ? colors.muteDk : colors.mute, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>{item.cats}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: active ? colors.gold : colors.obsidian, fontSize: 22, fontWeight: "500" }}>{item.price}</Text>
                <Text style={{ color: active ? colors.muteDk : colors.mute, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase" }}>per year</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton onPress={() => navigation.navigate("OnboardingCategories", { tier: selected, profile: route.params?.profile })}>
        Continue with {selected}
      </PrimaryButton>
    </View>
  );
}
