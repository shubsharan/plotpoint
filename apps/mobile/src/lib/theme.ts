/**
 * Theme color definitions - Runtime colors for JS/TS
 *
 * IMPORTANT: These values MUST stay in sync with global.css
 * The CSS file is the source of truth for oklch values.
 * These hex values are approximations for runtime use.
 *
 * When updating colors:
 * 1. Update oklch values in global.css first (references Tailwind colors)
 * 2. Update corresponding hex approximations here
 *
 * Why separate files?
 * - CSS can't import TypeScript
 * - oklch provides better perceptual uniformity in CSS
 * - Hex is needed for React Native props (placeholderTextColor, etc.)
 *
 * Semantic colors now reference Tailwind base colors defined in global.css
 */

// Tailwind color palette - hex approximations of oklch values from global.css
export const colors = {
  neutral: {
    50: "#fafafa", // oklch(0.985 0 0)
    100: "#f5f5f5", // oklch(0.97 0 0)
    200: "#e5e5e5", // oklch(0.922 0 0)
    300: "#d4d4d4", // oklch(0.87 0 0)
    400: "#a3a3a3", // oklch(0.708 0 0)
    500: "#737373", // oklch(0.556 0 0)
    600: "#525252", // oklch(0.439 0 0)
    700: "#404040", // oklch(0.371 0 0)
    800: "#262626", // oklch(0.269 0 0)
    900: "#171717", // oklch(0.205 0 0)
    950: "#0a0a0a", // oklch(0.145 0 0)
  },
  yellow: {
    400: "#facc15", // oklch(0.852 0.199 91.936) - primary
  },
  orange: {
    400: "#fb923c", // oklch(0.75 0.183 55.934) - accent dark
    500: "#f97316", // oklch(0.705 0.213 47.604) - accent light
  },
  red: {
    400: "#f87171", // oklch(0.704 0.191 22.216) - destructive dark
    500: "#ef4444", // oklch(0.637 0.237 25.331) - destructive light
  },
  white: "#ffffff",
  black: "#000000",
} as const;

export const theme = {
  light: {
    // Semantic colors referencing Tailwind palette
    background: colors.neutral[50], // var(--color-neutral-50)
    foreground: colors.neutral[950], // var(--color-neutral-950)
    card: colors.white, // var(--color-white)
    cardForeground: colors.neutral[950], // var(--color-neutral-950)
    popover: colors.white, // var(--color-white)
    popoverForeground: colors.neutral[950], // var(--color-neutral-950)
    primary: colors.yellow[400], // var(--color-yellow-400)
    primaryForeground: colors.neutral[950], // var(--color-neutral-950)
    secondary: colors.neutral[100], // var(--color-neutral-100)
    secondaryForeground: colors.neutral[950], // var(--color-neutral-950)
    muted: colors.neutral[100], // var(--color-neutral-100)
    mutedForeground: colors.neutral[500], // var(--color-neutral-500)
    accent: colors.orange[500], // var(--color-orange-500)
    accentForeground: colors.white, // var(--color-white)
    destructive: colors.red[500], // var(--color-red-500)
    destructiveForeground: colors.white, // var(--color-white)
    border: colors.neutral[200], // var(--color-neutral-200)
    input: colors.white, // var(--color-white)
    ring: colors.yellow[400], // var(--color-yellow-400)
    overlay: "rgba(0, 0, 0, 0.5)",
  },
  dark: {
    // Semantic colors referencing Tailwind palette
    background: colors.neutral[950], // var(--color-neutral-950)
    foreground: colors.neutral[50], // var(--color-neutral-50)
    card: colors.neutral[900], // var(--color-neutral-900)
    cardForeground: colors.neutral[50], // var(--color-neutral-50)
    popover: colors.neutral[800], // var(--color-neutral-800)
    popoverForeground: colors.neutral[50], // var(--color-neutral-50)
    primary: colors.yellow[400], // var(--color-yellow-400)
    primaryForeground: colors.neutral[900], // var(--color-neutral-900)
    secondary: colors.neutral[800], // var(--color-neutral-800)
    secondaryForeground: colors.neutral[50], // var(--color-neutral-50)
    muted: colors.neutral[800], // var(--color-neutral-800)
    mutedForeground: colors.neutral[400], // var(--color-neutral-400)
    accent: colors.orange[400], // var(--color-orange-400)
    accentForeground: colors.white, // var(--color-white)
    destructive: colors.red[400], // var(--color-red-400)
    destructiveForeground: colors.white, // var(--color-white)
    border: colors.neutral[800], // var(--color-neutral-800)
    input: colors.neutral[900], // var(--color-neutral-900)
    ring: colors.yellow[400], // var(--color-yellow-400)
    overlay: "rgba(0, 0, 0, 0.5)",
  },
} as const;

export type ThemeColors = typeof theme.light;
export type ColorScheme = keyof typeof theme;
