import { View, Text, SafeAreaView, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useStoryById } from "@/hooks/use-stories";
import { StoryHeader } from "@features/story-detail/story-header";
import { StoryInfo } from "@features/story-detail/story-info";
import { PlayButton } from "@features/story-detail/play-button";

export default function StoryDetailScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { data: story, isLoading, error } = useStoryById(storyId || null);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 justify-center items-center">
          <Text className="text-foreground text-base">Loading story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !story) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 justify-center items-center">
          <Text className="text-destructive text-base">Story not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <StoryHeader story={story} />
        <StoryInfo story={story} />
        <PlayButton storyId={storyId!} />
      </ScrollView>
    </SafeAreaView>
  );
}
