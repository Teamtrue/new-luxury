import { SectionList, Text, View } from "react-native";

export function BookingsScreen() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0A0A12" }}>
      <SectionList
        sections={[]}
        keyExtractor={(_, index) => String(index)}
        ListEmptyComponent={<Text style={{ color: "#B9B4C7" }}>Bookings will appear here.</Text>}
        renderItem={() => null}
      />
    </View>
  );
}
