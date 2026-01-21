import { View, Text, Image } from "react-native";
import type { Story } from "@/hooks/use-stories";

interface StoryHeaderProps {
  story: Story;
}

export function StoryHeader({ story }: StoryHeaderProps) {
  return (
    <>
      {story.coverImageUrl && (
        <Image source={{ uri: story.coverImageUrl }} className="w-full h-72 bg-card" />
      )}
      <View className="px-6 pt-6">
        <Text className="text-foreground text-2xl font-bold mb-2">{story.title}</Text>
        {story.author && (
          <Text className="text-muted-foreground text-base mb-4">
            by {story.author.displayName || story.author.username || "Unknown"}
          </Text>
        )}
      </View>
    </>
  );
}
