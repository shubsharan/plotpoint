import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{
          title: "Log in",
          animation: "none",
        }}
      />
      <Stack.Screen
        name="signup"
        options={{
          title: "Sign up",
          animation: "none",
        }}
      />
      <Stack.Screen
        name="resetPassword"
        options={{
          title: "Reset password",
          animation: "none",
        }}
      />
      <Stack.Screen
        name="updatePassword"
        options={{
          title: "Update password",
          animation: "none",
        }}
      />
    </Stack>
  );
}
