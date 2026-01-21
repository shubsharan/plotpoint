import { createClient } from "@supabase/supabase-js";
// import type { Database } from '@plotpoint/db'; // TODO: Generate types with supabase gen types
import { authStorage } from "./auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Handle deep links manually
  },
});
