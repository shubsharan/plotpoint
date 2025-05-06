import { useAuth } from "@/providers/AuthProvider";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";

export default function CreateLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session?.user) {
      router.replace("/login");
    }
  }, [loading, router, session]);

  if (loading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Create",
        }}
      />
    </Stack>
  );
}
