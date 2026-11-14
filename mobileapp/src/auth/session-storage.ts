import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { parseCredentials, type Credentials } from "./transport";
export type { Credentials } from "./transport";
let previewMemory: Credentials | null = null;
const key = "dnd.session.v1";
export async function readCredentials(): Promise<Credentials | null> {
  if (Platform.OS === "web") return previewMemory;
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    return parseCredentials(JSON.parse(value));
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}
export async function writeCredentials(value: Credentials) {
  if (Platform.OS === "web") {
    previewMemory = value;
    return;
  }
  await SecureStore.setItemAsync(key, JSON.stringify(value), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
export async function deleteCredentials() {
  if (Platform.OS === "web") {
    previewMemory = null;
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
