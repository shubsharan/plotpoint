import { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import type { Story } from "@/hooks/use-stories";
import type { LocationCoords } from "@/hooks/use-location";

interface StoryMapViewProps {
  stories: Story[];
  userLocation?: LocationCoords | null;
  onRegionChange?: (region: any) => void;
}

// Default map region (San Francisco)
const DEFAULT_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export function StoryMapView({ stories, userLocation, onRegionChange }: StoryMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const router = useRouter();

  // Center map on user location when available
  // Note: Hook is called unconditionally (before any returns) to follow React rules
  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    }
  }, [userLocation]);

  const handleMarkerPress = (story: Story) => {
    router.push(`/story/${story.id}`);
  };

  // For now, we'll place stories at random locations around the default region
  // TODO: Use actual venue coordinates from the database
  const getStoryCoordinates = (story: Story, index: number): LocationCoords => {
    // Placeholder: distribute stories in a grid around default location
    const offset = (index % 10) * 0.05;
    const row = Math.floor(index / 10) * 0.05;

    return {
      latitude: DEFAULT_REGION.latitude + offset - 0.25,
      longitude: DEFAULT_REGION.longitude + row - 0.25,
    };
  };

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        initialRegion={
          userLocation
            ? {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
              }
            : DEFAULT_REGION
        }
        showsUserLocation={true}
        showsMyLocationButton={true}
        onRegionChangeComplete={onRegionChange}
      >
        {/* Story Markers */}
        {stories.map((story, index) => {
          const coords = getStoryCoordinates(story, index);

          return (
            <Marker
              key={story.id}
              coordinate={coords}
              onPress={() => handleMarkerPress(story)}
              title={story.title}
              description={story.genre?.name}
            />
          );
        })}
      </MapView>

      {/* Story count overlay */}
      <View className="absolute top-4 left-4 bg-card/95 px-3 py-2 rounded-lg border-1 border-border">
        <Text className="text-card-foreground text-sm font-semibold">{stories.length} stories</Text>
      </View>
    </View>
  );
}
