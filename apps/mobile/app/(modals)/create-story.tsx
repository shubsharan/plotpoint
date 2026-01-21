import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Redirect, useRouter, usePathname } from "expo-router";
import { useAuthContext } from "../../src/contexts/auth-context";
import { useCreateStory, useGenres } from "../../src/hooks/use-stories";
import { cn } from "../../src/lib/utils";

export default function CreateStoryModal() {
  const { isAuthenticated } = useAuthContext();
  const pathname = usePathname();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const createStoryMutation = useCreateStory();
  const { data: _genres } = useGenres();

  // Route protection guard
  if (!isAuthenticated) {
    return (
      <Redirect
        href={{
          pathname: "/(modals)/login",
          params: { returnTo: pathname },
        }}
      />
    );
  }

  const handleCreateStory = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a story title");
      return;
    }

    try {
      await createStoryMutation.mutateAsync({
        title,
        description: description.trim() || undefined,
        shellType: "ebook",
        geographyType: "location_agnostic",
      });

      Alert.alert("Success", "Story created successfully!", [
        {
          text: "OK",
          onPress: () => router.replace("/(modals)/profile"),
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create story");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView className="flex-1">
          <View className="p-6">
            <Text className="text-4xl font-bold text-foreground mb-8">Create New Story</Text>

            <View className="w-full">
              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">Title</Text>
                <TextInput
                  className={cn(
                    "bg-input border-1 border-border rounded-lg px-4 py-4",
                    "text-base text-foreground",
                  )}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Enter story title"
                  placeholderTextColor="#A3A3A3"
                  textAlignVertical="center"
                />
              </View>

              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">
                  Description (Optional)
                </Text>
                <TextInput
                  className={cn(
                    "bg-input border-1 border-border rounded-lg px-4 py-4",
                    "text-base text-foreground min-h-[7.5rem]",
                  )}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your story"
                  placeholderTextColor="#A3A3A3"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                className={cn(
                  "bg-primary rounded-lg px-4 py-4 items-center mb-3",
                  createStoryMutation.isPending && "opacity-60",
                )}
                onPress={handleCreateStory}
                disabled={createStoryMutation.isPending}
              >
                <Text className="text-primary-foreground text-base font-semibold">
                  {createStoryMutation.isPending ? "Creating..." : "Create Story"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity className="px-4 py-4 items-center" onPress={() => router.back()}>
                <Text className="text-muted-foreground text-base">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
