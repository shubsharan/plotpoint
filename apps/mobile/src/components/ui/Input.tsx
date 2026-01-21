import { TextInput, View, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";
import { useThemeColors } from "../../lib/useThemeColors";

interface InputProps extends TextInputProps {
  containerClassName?: string;
  variant?: "default" | "bordered";
}

export function Input({
  containerClassName,
  className,
  variant = "default",
  placeholderTextColor,
  ...props
}: InputProps) {
  const themeColors = useThemeColors();
  const variantClasses = {
    default:
      "border-1 border-border hover:border-muted-foreground hover:shadow-md focus-within:border-primary focus-within:shadow-lg",
    bordered:
      "border-1 border-foreground hover:border-muted-foreground hover:shadow-md focus-within:border-primary focus-within:shadow-lg",
  };

  return (
    <View
      className={cn(
        "rounded-lg bg-input overflow-hidden min-h-[2.75rem] shadow-sm transition-all",
        variantClasses[variant],
        containerClassName,
      )}
    >
      <TextInput
        className={cn(
          "px-4 py-0 text-base text-foreground leading-tight outline-none flex-1 w-full h-full transition-colors",
          className,
        )}
        placeholderTextColor={placeholderTextColor ?? themeColors.mutedForeground}
        textAlignVertical="center"
        {...props}
      />
    </View>
  );
}
