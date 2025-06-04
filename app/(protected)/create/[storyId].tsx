import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useFetchCompleteStory } from "@/queries/completeStory";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { Pressable, TextInput, View } from "react-native";

export default function CreateStoryScreen() {
  const { storyId } = useLocalSearchParams();

  // Fetch story data
  const { data: completeStory } = useFetchCompleteStory(Number(storyId));

  console.log(completeStory);

  return (
    <View className="flex-1 flex-col gap-8 mb-safe pt-4 px-6 web:pt-4">
      {/* Header */}
      <View className="flex-col gap-2">
        <TextInput
          className="native:leading-[1.25] text-4xl font-semibold text-primary-foreground"
          placeholder="Title (Required)"
          defaultValue={completeStory?.title}
        />
        <TextInput
          className="native:leading-[1.25] text-lg text-primary-foreground"
          multiline
          numberOfLines={3}
          placeholder="Enter description..."
          defaultValue={completeStory?.description ?? undefined}
        />
      </View>

      {/* Content */}
      <View className="flex-col gap-4">
        {/* Section Header */}
        <View className="flex-row w-full items-center justify-between">
          <Text className="text-muted-foreground">Content</Text>
          <Pressable>
            <Ionicons name="add" size={20} className="text-primar-foreground" />
          </Pressable>
        </View>
        <Card className="w-full overflow-hidden pl-4">
          <Text>{JSON.stringify(completeStory)}</Text>
        </Card>
      </View>
    </View>
  );
}
