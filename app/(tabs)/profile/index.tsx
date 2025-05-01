import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Text, View } from "react-native";

export default function ProfileScreen() {
  return (
    <ScreenWrapper>
      <View className="w-full flex flex-row justify-between items-center mb-4">
        <Text className="font-bold text-4xl">Profile</Text>
      </View>
    </ScreenWrapper>
  );
}
