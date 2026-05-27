import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

const dsn = Constants.expoConfig?.extra?.SENTRY_DSN;

if (typeof dsn === "string" && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: Platform.OS === "ios" ? "mobile-ios" : "mobile-android",
    tracesSampleRate: 0.1,
    enableNativeCrashHandling: true
  });
}

export { Sentry };
