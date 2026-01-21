import { View, Text, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { Clock, Star } from "lucide-react-native";
import type { Story } from "../../hooks/useStories";
import { Card } from "../ui/Card";
import { cn } from "../../lib/utils";

interface StoryCardProps {
  story: Story;
  distance?: number; // Distance in kilometers
}

export function StoryCard({ story, distance }: StoryCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/story/${story.id}`);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.9} className="mb-4">
      <Card elevated>
        {/* Cover Image */}
        {story.coverImageUrl ? (
          <Image source={{ uri: story.coverImageUrl }} className="w-full h-48 bg-muted" />
        ) : (
          <View className="w-full h-48 bg-muted items-center justify-center">
            <Text className="text-muted-foreground text-sm">No Image</Text>
          </View>
        )}

        <View className="p-4">
          {/* Title */}
          <Text className="text-card-foreground text-lg font-bold mb-1" numberOfLines={2}>
            {story.title}
          </Text>

          {/* Author */}
          {story.author && (
            <Text className="text-muted-foreground text-sm mb-3" numberOfLines={1}>
              by {story.author.displayName || story.author.username || "Unknown"}
            </Text>
          )}

          {/* Metadata Row */}
          <View className="flex-row flex-wrap gap-2 mb-3">
            {/* Genre Badge */}
            {story.genre && (
              <View
                className="px-3 py-1.5 rounded-lg border-b-2 shadow-sm"
                style={{
                  backgroundColor: story.genre.color || "#FDDA0D",
                  borderBottomColor: story.genre.color
                    ? adjustColorBrightness(story.genre.color, -20)
                    : "#E5C300",
                }}
              >
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  {story.genre.name}
                </Text>
              </View>
            )}

            {/* Duration */}
            {story.estimatedDurationMinutes && (
              <View className="flex-row items-center gap-1 px-2 py-1">
                <Clock color="currentColor" size={12} />
                <Text className="text-muted-foreground text-xs">
                  {story.estimatedDurationMinutes}m
                </Text>
              </View>
            )}

            {/* Difficulty */}
            {story.difficultyLevel && (
              <View className="flex-row items-center gap-1 px-2 py-1">
                <Star color="#FDDA0D" size={12} fill="#FDDA0D" />
                <Text className="text-muted-foreground text-xs">{story.difficultyLevel}/5</Text>
              </View>
            )}

            {/* Distance */}
            {distance !== undefined && (
              <Text className="text-muted-foreground text-xs px-2 py-1">
                {formatDistance(distance)}
              </Text>
            )}
          </View>

          {/* Description */}
          {story.description && (
            <Text className="text-secondary-foreground text-sm leading-5" numberOfLines={2}>
              {story.description}
            </Text>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function adjustColorBrightness(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)}km`;
  } else {
    return `${Math.round(distanceKm)}km`;
  }
}
