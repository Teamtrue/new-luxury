import { Text, View } from "react-native";

export function WalletScreen() {
  return (
    <View style={{ flex: 1, gap: 12, padding: 20, backgroundColor: "#0A0A12" }}>
      <Text style={{ color: "#C9A961", fontSize: 42, fontWeight: "700" }}>0</Text>
      <Text style={{ color: "#F7F1DF", fontSize: 18 }}>Token balance</Text>
      <Text style={{ color: "#B9B4C7" }}>Token transactions will appear here.</Text>
    </View>
  );
}
