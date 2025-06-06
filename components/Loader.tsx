import EvilIcons from "@expo/vector-icons/EvilIcons";
import { View } from "react-native";

export default function Loader() {
  return (
    <View className="w-full flex-col items-center justify-center ">
      <EvilIcons name="spinner" size={32} className="animate-spin" />
    </View>
  );
}
