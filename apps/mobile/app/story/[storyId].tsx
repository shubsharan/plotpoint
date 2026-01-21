import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStoryById } from "../../src/hooks/useStories";
import { useAuthContext } from "../../src/contexts/AuthContext";

export default function StoryDetailScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuthContext();
  const { data: story, isLoading, error } = useStoryById(storyId || null);

  const handlePlayStory = () => {
    if (!isAuthenticated) {
      // Redirect to login with returnTo parameter
      router.push({
        pathname: "/(modals)/login",
        params: { returnTo: `/(player)/play/${storyId}` },
      });
    } else {
      // Navigate to player
      router.push(`/(player)/play/${storyId}`);
    }
  };

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
        {/* Cover Image */}
        {story.coverImageUrl && (
          <Image source={{ uri: story.coverImageUrl }} className="w-full h-72 bg-card" />
        )}

        <View className="p-6">
          {/* Title */}
          <Text className="text-foreground text-2xl font-bold mb-2">{story.title}</Text>

          {/* Author */}
          {story.author && (
            <Text className="text-muted-foreground text-base mb-4">
              by {story.author.displayName || story.author.username || "Unknown"}
            </Text>
          )}

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
              <Text className="text-secondary-foreground text-base leading-6">
                {story.description}
              </Text>
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

          {/* Play Button */}
          <TouchableOpacity
            className="bg-primary rounded px-4 py-4 items-center mt-2"
            onPress={handlePlayStory}
          >
            <Text className="text-primary-foreground text-lg font-semibold">
              {isAuthenticated ? "Play Story" : "Sign In to Play"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
