import { useColorScheme } from "react-native";
import { colors, type ThemeColors } from "./theme";

/**
 * Hook to access theme colors programmatically.
 * Use this when you need colors outside of className (e.g., placeholderTextColor).
 *
 * @example
 * const colors = useThemeColors();
 * <TextInput placeholderTextColor={colors.mutedForeground} />
 */
export function useThemeColors(): ThemeColors {
  const colorScheme = useColorScheme() ?? "light";
  return colors[colorScheme];
}
