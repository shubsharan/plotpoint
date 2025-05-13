import { ReactNode } from "react";
import { View } from "react-native";

export const ScreenWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <View className="flex-1 px-4 bg-background py-safe web: pt-4">
      {children}
    </View>
  );
};
