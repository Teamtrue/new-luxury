import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "./api";

interface VersionResponse {
  minimum_version: {
    ios: string;
    android: string;
  };
  latest_version: {
    ios: string;
    android: string;
  };
  ios_url: string;
  android_url: string;
}

export interface VersionGate {
  required: boolean;
  latestVersion: string;
  storeUrl: string;
}

export async function checkVersionGate(): Promise<VersionGate> {
  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const response = await apiFetch<VersionResponse>("/api/app/version");
  const minimum = response.minimum_version[platform];

  return {
    required: compareVersions(currentVersion, minimum) < 0,
    latestVersion: response.latest_version[platform],
    storeUrl: platform === "ios" ? response.ios_url : response.android_url
  };
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part));
  const b = right.split(".").map((part) => Number(part));
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
