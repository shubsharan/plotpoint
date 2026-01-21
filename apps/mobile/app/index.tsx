import { useState, useEffect } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePublishedStories } from "@/hooks/use-stories";
import { useCurrentLocation, useLocationPermissions } from "@/hooks/use-location";
import { StoryMapView } from "@features/discovery/story-map-view";
import { StoryListView } from "@features/discovery/story-list-view";
import { Navbar } from "@features/discovery/navbar";
import { FilterSheet, type StoryFilters } from "@features/discovery/filter-sheet";

type ViewMode = "map" | "list";

export default function Home() {
  const { data: stories = [], isLoading, refetch } = usePublishedStories();
  const { location, getCurrentLocation } = useCurrentLocation();
  const { granted: locationGranted, requestPermission } = useLocationPermissions();

  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<StoryFilters>({
    genreIds: [],
    difficultyLevels: [],
  });

  // Request location permission on mount
  useEffect(() => {
    if (!locationGranted) {
      requestPermission();
    }
  }, [locationGranted]);

  // Get current location when permission is granted
  useEffect(() => {
    if (locationGranted && !location) {
      getCurrentLocation();
    }
  }, [locationGranted, location]);

  // Filter stories based on search and filters
  const filteredStories = stories.filter((story) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const titleMatch = story.title.toLowerCase().includes(query);
      const descMatch = story.description?.toLowerCase().includes(query);
      if (!titleMatch && !descMatch) return false;
    }

    // Genre filter
    if (filters.genreIds.length > 0 && story.genreId) {
      if (!filters.genreIds.includes(story.genreId)) return false;
    }

    // Difficulty filter
    if (filters.difficultyLevels.length > 0 && story.difficultyLevel) {
      if (!filters.difficultyLevels.includes(story.difficultyLevel)) return false;
    }

    return true;
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Navbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSearch={setSearchQuery}
        onFilterPress={() => setFilterVisible(true)}
      />

      {/* Content */}
      {viewMode === "map" ? (
        <View className="flex-1">
          <StoryMapView stories={filteredStories} userLocation={location} />
        </View>
      ) : (
        <StoryListView
          stories={filteredStories}
          userLocation={location}
          isLoading={isLoading}
          onRefresh={refetch}
        />
      )}

      <FilterSheet
        visible={filterVisible}
        filters={filters}
        onApply={setFilters}
        onClose={() => setFilterVisible(false)}
      />
    </SafeAreaView>
  );
}
