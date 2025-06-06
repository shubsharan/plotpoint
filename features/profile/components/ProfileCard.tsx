import Loader from "@/components/Loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetUserById } from "@/queries/users";
import { View } from "react-native";

export default function ProfileCard() {
  const { session } = useAuth();

  const { data: user, isLoading: userIsLoading } = useGetUserById(
    session?.user.id!
  );

  if (userIsLoading)
    return (
      <Card className="flex-col items-center justify-center gap-4 p-8 mb-4">
        <Loader />
      </Card>
    );

  return (
    <Card className="flex-col items-center justify-center gap-4 p-8 mb-4">
      <Avatar alt={`${user?.name}'s Avatar`} className="size-16">
        <AvatarImage source={{ uri: user?.avatar || undefined }} />
        <AvatarFallback>
          <Text className="text-lg text-foreground font-semibold">
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
  );
}
