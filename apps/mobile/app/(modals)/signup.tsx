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
import { useSignUp } from "@/hooks/use-auth";
import { signUpFormSchema } from "@plotpoint/schemas";
import { cn } from "@/lib/utils";

export default function SignupModal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const router = useRouter();
  const signUpMutation = useSignUp();

  const handleSignUp = async () => {
    try {
      const validatedData = signUpFormSchema.parse({
        email,
        password,
        confirmPassword,
        displayName: displayName || undefined,
      });
      setErrors({});

      await signUpMutation.mutateAsync({
        email: validatedData.email,
        password: validatedData.password,
        displayName: validatedData.displayName,
      });

      Alert.alert(
        "Success",
        "Account created successfully! Please check your email to verify your account.",
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
        Alert.alert("Error", error.message || "Failed to create account");
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
            <Text className="text-4xl font-bold text-foreground mb-2">Create Account</Text>
            <Text className="text-base text-muted-foreground mb-8">Sign up to get started</Text>

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

              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">
                  Display Name (Optional)
                </Text>
                <TextInput
                  className={cn(
                    "px-4 py-4 text-base text-foreground rounded-lg",
                    "bg-input border-1 border-border",
                    errors.displayName && "border-destructive",
                  )}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="How should we call you?"
                  placeholderTextColor="#A3A3A3"
                  autoCapitalize="words"
                  textAlignVertical="center"
                />
                {errors.displayName && (
                  <Text className="text-destructive text-xs mt-1">{errors.displayName}</Text>
                )}
              </View>

              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">Password</Text>
                <TextInput
                  className={cn(
                    "px-4 py-4 text-base text-foreground rounded-lg",
                    "bg-input border-1 border-border",
                    errors.password && "border-destructive",
                  )}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password"
                  placeholderTextColor="#A3A3A3"
                  secureTextEntry
                  autoComplete="password-new"
                  textAlignVertical="center"
                />
                {errors.password && (
                  <Text className="text-destructive text-xs mt-1">{errors.password}</Text>
                )}
              </View>

              <View className="mb-5">
                <Text className="text-sm font-semibold text-foreground mb-2">Confirm Password</Text>
                <TextInput
                  className={cn(
                    "px-4 py-4 text-base text-foreground rounded-lg",
                    "bg-input border-1 border-border",
                    errors.confirmPassword && "border-destructive",
                  )}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  placeholderTextColor="#A3A3A3"
                  secureTextEntry
                  autoComplete="password-new"
                  textAlignVertical="center"
                />
                {errors.confirmPassword && (
                  <Text className="text-destructive text-xs mt-1">{errors.confirmPassword}</Text>
                )}
              </View>

              <TouchableOpacity
                className={cn(
                  "bg-primary rounded-lg px-4 py-4 items-center mb-4",
                  signUpMutation.isPending && "opacity-60",
                )}
                onPress={handleSignUp}
                disabled={signUpMutation.isPending}
              >
                <Text className="text-primary-foreground text-base font-semibold">
                  {signUpMutation.isPending ? "Creating account..." : "Sign Up"}
                </Text>
              </TouchableOpacity>

              <View className="flex-row justify-center items-center">
                <Text className="text-muted-foreground text-sm">Already have an account? </Text>
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
