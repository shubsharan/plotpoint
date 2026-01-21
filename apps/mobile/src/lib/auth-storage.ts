import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY_PREFIX = "plotpoint_auth_";

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        // Use localStorage for web
        return localStorage.getItem(KEY_PREFIX + key);
      } else {
        // Use SecureStore for native (iOS/Android)
        return await SecureStore.getItemAsync(KEY_PREFIX + key);
      }
    } catch (error) {
      console.error("Error getting item from storage:", error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        // Use localStorage for web
        localStorage.setItem(KEY_PREFIX + key, value);
      } else {
        // Use SecureStore for native (iOS/Android)
        await SecureStore.setItemAsync(KEY_PREFIX + key, value);
      }
    } catch (error) {
      console.error("Error setting item in storage:", error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        // Use localStorage for web
        localStorage.removeItem(KEY_PREFIX + key);
      } else {
        // Use SecureStore for native (iOS/Android)
        await SecureStore.deleteItemAsync(KEY_PREFIX + key);
      }
    } catch (error) {
      console.error("Error removing item from storage:", error);
    }
  },
};
