import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  type TouchableOpacityProps,
} from "react-native";
import { cn } from "../../lib/utils";

interface ButtonProps extends TouchableOpacityProps {
  variant?: "primary" | "secondary" | "dark" | "light" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const baseClasses = "rounded-lg items-center justify-center flex-row overflow-hidden";

  const variantClasses = {
    primary:
      "bg-primary border-1 border-primary shadow-md hover:shadow-lg active:shadow-sm transition-all",
    secondary:
      "bg-card border-1 border-border shadow-sm hover:shadow-md active:shadow-sm transition-all",
    dark: "bg-card border-1 border-border shadow-md hover:shadow-lg active:shadow-sm transition-all",
    light:
      "bg-secondary border-1 border-border shadow-sm hover:shadow-md active:shadow-sm transition-all",
    accent:
      "bg-accent border-1 border-accent shadow-md hover:shadow-lg active:shadow-sm transition-all",
    ghost:
      "bg-transparent border-1 border-transparent hover:bg-muted active:bg-secondary transition-all",
  };

  const sizeClasses = {
    sm: "px-[0.75rem] py-[0.5rem] min-h-[2.25rem]",
    md: "px-4 py-[0.625rem] min-h-[2.75rem]",
    lg: "px-[1.5rem] py-[0.75rem] min-h-[3.25rem]",
  };

  const textVariantClasses = {
    primary: "text-primary-foreground font-semibold",
    secondary: "text-card-foreground font-semibold",
    dark: "text-card-foreground font-semibold",
    light: "text-secondary-foreground font-semibold",
    accent: "text-accent-foreground font-semibold",
    ghost: "text-muted-foreground font-semibold",
  };

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const disabledClasses = disabled || isLoading ? "opacity-50" : "";

  return (
    <TouchableOpacity
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        disabledClasses,
        className,
      )}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
      {...props}
    >
      <View className={textVariantClasses[variant]}>
        {isLoading ? (
          <ActivityIndicator color="currentColor" />
        ) : typeof children === "string" ? (
          <Text className={cn(textSizeClasses[size], "tracking-wide")}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </TouchableOpacity>
  );
}
