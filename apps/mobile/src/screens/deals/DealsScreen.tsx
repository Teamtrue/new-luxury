import { FlatList, Text, TextInput, View } from "react-native";

export function DealsScreen() {
  return (
    <View style={{ flex: 1, gap: 12, padding: 16, backgroundColor: "#0A0A12" }}>
      <TextInput placeholder="Search deals" placeholderTextColor="#7A7787" style={{ minHeight: 44, borderRadius: 8, borderColor: "#393647", borderWidth: 1, color: "#F7F1DF", paddingHorizontal: 12 }} />
      <FlatList
        data={[]}
        numColumns={2}
        keyExtractor={(_, index) => String(index)}
        ListEmptyComponent={<Text style={{ color: "#B9B4C7" }}>Deals will appear here after API integration.</Text>}
        renderItem={() => null}
      />
    </View>
  );
}
