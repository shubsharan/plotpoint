import { Button } from "@/components/ui/button";
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
                className="text-primary"
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
                className="text-primary"
              />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="create/index"
        options={{
          headerShown: true,
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
                className="text-primary"
              />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="create/[storyId]"
        options={{
          title: "",
          headerShown: true,
          headerTitleAlign: "left",
          presentation: "card",
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
                className="text-primary"
              />
            </Pressable>
          ),
          headerRight: () => (
            <View className="flex-row items-center justify-center gap-6 web:mr-4">
              <Pressable onPress={() => {}}>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  className="text-primary"
                />
              </Pressable>
              <Button
                variant={"link"}
                size={"sm"}
                className="p-0"
                onPress={() => {}}
              >
                <Text className="font-semibold">Publish</Text>
              </Button>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
