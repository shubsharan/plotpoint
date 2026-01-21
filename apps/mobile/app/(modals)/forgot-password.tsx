import { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useRequestPasswordReset } from "@/hooks/use-auth";
import { forgotPasswordFormSchema } from "@plotpoint/schemas";
import { cn } from "@/lib/utils";
import { AuthFormLayout } from "@features/auth/auth-form-layout";
import { FormField } from "@features/auth/form-field";

export default function ForgotPasswordModal() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const router = useRouter();
  const resetPasswordMutation = useRequestPasswordReset();

  const handleRequestReset = async () => {
    try {
      const validatedData = forgotPasswordFormSchema.parse({ email });
      setErrors({});

      await resetPasswordMutation.mutateAsync(validatedData.email);

      Alert.alert(
        "Check Your Email",
        "We sent you a password reset link. Please check your email and follow the instructions.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace({
                pathname: "/(modals)/login",
                params: { returnTo },
              });
            },
          },
        ],
      );
    } catch (error: any) {
      if (error.errors) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          if (err.path[0]) {
            newErrors[err.path[0]] = err.message;
          }
        });
        setErrors(newErrors);
      } else {
        Alert.alert("Error", error.message || "Failed to send reset email");
      }
    }
  };

  return (
    <AuthFormLayout
      title="Forgot Password?"
      subtitle="Enter your email address and we'll send you a link to reset your password."
    >
      <View className="w-full">
        <View className="mb-5">
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={errors.email}
          />
        </View>

        <TouchableOpacity
          className={cn(
            "bg-primary rounded-lg px-4 py-4 items-center mb-4",
            resetPasswordMutation.isPending && "opacity-60",
          )}
          onPress={handleRequestReset}
          disabled={resetPasswordMutation.isPending}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            {resetPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
          </Text>
        </TouchableOpacity>

        <View className="flex-row justify-center items-center">
          <Text className="text-muted-foreground text-sm">Remember your password? </Text>
          <Link
            href={{
              pathname: "/(modals)/login",
              params: { returnTo },
            }}
            asChild
          >
            <TouchableOpacity>
              <Text className="text-primary text-sm font-semibold">Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </AuthFormLayout>
  );
}
