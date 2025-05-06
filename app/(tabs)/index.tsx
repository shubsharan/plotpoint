import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

export default function HomeScreen() {
  return (
    <ScreenWrapper>
      <View className="w-full flex flex-row justify-between items-center my-4">
        <Text className="text-4xl font-semibold">Explore</Text>
      </View>
    </ScreenWrapper>
  );
}
