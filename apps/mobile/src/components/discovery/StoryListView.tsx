import { FlatList, View, Text, RefreshControl } from "react-native";
import type { Story } from "../../hooks/useStories";
import type { LocationCoords } from "../../hooks/useLocation";
import { StoryCard } from "./StoryCard";
import { useDistanceCalculator } from "../../hooks/useLocation";
import { cn } from "../../lib/utils";

interface StoryListViewProps {
  stories: Story[];
  userLocation?: LocationCoords | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
}

export function StoryListView({
  stories,
  userLocation,
  isLoading = false,
  onRefresh,
  onEndReached,
  ListHeaderComponent,
  ListEmptyComponent,
}: StoryListViewProps) {
  const { calculateDistance } = useDistanceCalculator();

  // Calculate distances if user location is available
  const storiesWithDistance = stories.map((story) => {
    // TODO: Use actual venue coordinates from database
    // For now, we'll skip distance calculation
    return {
      story,
      distance: undefined,
    };
  });

  // Sort by distance if available
  const sortedStories = userLocation
    ? [...storiesWithDistance].sort((a, b) => {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      })
    : storiesWithDistance;

  const renderItem = ({ item }: { item: (typeof storiesWithDistance)[0] }) => (
    <StoryCard story={item.story} distance={item.distance} />
  );

  const defaultEmptyComponent = (
    <View className="flex-1 justify-center items-center py-16">
      <Text className="text-card-foreground text-lg font-semibold mb-2">No stories found</Text>
      <Text className="text-muted-foreground text-sm">Check back later for new stories!</Text>
    </View>
  );

  return (
    <FlatList
      data={sortedStories}
      renderItem={renderItem}
      keyExtractor={(item) => item.story.id}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent || defaultEmptyComponent}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="currentColor" />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
    />
  );
}
