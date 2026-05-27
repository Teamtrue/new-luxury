import type { ReactNode } from "react";
import { Pressable, Text, View, type PressableProps, type TextStyle, type ViewStyle } from "react-native";
import { colors, spacing } from "../theme";

export function PCMonogram({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.gold,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text style={{ color: colors.gold, fontSize: size * 0.5, fontWeight: "600" }}>P</Text>
    </View>
  );
}

export function Eyebrow({ children, dark = false, style }: { children: string; dark?: boolean; style?: TextStyle }) {
  return (
    <Text
      style={[
        {
          color: dark ? colors.gold : colors.goldDeep,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 2.5,
          textTransform: "uppercase"
        },
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function Display({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: TextStyle }) {
  return (
    <Text
      style={[
        {
          color: dark ? colors.cream : colors.obsidian,
          fontSize: 38,
          fontWeight: "500",
          lineHeight: 41
        },
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function Hairline({ dark = false, style }: { dark?: boolean; style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: dark ? colors.lineDk : colors.line }, style]} />;
}

export function PrimaryButton({
  children,
  variant = "dark",
  style,
  ...props
}: PressableProps & { children: ReactNode; variant?: "dark" | "gold" | "light" }) {
  const palette = {
    dark: { backgroundColor: colors.obsidian, color: colors.cream },
    gold: { backgroundColor: colors.gold, color: colors.obsidian },
    light: { backgroundColor: colors.cream, color: colors.obsidian }
  }[variant];

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        {
          minHeight: spacing.buttonH,
          borderRadius: spacing.radius,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.backgroundColor,
          opacity: props.disabled ? 0.4 : pressed ? 0.86 : 1
        },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      <Text style={{ color: palette.color, fontSize: 14, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function StepHead({ step, kicker, title }: { step: string; kicker: string; title: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Eyebrow>{`Step ${step}`}</Eyebrow>
        <Hairline style={{ flex: 1 }} />
        <Eyebrow style={{ color: colors.mute }}>{kicker}</Eyebrow>
      </View>
      <Display>{title}</Display>
    </View>
  );
}
