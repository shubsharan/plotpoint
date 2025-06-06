import { useAuth } from "@/providers/AuthProvider";
import { useCreateNewStoryMutation } from "@/queries/stories";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";

export default function CreateStoryFAB() {
  const { session } = useAuth();
  const createNewStory = useCreateNewStoryMutation(session?.user.id!);
  return (
    <Pressable
      className="absolute bottom-4 web:bottom-8 right-8 aspect-square items-center justify-center p-5 bg-primary border border-border rounded-full m-safe"
      onPress={() => createNewStory.mutate()}
    >
      <Ionicons name="add" size={28} className="text-primary-foreground" />
    </Pressable>
  );
}
