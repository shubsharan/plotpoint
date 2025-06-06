import Loader from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import TitleCard from "@/features/editor/components/TitleCard";
import { useGetStory } from "@/queries/stories";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Label } from "@react-navigation/elements";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function CreateStoryScreen() {
  const navigation = useNavigation();

  // Get storyId from local search params
  const { storyId } = useLocalSearchParams();

  // Fetch story data
  const { data: story, isLoading: storyIsLoading } = useGetStory(
    Number(storyId)
  );

  // Set header title when story data is available
  useEffect(() => {
    navigation.setOptions({
      headerTitle: story?.title,
      headerTitleAlign: "center",
    });
  }, [navigation, story]);

  if (storyIsLoading) return <Loader />;

  if (story)
    return (
      <TouchableWithoutFeedback
        onPress={Platform.OS === "web" ? undefined : Keyboard.dismiss}
        accessible={false}
      >
        <ScrollView
          className="w-full flex-1 flex-col p-4 max-w-lg mx-auto"
          keyboardShouldPersistTaps="handled"
        >
          <TitleCard story={story} />

          {/* Story Content */}
          <View className="flex-col items-start gap-2">
            <Label>Content</Label>
            {story?.content.map((content, index) => (
              <Card key={index} className="w-full p-4 mb-2 flex-col gap-2">
                <Text className="text-lg font-semibold">{content.title}</Text>
                <View className="flex-row items-center gap-2"></View>
                <Text className="text-sm text-muted-foreground">
                  {content.created_at}
                </Text>
              </Card>
            ))}
            <Button className="w-full flex-row items-center justify-center gap-2">
              <Text className="text-center">Add Content</Text>
              <Ionicons name="add" size={16} className="text-background" />
            </Button>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    );
}
