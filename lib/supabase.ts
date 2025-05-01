import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const isWeb = Platform.OS === "web";

const isLocalStorageAvailable =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

const SecureStoreStorage = isWeb
  ? {
      getItem: async (key: string) =>
        isLocalStorageAvailable ? localStorage.getItem(key) : null,
      setItem: async (key: string, value: string) => {
        if (isLocalStorageAvailable) localStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        if (isLocalStorageAvailable) localStorage.removeItem(key);
      },
    }
  : {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    };

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: SecureStoreStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
