// Web-specific implementation that doesn't require react-native-maps
import { View, Text } from "react-native";
import type { Story } from "@/hooks/use-stories";
import type { LocationCoords } from "@/hooks/use-location";

interface StoryMapViewProps {
  stories: Story[];
  userLocation?: LocationCoords | null;
  onRegionChange?: (region: any) => void;
}

export function StoryMapView({ stories }: StoryMapViewProps) {
  return (
    <View className="flex-1">
      <View className="flex-1 justify-center items-center bg-card p-6">
        <Text className="text-foreground text-2xl font-bold mb-4">Map View</Text>
        <Text className="text-muted-foreground text-base text-center mb-2">
          Map view is only available on iOS and Android.
        </Text>
        <Text className="text-muted-foreground text-base text-center">
          Please use the List view or run the app on a mobile device.
        </Text>
      </View>
      <View className="absolute top-4 left-4 bg-card/95 px-3 py-2 rounded-lg border-1 border-border">
        <Text className="text-foreground text-sm font-semibold">{stories.length} stories</Text>
      </View>
    </View>
  );
}
