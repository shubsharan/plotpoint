import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { View } from "react-native";
import ActionSheet, { SheetManager } from "react-native-actions-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../ui/button";

export default function ProfileSettingsSheet() {
  const insets = useSafeAreaInsets();
  const { logOut } = useAuth();

  const handleLogOut = async () => {
    logOut();
    SheetManager.hide("profile-settings");
  };

  return (
    <ActionSheet safeAreaInsets={insets}>
      <View className="w-full flex-col gap-4 p-4">
        <Button variant={"secondary"} onPress={() => handleLogOut()}>
          <Text>Log out</Text>
        </Button>
      </View>
    </ActionSheet>
  );
}
