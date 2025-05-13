import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";

export default function CreateStoryFAB() {
  return (
    <Pressable
      className="absolute bottom-4 web:bottom-8 right-8 aspect-square items-center justify-center p-5 bg-yellow-300 border border-primary shadow-lg rounded-lg m-safe"
      onPress={() => {}}
    >
      <Ionicons name="add" size={28} className="text-primary" />
    </Pressable>
  );
}
