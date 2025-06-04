import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetStoriesByAuthorId } from "@/queries/stories";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";

export default function CreateScreen() {
  const { session } = useAuth();

  const { data: stories, isLoading: storiesIsLoading } =
    useGetStoriesByAuthorId(session?.user.id!);

  if (storiesIsLoading) return null;

  return (
    <FlashList
      data={stories}
      ListHeaderComponent={() => (
        <Text className="text-2xl font-semibold mb-4">Stories</Text>
      )}
      renderItem={({ item }) => (
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
            <Button variant={"ghost"} size={"icon"} className="rounded-full">
              <Ionicons
                name="ellipsis-horizontal"
                size={16}
                className="text-primary-foreground"
              />
            </Button>
          </View>
        </Card>
      )}
    />
  );
}
