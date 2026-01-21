import { View, Text } from "react-native";
import { Input } from "@/components/ui/Input";
import type { TextInputProps } from "react-native";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, ...inputProps }: FormFieldProps) {
  return (
    <View>
      <Text className="text-sm font-semibold text-foreground mb-2">{label}</Text>
      <Input {...inputProps} />
      {error && <Text className="text-destructive text-xs mt-1">{error}</Text>}
    </View>
  );
}
