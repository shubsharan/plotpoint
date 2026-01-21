import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from "react-native";
import { Redirect, useRouter, usePathname } from "expo-router";
import { useAuthContext } from "../../src/contexts/AuthContext";
import { useSignOut } from "../../src/hooks/useAuth";
import { cn } from "../../src/lib/utils";

export default function ProfileModal() {
  const { isAuthenticated, user } = useAuthContext();
  const pathname = usePathname();
  const router = useRouter();
  const signOutMutation = useSignOut();

  // Route protection guard
  if (!isAuthenticated) {
    return (
      <Redirect
        href={{
          pathname: "/(modals)/login",
          params: { returnTo: pathname },
        }}
      />
    );
  }

  const handleSignOut = async () => {
    try {
      await signOutMutation.mutateAsync();
      router.replace("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="p-6">
          <Text className="text-4xl font-bold text-foreground mb-8">Profile</Text>

          {/* User Info */}
          <View className="mb-8">
            <Text className="text-lg font-semibold text-foreground mb-4">Account Information</Text>

            <View className="mb-4">
              <Text className="text-sm text-muted-foreground mb-1">Email</Text>
              <Text className="text-base text-foreground">{user?.email || "N/A"}</Text>
            </View>

            <View className="mb-4">
              <Text className="text-sm text-muted-foreground mb-1">User ID</Text>
              <Text className="text-base text-foreground">{user?.id || "N/A"}</Text>
            </View>
          </View>

          {/* My Stories */}
          <View className="mb-8">
            <Text className="text-lg font-semibold text-foreground mb-4">My Stories</Text>
            <TouchableOpacity
              className="px-4 py-4 bg-card border-1 border-border rounded-lg"
              onPress={() => router.push("/(modals)/create-story")}
            >
              <Text className="text-primary text-base font-semibold text-center">
                Create New Story
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sign Out */}
          <TouchableOpacity
            className={cn(
              "bg-destructive rounded-lg px-4 py-4 items-center",
              signOutMutation.isPending && "opacity-60",
            )}
            onPress={handleSignOut}
            disabled={signOutMutation.isPending}
          >
            <Text className="text-destructive-foreground text-base font-semibold">
              {signOutMutation.isPending ? "Signing out..." : "Sign Out"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
