import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  SafeAreaView,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useRequestPasswordReset } from "../../src/hooks/useAuth";
import { forgotPasswordFormSchema } from "@plotpoint/schemas";
import { cn } from "../../src/lib/utils";

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
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 justify-center p-6">
            <Text className="text-4xl font-bold text-foreground mb-2">Forgot Password?</Text>
            <Text className="text-base text-muted-foreground mb-8 leading-6">
              Enter your email address and we'll send you a link to reset your password.
            </Text>

            <View className="w-full">
              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
                <TextInput
                  className={cn(
                    "px-4 py-4 text-base text-foreground rounded-lg",
                    "bg-input border-1 border-border",
                    errors.email && "border-destructive",
                  )}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#A3A3A3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textAlignVertical="center"
                />
                {errors.email && (
                  <Text className="text-destructive text-xs mt-1">{errors.email}</Text>
                )}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
