import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { colors, spacing } from "../../theme";

const categories = [
  ["automobiles", "Automobiles", "Once a decade"],
  ["insurance", "Health Insurance", "Every year"],
  ["holidays", "International Holidays", "Quarterly"],
  ["real-estate", "Real Estate", "Once a lifetime"],
  ["investments", "Investments · SIPs", "Every month"],
  ["electronics", "Premium Electronics", "Every 2 yrs"],
  ["watches", "Luxury Watches", "Once a decade"],
  ["fitness", "Fitness", "Every month"]
] as const;

export function OnboardingCategoriesScreen({ navigation, route }: { navigation: { navigate: (screen: string, params?: unknown) => void }; route: { params?: { tier?: string; profile?: unknown } } }) {
  const [selected, setSelected] = useState(new Set(["automobiles", "insurance", "holidays", "investments"]));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 16, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="05" kicker="Your Categories" title={<>What will you{"\n"}buy this year?</>} />
      <Text style={{ color: colors.mute, fontSize: 13, lineHeight: 20 }}>
        We'll prioritise deals in these categories. <Text style={{ color: colors.obsidian, fontWeight: "700" }}>{selected.size} of 8 selected</Text>
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {categories.map(([id, label, freq]) => {
          const active = selected.has(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggle(id)}
              style={{
                width: "48%",
                minHeight: 96,
                borderRadius: 4,
                padding: 12,
                justifyContent: "space-between",
                backgroundColor: active ? colors.obsidian : "#fff",
                borderWidth: active ? 0 : 1,
                borderColor: colors.line
              }}
            >
              <Text style={{ alignSelf: "flex-end", color: active ? colors.gold : colors.mute }}>{active ? "✓" : "○"}</Text>
              <View>
                <Text style={{ color: active ? colors.cream : colors.obsidian, fontWeight: "700" }}>{label}</Text>
                <Text style={{ color: active ? colors.muteDk : colors.mute, fontSize: 9.5, marginTop: 3, letterSpacing: 0.8, textTransform: "uppercase" }}>{freq}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton disabled={selected.size < 1} onPress={() => navigation.navigate("OnboardingPayment", { tier: route.params?.tier ?? "platinum", profile: route.params?.profile, categories: Array.from(selected) })}>
        Continue
      </PrimaryButton>
    </View>
  );
}
