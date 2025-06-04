import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, Stack } from "expo-router";
import { Pressable, View } from "react-native";
import { SheetManager } from "react-native-actions-sheet";

export default function ProtectedLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!loading && !session?.user) {
    return <Redirect href={"/login"} />;
  }

  return (
    <Stack initialRouteName="profile" screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="profile"
        options={{
          headerShown: true,
          headerShadowVisible: false,
          title: "Profile",
          headerLeft: () => (
            <Pressable
              className="web:ml-4"
              onPress={() => {
                router.back();
              }}
            >
              <Ionicons
                name="chevron-back-outline"
                size={20}
                className="text-primary-foreground"
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              className="web:mr-4"
              onPress={() => {
                SheetManager.show("profile-settings");
              }}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                className="text-primary-foreground"
              />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="create/index"
        options={{
          headerShown: true,
          headerShadowVisible: false,
          title: "Create",
          animation: "slide_from_bottom",
          headerLeft: () => (
            <Pressable
              className="web:ml-4"
              onPress={() => {
                router.back();
              }}
            >
              <Ionicons
                name="chevron-back-outline"
                size={20}
                className="text-primary-foreground"
              />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="create/[storyId]"
        options={{
          title: "",
          headerShown: false,
          headerTitleAlign: "left",
          presentation: "card",
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              className="web:ml-4 text-primary-foreground"
              onPress={() => {
                router.back();
              }}
            >
              <Ionicons
                name="chevron-back-outline"
                size={20}
                className="text-primary-foreground"
              />
            </Pressable>
          ),
          headerRight: () => (
            <View className="flex-row items-center justify-center gap-4 web:mr-4">
              <Pressable onPress={() => {}}>
                <Ionicons
                  name="menu"
                  size={24}
                  className="text-primary-foreground"
                />
              </Pressable>
              <Pressable onPress={() => {}}>
                <Text className="font-semibold">Publish</Text>
              </Pressable>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
