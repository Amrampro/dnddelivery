import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { api } from "../auth/client";
const key = "dnd.push.preference.v1";
export interface PushPreference {
  userId: string;
  enabled: boolean;
  deviceId?: string;
}
let generation = 0;
let syncing: Promise<PushPreference | undefined> | null = null;
export async function pushPreference(): Promise<PushPreference | undefined> {
  if (Platform.OS === "web") return;
  try {
    const raw = await SecureStore.getItemAsync(key);
    const p = raw ? JSON.parse(raw) : null;
    if (
      p &&
      typeof p.userId === "string" &&
      typeof p.enabled === "boolean" &&
      (!p.deviceId || typeof p.deviceId === "string")
    )
      return p;
  } catch {
    /* A corrupt preference never grants notification permission. */
  }
}
export async function disablePushDevice(userId?: string) {
  generation++;
  const p = await pushPreference();
  if (!p || (userId && p.userId !== userId)) return;
  if (p.deviceId)
    await api("/delivery-devices/revoke", {
      method: "POST",
      body: JSON.stringify({ id: p.deviceId }),
    });
  await SecureStore.setItemAsync(
    key,
    JSON.stringify({ userId: p.userId, enabled: false }),
  );
}
export async function synchronizePushDevice(
  userId: string,
  requestPermission = false,
): Promise<PushPreference | undefined> {
  if (Platform.OS === "web") return;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    if (requestPermission)
      throw Error(
        "Les notifications push nécessitent une installation dédiée de DND Delivery. Dans Expo Go, consultez les notifications dans votre espace.",
      );
    return;
  }
  if (syncing && !requestPermission) return syncing;
  const version = generation;
  const task = (async () => {
    const previous = await pushPreference();
    if (
      !requestPermission &&
      (!previous?.enabled || previous.userId !== userId)
    )
      return;
    const projectId =
      Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId)
      throw Error(
        "Les alertes ne sont pas disponibles dans cette installation. Consultez votre espace ou vos e-mails.",
      );
    const n = await import("expo-notifications");
    if (Platform.OS === "android")
      await n.setNotificationChannelAsync("default", {
        name: "Livraisons DND",
        importance: n.AndroidImportance.DEFAULT,
      });
    const permissions = requestPermission
      ? await n.requestPermissionsAsync()
      : await n.getPermissionsAsync();
    if (
      !permissions.granted &&
      permissions.ios?.status !== n.IosAuthorizationStatus.PROVISIONAL
    ) {
      if (requestPermission)
        throw Error(
          "Les alertes sont désactivées. Vous pouvez consulter vos notifications dans votre espace.",
        );
      return;
    }
    const token = await n.getExpoPushTokenAsync({ projectId });
    if (version !== generation) return;
    const registered = await api<{ id: string }>("/delivery-devices", {
      method: "POST",
      body: JSON.stringify({ token: token.data, platform: Platform.OS }),
    });
    if (version !== generation) return;
    if (
      previous?.userId === userId &&
      previous.deviceId &&
      previous.deviceId !== registered.id
    )
      await api("/delivery-devices/revoke", {
        method: "POST",
        body: JSON.stringify({ id: previous.deviceId }),
      });
    if (version !== generation) return;
    const preference = { userId, enabled: true, deviceId: registered.id };
    await SecureStore.setItemAsync(key, JSON.stringify(preference));
    return preference;
  })();
  syncing = task;
  try {
    return await task;
  } finally {
    if (syncing === task) syncing = null;
  }
}
