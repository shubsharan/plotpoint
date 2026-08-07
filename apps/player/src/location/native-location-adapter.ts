import * as Location from "expo-location";

import type { ForegroundLocationNativeAdapter } from "./foreground-location";

export const nativeForegroundLocationAdapter: ForegroundLocationNativeAdapter = {
  async requestPermission() {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted ? "granted" : "denied";
  },
  async capture() {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    return {
      timestamp: location.timestamp,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      horizontalAccuracy: location.coords.accuracy,
    };
  },
};
