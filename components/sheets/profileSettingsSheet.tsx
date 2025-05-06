import { Text } from "@/components/ui/text";
import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/useColorScheme";
import { useAuth } from "@/providers/AuthProvider";
import { Pressable, View } from "react-native";
import ActionSheet, { SheetManager } from "react-native-actions-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfileSettingsSheet() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const theme = NAV_THEME[colorScheme];

  const { logOut } = useAuth();

  const handleLogOut = async () => {
    logOut();
    SheetManager.hide("profile-settings");
  };

  return (
    <ActionSheet
      safeAreaInsets={insets}
      containerStyle={{ backgroundColor: theme.card }}
    >
      <View className="w-full flex-col gap-4 p-4 bg-card">
        <Pressable
          onPress={() => handleLogOut()}
          className="flex-row items-center p-4 rounded justify-center bg-destructive/10"
        >
          <Text className="text-destructive">Log out</Text>
        </Pressable>
      </View>
    </ActionSheet>
  );
}
