import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { useColorScheme } from "nativewind";
import { useLayoutEffect, useRef, useState } from "react";
import { Platform } from "react-native";

SystemUI.setBackgroundColorAsync("black");

const queryClient = new QueryClient();

export default function RootLayout() {
  const hasMounted = useRef(false);
  const { colorScheme } = useColorScheme();
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = useState(false);

  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : () => {};
  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) {
      return;
    }

    if (Platform.OS === "web") {
      // Adds the background color to the html element to prevent white background on overscroll.
      document.documentElement.classList.add("bg-background");
    }
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;
  }, []);

  if (!isColorSchemeLoaded) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <GluestackUIProvider mode={colorScheme || "light"}>
        <Stack
          initialRouteName="(tabs)"
          screenOptions={{
            contentStyle: {
              backgroundColor: "bg-background-500",
            },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, title: "Home" }}
          />
          <Stack.Screen
            name="(auth)"
            options={{
              headerShown: false,
              title: "Authentication",
              presentation: "modal",
            }}
          />
        </Stack>
      </GluestackUIProvider>
    </QueryClientProvider>
  );
}
