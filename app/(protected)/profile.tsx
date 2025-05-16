import CreateStoryFAB from "@/components/CreateStoryFAB";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetStoriesByAuthorId } from "@/queries/stories";
import { useGetUserById } from "@/queries/users";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

export default function ProfileScreen() {
  const { session } = useAuth();

  const { data: user, isLoading: userIsLoading } = useGetUserById(
    session?.user.id!
  );

  const { data: stories, isLoading: storiesIsLoading } =
    useGetStoriesByAuthorId(session?.user.id!);

  if (userIsLoading || storiesIsLoading) return null;

  if (user && stories)
    return (
      <View className="w-full flex-col flex-1 gap-4 pb-safe pt-4 px-6 web:pt-4">
        {/* Profile Card */}
        <Card className="flex-col items-center justify-center gap-4 p-8 mb-4">
          <Avatar alt={`${user?.name}'s Avatar`} className="size-16">
            <AvatarImage source={{ uri: user?.avatar || undefined }} />
            <AvatarFallback>
              <Text className="text-lg text-primary-foreground font-semibold">
                {user?.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="flex-col items-center">
            <Text className="text-lg font-semibold">{user?.name}</Text>
            <Text className="text-muted-foreground">{user?.email}</Text>
          </View>
        </Card>

        {/* Stories */}
        <FlashList
          data={stories}
          ListHeaderComponent={() => (
            <Text className="text-muted-foreground mb-2">Stories</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                router.push(`/create/${item.id}`);
              }}
            >
              <Card className="w-full p-4">
                <View className="w-full flex-row justify-between items-center gap-4">
                  <View className="flex-col gap-1">
                    <Text className="font-semibold">{item.title}</Text>
                    <Text
                      className="text-muted-foreground"
                      numberOfLines={3}
                      ellipsizeMode="tail"
                    >
                      {item.description || "New story..."}
                    </Text>
                  </View>
                  <Button
                    variant={"ghost"}
                    size={"icon"}
                    className="rounded-full"
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={16}
                      className="text-primary"
                    />
                  </Button>
                </View>
              </Card>
            </Pressable>
          )}
        />

        {/* Floating Action Button */}
        <CreateStoryFAB />
      </View>
    );
}
