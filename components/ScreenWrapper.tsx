import { ReactNode } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const ScreenWrapper = ({ children }: { children: ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: Platform.OS === "web" ? 8 : insets.top,
        paddingBottom: insets.bottom,
      }}
      className="flex-1 px-4 bg-background-0"
    >
      {children}
    </View>
  );
};
