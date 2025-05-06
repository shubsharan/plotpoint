import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetUserById } from "@/queries/users";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { SheetManager } from "react-native-actions-sheet";

export default function ProfileScreen() {
  const { session } = useAuth();

  const { data: user, isLoading: userIsLoading } = useGetUserById(
    session?.user.id!
  );

  if (userIsLoading) return null;

  if (user)
    return (
      <ScreenWrapper>
        <View className="w-full flex-col gap-4">
          <View className="w-full flex-row justify-end items-center">
            <Pressable
              className="rounded-full p-3 bg-secondary"
              onPress={() => SheetManager.show("profile-settings")}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                className="text-primary"
              />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-start gap-2">
            <Avatar alt={`${user?.name}'s Avatar`} className="size-14">
              <AvatarImage source={{ uri: user?.avatar || undefined }} />
              <AvatarFallback>
                <Text className="text-xl text-primary">
                  {user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-col">
              <Text className="text-3xl font-semibold">{user?.name}</Text>
              <Text className="text-muted-foreground">{user?.email}</Text>
            </View>
          </View>
          <Separator className="w-full" />
        </View>
      </ScreenWrapper>
    );
}
