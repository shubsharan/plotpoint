import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaListener } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";

// Initialize component registry (must be imported before any components are used)
import "@/components/_registry";

// Uniwind CSS
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  },
});

// Keep splash screen visible while loading (only on native)
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {
    // Ignore errors on web or if module not available
  });
}

function DeepLinkGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Hide splash screen once auth state is loaded (only on native)
    if (Platform.OS !== "web") {
      const hideSplash = async () => {
        try {
          await SplashScreen.hideAsync();
        } catch (error) {
          // Ignore errors if splash screen is not available
          // This can happen in development or if module isn't properly linked
        }
      };
      hideSplash();
    }

    // Protected paths that require authentication
    const protectedPaths = ["/(modals)/profile", "/(modals)/create-story", "/(player)/play"];

    // Check if current path is protected
    const isProtected = protectedPaths.some((path) => pathname.includes(path));

    // Redirect to login if trying to access protected route without auth
    if (isProtected && !isAuthenticated) {
      router.replace({
        pathname: "/(modals)/login",
        params: { returnTo: pathname },
      });
    }
  }, [pathname, isAuthenticated, isLoading]);

  // Show nothing while loading
  if (isLoading) {
    return null;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DeepLinkGuard>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }}>
                {/* Home screen */}
                <Stack.Screen name="index" />

                {/* Story detail */}
                <Stack.Screen name="story/[storyId]" />

                {/* Modal screens */}
                <Stack.Screen
                  name="(modals)/login"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/signup"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/forgot-password"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/profile"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/create-story"
                  options={{
                    presentation: "modal",
                  }}
                />
              </Stack>
            </DeepLinkGuard>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaListener>
    </SafeAreaProvider>
  );
}
