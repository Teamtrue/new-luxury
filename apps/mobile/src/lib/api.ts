import Constants from "expo-constants";
import { clearSession, authHeaders } from "./auth";

const extra = Constants.expoConfig?.extra ?? {};

export const API_BASE_URL = String(extra.API_BASE_URL ?? "http://localhost:3000");

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(init.headers ?? {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401) {
    await clearSession();
    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const json = await response.json();
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }

  return json as T;
}
