import { View } from "react-native";
import { Map, List } from "lucide-react-native";
import { SearchBar } from "./SearchBar";
import { ProfileButton } from "./ProfileButton";
import { Button } from "../ui/Button";

type ViewMode = "map" | "list";

interface NavbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: (query: string) => void;
  onFilterPress: () => void;
}

export function Navbar({ viewMode, onViewModeChange, onSearch, onFilterPress }: NavbarProps) {
  return (
    <View className="flex-row items-center px-4 py-3 gap-2">
      {/* Search */}
      <View className="flex-1">
        <SearchBar onSearch={onSearch} onFilterPress={onFilterPress} />
      </View>

      {/* View Toggle */}
      <View className="flex-row bg-card rounded-lg border-1 border-border p-1 shadow-sm gap-1">
        <Button
          variant={viewMode === "map" ? "primary" : "ghost"}
          size="sm"
          onPress={() => onViewModeChange("map")}
        >
          <Map color={viewMode === "map" ? "currentColor" : "currentColor"} size={16} />
        </Button>
        <Button
          variant={viewMode === "list" ? "primary" : "ghost"}
          size="sm"
          onPress={() => onViewModeChange("list")}
        >
          <List color={viewMode === "list" ? "currentColor" : "currentColor"} size={16} />
        </Button>
      </View>

      {/* Profile */}
      <ProfileButton />
    </View>
  );
}
