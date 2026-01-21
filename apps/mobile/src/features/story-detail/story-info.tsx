import { View, Text } from "react-native";
import type { Story } from "@/hooks/use-stories";

interface StoryInfoProps {
  story: Story;
}

export function StoryInfo({ story }: StoryInfoProps) {
  return (
    <View className="px-6">
      {/* Metadata Row */}
      <View className="flex-row flex-wrap gap-3 mb-6">
        {story.genre && (
          <View
            style={{ backgroundColor: story.genre.color || "#3b82f6" }}
            className="px-3 py-1.5 rounded"
          >
            <Text className="text-foreground text-sm font-semibold">{story.genre.name}</Text>
          </View>
        )}
        {story.difficultyLevel && (
          <Text className="text-muted-foreground text-sm py-1.5">
            Difficulty: {"★".repeat(story.difficultyLevel)}
            {"☆".repeat(5 - story.difficultyLevel)}
          </Text>
        )}
        {story.estimatedDurationMinutes && (
          <Text className="text-muted-foreground text-sm py-1.5">
            {story.estimatedDurationMinutes} min
          </Text>
        )}
      </View>

      {/* Description */}
      {story.description && (
        <View className="mb-6">
          <Text className="text-foreground text-lg font-semibold mb-2">About</Text>
          <Text className="text-secondary-foreground text-base leading-6">{story.description}</Text>
        </View>
      )}

      {/* Location Info */}
      {story.primaryCity && (
        <View className="mb-6">
          <Text className="text-foreground text-lg font-semibold mb-2">Location</Text>
          <Text className="text-secondary-foreground text-base">
            {story.primaryCity}
            {story.primaryCountry && `, ${story.primaryCountry}`}
          </Text>
        </View>
      )}

      {/* Shell Type */}
      <View className="flex-row mb-6">
        <Text className="text-muted-foreground text-base mr-2">Experience Type:</Text>
        <Text className="text-foreground text-base font-semibold">
          {story.shellType.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
