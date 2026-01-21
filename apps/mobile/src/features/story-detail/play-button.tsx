import { TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuthContext } from "@/contexts/auth-context";

interface PlayButtonProps {
  storyId: string;
}

export function PlayButton({ storyId }: PlayButtonProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthContext();

  const handlePress = () => {
    if (!isAuthenticated) {
      router.push({
        pathname: "/(modals)/login",
        params: { returnTo: `/(player)/play/${storyId}` },
      });
    } else {
      router.push(`/(player)/play/${storyId}`);
    }
  };

  return (
    <TouchableOpacity
      className="bg-primary rounded px-4 py-4 items-center mx-6 mt-2 mb-6"
      onPress={handlePress}
    >
      <Text className="text-primary-foreground text-lg font-semibold">
        {isAuthenticated ? "Play Story" : "Sign In to Play"}
      </Text>
    </TouchableOpacity>
  );
}
