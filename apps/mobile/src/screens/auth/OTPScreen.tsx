import { otpSchema } from "@plutusclub/shared";
import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { apiFetch } from "../../lib/api";
import { saveSession, setBiometricEnabled } from "../../lib/auth";
import { PrimaryButton, StepHead } from "../../components/Brand";
import { colors, spacing } from "../../theme";

export function OTPScreen({ navigation, route }: { navigation: { navigate: (screen: string, params?: unknown) => void }; route: { params: { phone: string } } }) {
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState("");
  const cells = useMemo(() => Array.from({ length: 6 }, (_, index) => otp[index] ?? ""), [otp]);

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  useEffect(() => {
    if (otp.length === 6) {
      void verifyOtp();
    }
  }, [otp]);

  async function verifyOtp() {
    const parsed = otpSchema.safeParse(otp);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit OTP");
      return;
    }

    try {
      const response = await apiFetch<{ access_token: string }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: route.params.phone, otp })
      });
      await saveSession(response.access_token);
      await offerBiometricUnlock();
      navigation.navigate("OnboardingProfile", { phone: route.params.phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify OTP");
    }
  }

  async function offerBiometricUnlock() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Enable biometric unlock for PlutusClub?",
      cancelLabel: "Not now",
      disableDeviceFallback: false
    });

    if (result.success) {
      await setBiometricEnabled(true);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 18, padding: spacing.screenX, backgroundColor: colors.paper }}>
      <StepHead step="02" kicker="Verification" title={<>Enter the{"\n"}six-digit code.</>} />
      <Text style={{ color: colors.mute }}>Sent via SMS to +91 {route.params.phone}.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {cells.map((digit, index) => (
          <View key={index} style={{ width: 44, height: 64, alignItems: "center", justifyContent: "center", borderColor: colors.obsidian, borderWidth: 1, borderRadius: 4, backgroundColor: "#fff" }}>
            <Text style={{ color: colors.obsidian, fontSize: 28 }}>{digit}</Text>
          </View>
        ))}
      </View>
      <TextInput
        value={otp}
        onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={{ height: 1, opacity: 0 }}
      />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Pressable disabled={seconds > 0} onPress={() => setSeconds(60)}>
        <Text style={{ color: seconds > 0 ? colors.mute : colors.goldDeep, textTransform: "uppercase", letterSpacing: 1.2 }}>
          {seconds > 0 ? `Resend in ${seconds}s` : "Resend OTP"}
        </Text>
      </Pressable>
      <PrimaryButton disabled={otp.length !== 6} onPress={verifyOtp}>Verify</PrimaryButton>
    </View>
  );
}
