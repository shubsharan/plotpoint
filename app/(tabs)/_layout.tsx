import { HapticTab } from "@/components/HapticTab";
import { useAuth } from "@/providers/AuthProvider";
import Feather from "@expo/vector-icons/Feather";
import { router, Tabs } from "expo-router";
import { Platform } from "react-native";

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
}) {
  return (
    <Feather
      size={20}
      {...props}
      style={{ marginTop: Platform.OS === "web" ? -3 : 0 }}
    />
  );
}

export default function TabLayout() {
  const { session } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }: { color: string }) => (
            <TabBarIcon name="compass" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ color }: { color: string }) => (
            <TabBarIcon name="edit" color={color} />
          ),
          tabBarButton: (props: any) =>
            !session?.user ? (
              <HapticTab
                {...props}
                onPress={() => {
                  router.push("/login");
                }}
              />
            ) : (
              <HapticTab {...props} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }: { color: string }) => (
            <TabBarIcon name="user" color={color} />
          ),
          tabBarButton: (props: any) =>
            !session?.user ? (
              <HapticTab
                {...props}
                onPress={() => {
                  router.push("/login");
                }}
              />
            ) : (
              <HapticTab {...props} />
            ),
        }}
      />
    </Tabs>
  );
}
