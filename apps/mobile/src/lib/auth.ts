import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "session";
const BIOMETRIC_KEY = "biometric_enabled";

export async function saveSession(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function getSession(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? "true" : "false");
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "true";
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
