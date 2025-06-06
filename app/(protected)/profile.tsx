import CreateStoryFAB from "@/components/CreateStoryFAB";
import DraftsList from "@/features/profile/components/DraftsList";
import ProfileCard from "@/features/profile/components/ProfileCard";
import { View } from "react-native";

export default function ProfileScreen() {
  return (
    <View className="w-full flex-col flex-1 gap-4 pb-safe pt-4 px-6 web:pt-4">
      <ProfileCard />

      <DraftsList />

      {/* Floating Action Button */}
      <CreateStoryFAB />
    </View>
  );
}
