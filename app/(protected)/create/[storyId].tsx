import StoryDragTree from "@/components/editor/StoryDragTree";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useGetStoryOutline } from "@/queries/storyOutline";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { Pressable, TextInput, View } from "react-native";

export enum ToolbarContext {
  Main,
  Link,
  Heading,
}

export default function CreateStoryScreen() {
  const { storyId } = useLocalSearchParams();

  // Fetch story data
  const { data: storyOutline } = useGetStoryOutline(Number(storyId));

  console.log(storyOutline);

  return (
    <View className="flex-1 flex-col gap-8 mb-safe pt-4 px-6 web:pt-4">
      {/* Header */}
      <View className="flex-col gap-2">
        <TextInput
          className="native:leading-[1.25] text-4xl font-semibold text-primary"
          placeholder="Title (Required)"
          defaultValue={storyOutline?.title}
        />
        <TextInput
          className="native:leading-[1.25] text-lg text-primary"
          multiline
          numberOfLines={3}
          placeholder="Enter description..."
          defaultValue={storyOutline?.description ?? undefined}
        />
      </View>

      {/* Content */}
      <View className="flex-col gap-4">
        {/* Section Header */}
        <View className="flex-row w-full items-center justify-between">
          <Text className="text-muted-foreground">Content</Text>
          <Pressable>
            <Ionicons name="add" size={20} className="text-primary" />
          </Pressable>
        </View>
        <Card className="w-full overflow-hidden pl-4 bg-primary/5">
          {/* <StoryOutlineAccordion storyId={Number(storyId)} /> */}
          {storyOutline && <StoryDragTree storyTree={storyOutline} />}
        </Card>
      </View>
    </View>
  );
}
