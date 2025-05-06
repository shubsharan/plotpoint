import { useEffect, useState } from "react";
import { Appearance, ColorSchemeName, Platform } from "react-native";

export function useColorScheme() {
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(
    Platform.OS === "web" ? "light" : Appearance.getColorScheme()
  );

  useEffect(() => {
    if (Platform.OS !== "web") {
      const listener = Appearance.addChangeListener(({ colorScheme }) => {
        setColorScheme(colorScheme);
      });
      return () => listener.remove();
    }
  }, []);

  const toggleColorScheme = () => {
    setColorScheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return {
    colorScheme: colorScheme || "light",
    isDarkColorScheme: colorScheme === "dark",
    setColorScheme,
    toggleColorScheme,
  };
}
