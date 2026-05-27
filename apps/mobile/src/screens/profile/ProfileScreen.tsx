import { Pressable, Text, View } from "react-native";
import { clearSession } from "../../lib/auth";

export function ProfileScreen() {
  return (
    <View style={{ flex: 1, gap: 14, padding: 20, backgroundColor: "#0A0A12" }}>
      <Text style={{ color: "#F7F1DF", fontSize: 24, fontWeight: "700" }}>Profile</Text>
      {["Referral", "Concierge", "Disputes", "Refunds", "Settings", "Help & Support"].map((item) => (
        <Text key={item} style={{ color: "#B9B4C7", minHeight: 44, textAlignVertical: "center" }}>{item}</Text>
      ))}
      <Pressable onPress={clearSession} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: "#FF8A8A" }}>Sign Out</Text>
      </Pressable>
    </View>
  );
}
