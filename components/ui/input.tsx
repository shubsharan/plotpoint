import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";

const inputVariants = cva(
  // Shared base styles — text color, layout, placeholder, etc.
  "web:flex web:w-full text-foreground placeholder:text-muted-foreground file:border-0 file:bg-transparent file:font-medium",
  {
    variants: {
      variant: {
        default:
          // Default has height, border, padding, ring, background
          "h-10 native:h-12 rounded-md bg-muted px-3 web:py-2 border border-input web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
        ghost:
          // Ghost has *no height*, padding, or ring styles
          "bg-transparent border-0 p-0 web:ring-0 web:ring-offset-0 web:focus-visible:ring-0 web:focus-visible:ring-offset-0 web:outline-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type InputProps = TextInputProps &
  VariantProps<typeof inputVariants> & {
    className?: string;
    placeholderClassName?: string;
  };

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  ({ className, placeholderClassName, variant, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          inputVariants({ variant }),
          props.editable === false && "opacity-50 web:cursor-not-allowed",
          className
        )}
        placeholderClassName={placeholderClassName}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input, inputVariants };
export type { InputProps };
