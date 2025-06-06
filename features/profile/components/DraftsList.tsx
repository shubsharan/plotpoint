import Loader from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import {
  useCreateNewStoryMutation,
  useGetStoriesByAuthorId,
} from "@/queries/stories";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Image, Pressable, View } from "react-native";

export default function DraftsList() {
  const router = useRouter();
  const { session } = useAuth();

  const { data: stories, isLoading: storiesIsLoading } =
    useGetStoriesByAuthorId(session?.user.id!);

  const drafts = stories?.filter((story) => story.status === "draft");

  const createNewStory = useCreateNewStoryMutation(session?.user.id!);

  if (storiesIsLoading) {
    return (
      <View className="w-full flex-col">
        <Label className="text-muted-foreground mb-2">Drafts</Label>
        <Loader />
      </View>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <View className="w-full flex-col">
        <Label className="text-muted-foreground mb-2">Drafts</Label>
        <Button variant={"secondary"} onPress={() => createNewStory.mutate()}>
          <Text>Create a story</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="w-full flex-col">
      <Label className="text-muted-foreground mb-2">Drafts</Label>
      <View className="w-full flex-col gap-2">
        {drafts.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              router.push(`/create/${item.id}`);
            }}
          >
            <Card className="w-full p-4 mb-2">
              <View className="w-full flex-row justify-between items-center gap-4">
                {/* Thumbnail */}
                <View className="w-12 h-12 rounded-sm overflow-hidden bg-background items-center justify-center">
                  {item.cover_image ? (
                    <Image
                      source={{ uri: item.cover_image }}
                      className="w-full h-full rounded-md"
                      resizeMode="cover"
                      alt="Cover Image"
                    />
                  ) : (
                    <View className="flex-col gap-1 items-center justify-center w-full h-full">
                      <Ionicons
                        name="image-outline"
                        size={24}
                        className="text-foreground"
                      />
                    </View>
                  )}
                </View>
                {/* Text Content */}
                <View className="flex-1 flex-col gap-1">
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
                    className="text-foreground"
                  />
                </Button>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
