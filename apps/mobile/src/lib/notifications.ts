import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiFetch } from "./api";

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing.status === "granted"
      ? existing.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: "android",
      device_id: Constants.sessionId ?? Device.osInternalBuildId ?? "unknown"
    })
  });

  return token;
}

export type NotificationRoute =
  | { screen: "BookingDetail"; id: string }
  | { screen: "DealDetail"; id: string }
  | { screen: "Profile"; section?: string }
  | null;

export function routeFromNotification(notification: Notifications.Notification): NotificationRoute {
  const data = notification.request.content.data;

  if (data.type === "booking_confirmed" && typeof data.booking_id === "string") {
    return { screen: "BookingDetail", id: data.booking_id };
  }

  if (data.type === "deal_expiring" && typeof data.deal_id === "string") {
    return { screen: "DealDetail", id: data.deal_id };
  }

  if (data.type === "membership_expiring") {
    return { screen: "Profile", section: "membership" };
  }

  return null;
}
