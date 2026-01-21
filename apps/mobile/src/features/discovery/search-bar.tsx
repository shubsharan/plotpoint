import { useState, useEffect } from "react";
import { View } from "react-native";
import { Filter } from "lucide-react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onFilterPress?: () => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchBar({
  onSearch,
  onFilterPress,
  placeholder = "Search stories...",
  debounceMs = 500,
}: SearchBarProps) {
  const [query, setQuery] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, onSearch]);

  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {onFilterPress && (
        <Button variant="secondary" size="md" onPress={onFilterPress}>
          <Filter color="currentColor" size={16} />
        </Button>
      )}
    </View>
  );
}
