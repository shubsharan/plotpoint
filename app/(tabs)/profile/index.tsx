import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetUserById } from "@/queries/user";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { SheetManager } from "react-native-actions-sheet";

export default function ProfileScreen() {
  const { session } = useAuth();

  const { data: user, isLoading: userIsLoading } = useGetUserById(
    session?.user.id || ""
  );

  if (userIsLoading) return null;

  if (user)
    return (
      <ScreenWrapper>
        <View className="w-full flex-col gap-4">
          <View className="w-full flex-row justify-end items-center">
            <Pressable
              className="rounded-full p-3 bg-gray-200"
              onPress={() => SheetManager.show("profile-settings")}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                className="text-primary"
              />
            </Pressable>
          </View>

          <Avatar alt={`${user?.name}'s Avatar`} className="h-16 w-16">
            <AvatarImage source={{ uri: user?.avatar || undefined }} />
            <AvatarFallback>
              <Text>
                {user?.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </Text>
            </AvatarFallback>
          </Avatar>

          <Text className="text-4xl font-semibold">{user?.name}</Text>
          <Separator className="w-full" />
        </View>
      </ScreenWrapper>
    );
}
