import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

interface CardProps extends ViewProps {
  elevated?: boolean;
  variant?: "default" | "bordered" | "minimal";
  children: React.ReactNode;
}

export function Card({
  elevated = false,
  variant = "default",
  className,
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    default: "bg-card border-2 border-border",
    bordered: "bg-card border-[5px] border-foreground",
    minimal: "bg-card border border-secondary",
  };

  return (
    <View
      className={cn(
        "rounded-3xl overflow-hidden",
        variantClasses[variant],
        elevated ? "shadow-xl" : "shadow-md",
        className,
      )}
      {...props}
    >
      {/* Subtle glossy overlay for depth */}
      {variant === "bordered" && (
        <View className="absolute top-0 left-0 right-0 h-[30%] bg-card/40 pointer-events-none rounded-t-3xl" />
      )}
      {children}
    </View>
  );
}
