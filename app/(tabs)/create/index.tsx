import { ScreenWrapper } from "@/components/ScreenWrapper";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useGetStoriesByAuthorId } from "@/queries/stories";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { Pressable, View } from "react-native";

export default function CreateScreen() {
  const { session } = useAuth();
  const { data: stories, isLoading: storiesIsLoading } =
    useGetStoriesByAuthorId(session?.user.id!);

  if (storiesIsLoading) return null;

  return (
    <ScreenWrapper>
      <View className="w-full h-full flex-col gap-4">
        <FlashList
          data={stories}
          ListHeaderComponent={() => (
            <View className="w-full flex-row items-center justify-between mb-4">
              <Text className="text-4xl font-semibold">Create</Text>
              <Pressable
                className="rounded-full p-3 bg-secondary"
                onPress={() => {
                  console.log("FAB Pressed");
                }}
              >
                <Ionicons name="add" size={20} className="text-primary" />
              </Pressable>
            </View>
          )}
          renderItem={({ item }) => (
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>
                  {`Last Edited ${formatDate(item.updated_at)}`}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        />
      </View>
    </ScreenWrapper>
  );
}
