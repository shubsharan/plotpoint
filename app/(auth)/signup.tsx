import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { z } from "zod";

export default function SignupScreen() {
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      className="bg-background-0"
    >
      <View className="h-full w-full p-4 items-center justify-center">
        <View className="w-full max-w-md">
          <SignupForm />
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}

// Define the validation schema using zod
const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

const SignupForm = () => {
  const router = useRouter();
  const { signUp } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Initialize react-hook-form with zod validation
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    try {
      await signUp(data.name, data.email, data.password);
      router.replace("/profile");
    } catch {
      setShowErrorMessage(true);
      setErrorMessage("Failed to sign up. Please try again.");
    }
  };

  return (
    <View className="gap-4 w-full">
      {/* Name Field */}
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Input
              placeholder="Miles Morales"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              className="w-full"
            />
            {errors.name && (
              <Text className="text-error-500">{errors.name.message}</Text>
            )}
          </View>
        )}
      />

      {/* Email Field */}
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Input
              placeholder="miles@spidey.web"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              className="w-full"
            />
            {errors.email && (
              <Text className="text-error-500">{errors.email.message}</Text>
            )}
          </View>
        )}
      />

      {/* Password Field */}
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View className="w-full relative">
            <Input
              placeholder="Enter a password"
              secureTextEntry={!showPassword}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              className="w-full"
            />
            <View className="absolute right-4 top-3">
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="black"
                />
              </TouchableOpacity>
            </View>
            {errors.password && (
              <Text className="text-error-500">{errors.password.message}</Text>
            )}
          </View>
        )}
      />

      {/* Submit Button */}
      <Button size="lg" onPress={handleSubmit(onSubmit)}>
        <Text>Continue</Text>
      </Button>

      {/* Error Message */}
      {showErrorMessage && (
        <View className="w-full bg-error-0 p-4 rounded">
          <Text className="text-error-500 text-center">{errorMessage}</Text>
        </View>
      )}

      {/* Additional Links */}
      <View>
        <Button variant="link">
          <Text>Forgot Password?</Text>
        </Button>
        <View className="w-full flex-row justify-center items-center">
          <Text className="text-sm">Already have an account?</Text>
          <Button variant="link" onPress={() => router.replace("/login")}>
            <Text>Log in</Text>
          </Button>
        </View>
      </View>
    </View>
  );
};
