import { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  SafeAreaView,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useSignIn } from "../../src/hooks/useAuth";
import { signInFormSchema } from "@plotpoint/schemas";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";

export default function LoginModal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const router = useRouter();
  const signInMutation = useSignIn();

  const handleSignIn = async () => {
    try {
      const validatedData = signInFormSchema.parse({ email, password });
      setErrors({});

      await signInMutation.mutateAsync(validatedData);

      if (returnTo) {
        router.replace(returnTo as any);
      } else {
        router.replace("/");
      }
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
        Alert.alert("Error", error.message || "Failed to sign in");
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
            <Text className="text-4xl font-bold text-foreground mb-2">Welcome Back</Text>
            <Text className="text-base text-muted-foreground mb-8">Sign in to continue</Text>

            <View className="w-full gap-5">
              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
                {errors.email && (
                  <Text className="text-destructive text-xs mt-1">{errors.email}</Text>
                )}
              </View>

              <View>
                <Text className="text-sm font-semibold text-foreground mb-2">Password</Text>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secureTextEntry
                  autoComplete="password"
                />
                {errors.password && (
                  <Text className="text-destructive text-xs mt-1">{errors.password}</Text>
                )}
              </View>

              <Link
                href={{
                  pathname: "/(modals)/forgot-password",
                  params: { returnTo },
                }}
                className="text-primary text-sm font-semibold text-right"
              >
                Forgot password?
              </Link>

              <Button
                onPress={handleSignIn}
                disabled={signInMutation.isPending}
                isLoading={signInMutation.isPending}
              >
                {signInMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>

              <View className="flex-row justify-center items-center">
                <Text className="text-muted-foreground text-sm">Don't have an account? </Text>
                <Link
                  href={{
                    pathname: "/(modals)/signup",
                    params: { returnTo },
                  }}
                  className="text-primary text-sm font-semibold"
                >
                  Sign Up
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
