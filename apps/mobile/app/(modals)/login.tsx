import { useState } from "react";
import { View, Text, Alert } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useSignIn } from "@/hooks/use-auth";
import { signInFormSchema } from "@plotpoint/schemas";
import { Button } from "@/components/ui/Button";
import { AuthFormLayout } from "@features/auth/auth-form-layout";
import { FormField } from "@features/auth/form-field";

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
    <AuthFormLayout title="Welcome Back" subtitle="Sign in to continue">
      <View className="w-full gap-5">
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

        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
          autoComplete="password"
          error={errors.password}
        />

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
    </AuthFormLayout>
  );
}
