import { useEffect, useState } from "react";
import { Linking, Modal, Text, View } from "react-native";
import { PrimaryButton } from "./Brand";
import { checkVersionGate, type VersionGate } from "../lib/version";
import { colors, spacing } from "../theme";

export function MandatoryUpdateGate() {
  const [gate, setGate] = useState<VersionGate | null>(null);

  useEffect(() => {
    checkVersionGate()
      .then(setGate)
      .catch(() => setGate(null));
  }, []);

  return (
    <Modal visible={gate?.required === true} animationType="fade" transparent={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: 18, padding: spacing.screenX, backgroundColor: colors.obsidian }}>
        <Text style={{ color: colors.gold, fontSize: 10, fontWeight: "700", letterSpacing: 3, textTransform: "uppercase" }}>
          Update Required
        </Text>
        <Text style={{ color: colors.cream, fontSize: 34, lineHeight: 38 }}>A newer PlutusClub app is required.</Text>
        <Text style={{ color: colors.muteDk, fontSize: 14, lineHeight: 22 }}>
          Please update to version {gate?.latestVersion ?? "latest"} to continue securely.
        </Text>
        <PrimaryButton variant="gold" onPress={() => gate?.storeUrl && Linking.openURL(gate.storeUrl)}>
          Update App
        </PrimaryButton>
      </View>
    </Modal>
  );
}
