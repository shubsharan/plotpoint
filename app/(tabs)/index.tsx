import { ScreenWrapper } from "@/components/ScreenWrapper";
import { Heading } from "@/components/ui/heading";
import { View } from "react-native";

export default function HomeScreen() {
  return (
    <ScreenWrapper>
      <View className="w-full flex flex-row justify-between items-center my-4">
        <Heading size="4xl">Explore</Heading>
      </View>
    </ScreenWrapper>
  );
}
