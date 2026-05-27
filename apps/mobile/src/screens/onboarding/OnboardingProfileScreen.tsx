import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { colors, spacing } from "../../theme";

export function OnboardingProfileScreen({ navigation, route }: { navigation: { navigate: (screen: string, params?: unknown) => void }; route: { params?: { phone?: string } } }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");

  const complete = name.trim().length > 1 && email.includes("@") && city.trim().length > 1;

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 18, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="03" kicker="The Member" title={<>Tell us{"\n"}about you.</>} />
      <Text style={{ color: colors.mute, fontSize: 14, lineHeight: 21 }}>
        Your name appears on every invoice, ID-verification, and member certificate.
      </Text>

      {[
        ["FULL NAME", name, setName],
        ["EMAIL", email, setEmail],
        ["CITY", city, setCity]
      ].map(([label, value, setter]) => (
        <View key={label as string} style={{ backgroundColor: "#fff", borderRadius: 4, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
          <Text style={{ color: colors.goldDeep, fontSize: 9, fontWeight: "700", letterSpacing: 2.2 }}>{label as string}</Text>
          <TextInput
            value={value as string}
            onChangeText={setter as (text: string) => void}
            autoCapitalize={label === "EMAIL" ? "none" : "words"}
            keyboardType={label === "EMAIL" ? "email-address" : "default"}
            style={{ minHeight: 36, color: colors.obsidian, fontSize: 16 }}
          />
        </View>
      ))}

      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.obsidian, borderRadius: 4, padding: 16 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.gold, fontSize: 20 }}>P</Text>
        </View>
        <View>
          <Text style={{ color: colors.gold, fontSize: 9, fontWeight: "700", letterSpacing: 2.5 }}>FOUNDING COHORT</Text>
          <Text style={{ color: colors.cream, marginTop: 4 }}>Member <Text style={{ color: colors.gold, fontSize: 17 }}>#01,247</Text> of 10,000</Text>
        </View>
      </View>

      <PrimaryButton
        disabled={!complete}
        onPress={() => navigation.navigate("OnboardingTier", {
          profile: { name, email, city, phone: route.params?.phone ?? "" }
        })}
      >
        Continue
      </PrimaryButton>
    </View>
  );
}
