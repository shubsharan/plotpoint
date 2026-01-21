/**
 * Theme color definitions - Runtime colors for JS/TS
 *
 * IMPORTANT: These values MUST stay in sync with global.css
 * The CSS file is the source of truth for oklch values.
 * These hex values are approximations for runtime use.
 *
 * When updating colors:
 * 1. Update oklch values in global.css first
 * 2. Update corresponding hex approximations here
 *
 * Why separate files?
 * - CSS can't import TypeScript
 * - oklch provides better perceptual uniformity in CSS
 * - Hex is needed for React Native props (placeholderTextColor, etc.)
 */

export const colors = {
  light: {
    background: "#f5f5f5", // oklch(96% 0 0)
    foreground: "#303030", // oklch(20% 0 0)
    card: "#ffffff", // oklch(100% 0 0)
    cardForeground: "#303030", // oklch(20% 0 0)
    popover: "#ffffff", // oklch(100% 0 0)
    popoverForeground: "#303030", // oklch(20% 0 0)
    primary: "#facc15", // oklch(90.5% 0.182 98.111)
    primaryForeground: "#303030", // oklch(20% 0 0)
    secondary: "#f0f0f0", // oklch(95% 0 0)
    secondaryForeground: "#303030", // oklch(20% 0 0)
    muted: "#e5e5e5", // oklch(90% 0 0)
    mutedForeground: "#737373", // oklch(50% 0 0)
    accent: "#e07a5f", // oklch(70% 0.15 35)
    accentForeground: "#ffffff", // oklch(100% 0 0)
    destructive: "#dc2626", // oklch(65% 0.2 25)
    destructiveForeground: "#ffffff", // oklch(100% 0 0)
    border: "#e5e5e5", // oklch(90% 0 0)
    input: "#ffffff", // oklch(100% 0 0)
    ring: "#facc15", // oklch(85.2% 0.199 91.936)
    overlay: "rgba(0, 0, 0, 0.5)",
  },
  dark: {
    background: "#1a1a1a", // oklch(10% 0 0)
    foreground: "#f5f5f5", // oklch(96% 0 0)
    card: "#303030", // oklch(20% 0 0)
    cardForeground: "#f5f5f5", // oklch(96% 0 0)
    popover: "#404040", // oklch(25% 0 0)
    popoverForeground: "#f5f5f5", // oklch(96% 0 0)
    primary: "#facc15", // oklch(90.5% 0.182 98.111)
    primaryForeground: "#303030", // oklch(20% 0 0)
    secondary: "#404040", // oklch(25% 0 0)
    secondaryForeground: "#f5f5f5", // oklch(96% 0 0)
    muted: "#525252", // oklch(35% 0 0)
    mutedForeground: "#a3a3a3", // oklch(70% 0 0)
    accent: "#f59e0b", // oklch(75% 0.15 40)
    accentForeground: "#ffffff", // oklch(100% 0 0)
    destructive: "#ef4444", // oklch(70% 0.12 20)
    destructiveForeground: "#ffffff", // oklch(100% 0 0)
    border: "#383838", // oklch(22% 0 0)
    input: "#2e2e2e", // oklch(18% 0 0)
    ring: "#facc15", // oklch(85.2% 0.199 91.936)
    overlay: "rgba(0, 0, 0, 0.5)",
  },
} as const;

export type ThemeColors = typeof colors.light;
export type ColorScheme = keyof typeof colors;
