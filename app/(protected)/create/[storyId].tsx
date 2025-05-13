import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

export enum ToolbarContext {
  Main,
  Link,
  Heading,
}

export default function CreateStoryScreen() {
  const { storyId } = useLocalSearchParams();

  // Fetch story data
  const { data: story } = useQuery({
    queryKey: ["story", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("id", Number(storyId))
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
    enabled: !!storyId,
  });

  if (story)
    return (
      <View className="flex-1 flex-col mb-safe pt-8 px-8 web:pt-8">
        <Text className="text-4xl font-semibold mb-4">{story.title}</Text>
        <View className="w-full grid grid-cols-2 gap-2 mb-4">
          <View className="flex-row items-center">
            <Ionicons
              name="document-text-outline"
              size={16}
              className="text-primary"
            />
            <Text className="text-lg ml-4">
              {story.description || "Enter description here..."}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons
              name="calendar-outline"
              size={16}
              className="text-primary"
            />
            <Text className="text-lg ml-4">
              {"Edited " + formatDate(story.updated_at)}
            </Text>
          </View>
        </View>
      </View>
    );
}
