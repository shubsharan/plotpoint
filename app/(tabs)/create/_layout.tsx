import { Stack } from "expo-router";

export default function CreateLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Create",
          presentation: "card",
        }}
      />
    </Stack>
  );
}
