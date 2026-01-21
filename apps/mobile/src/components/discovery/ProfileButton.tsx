import { Text } from "react-native";
import { useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { useAuthContext } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";

export function ProfileButton() {
  const { isAuthenticated, user } = useAuthContext();
  const router = useRouter();

  const handlePress = () => {
    router.push(isAuthenticated ? "/(modals)/profile" : "/(modals)/login");
  };

  if (isAuthenticated && user) {
    const initial = user.email?.charAt(0).toUpperCase() || "U";

    return (
      <Button variant="primary" size="sm" onPress={handlePress}>
        <Text className="text-primary-foreground text-sm font-bold">{initial}</Text>
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="md" onPress={handlePress}>
      <User color="currentColor" size={16} />
    </Button>
  );
}
