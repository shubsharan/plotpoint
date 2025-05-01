import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useForm } from "@tanstack/react-form";
import React, { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
// @ts-ignore
import { useRouter } from "expo-router";

export default function SignupScreen() {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS !== "web" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          className="bg-background-0"
        >
          <Center className="h-full w-full p-4">
            <Box className="w-full max-w-md">
              <LoginForm />
            </Box>
          </Center>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const LoginForm = () => {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false); // State to toggle password visibility

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    onSubmit: async (values) => {
      console.log(values.value);
    },
  });

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev); // Toggle the state
  };

  return (
    <VStack className="gap-6 w-full">
      <form.Field name="name" validators={{}}>
        {(field) => (
          <FormControl
            isInvalid={!field.state.meta.isValid}
            size="lg"
            isDisabled={form.state.isSubmitting}
            className="w-full"
          >
            <FormControlLabel>
              <FormControlLabelText>Email</FormControlLabelText>
            </FormControlLabel>
            <Input className="w-full" size="lg">
              <InputField
                type="text"
                placeholder="Miles Morales"
                value={field.state.value}
                onChangeText={field.setValue}
                className="w-full"
              />
            </Input>
          </FormControl>
        )}
      </form.Field>
      <form.Field name="email" validators={{}}>
        {(field) => (
          <FormControl
            isInvalid={!field.state.meta.isValid}
            size="lg"
            isDisabled={form.state.isSubmitting}
            className="w-full"
          >
            <FormControlLabel>
              <FormControlLabelText>Email</FormControlLabelText>
            </FormControlLabel>
            <Input className="w-full" size="lg">
              <InputField
                type="text"
                placeholder="miles@spidey.web"
                value={field.state.value}
                onChangeText={field.setValue}
                className="w-full"
              />
            </Input>
          </FormControl>
        )}
      </form.Field>
      <form.Field name="password" validators={{}}>
        {(field) => (
          <FormControl
            isInvalid={!field.state.meta.isValid}
            size="lg"
            isDisabled={form.state.isSubmitting}
            className="w-full"
          >
            <FormControlLabel>
              <FormControlLabelText>Password</FormControlLabelText>
            </FormControlLabel>
            <Input className="w-full relative" size="lg">
              <InputField
                type={showPassword ? "text" : "password"} // Toggle between text and password
                placeholder="Create a password"
                value={field.state.value}
                onChangeText={field.setValue}
                className="w-full"
              />
              <InputSlot className="mr-4">
                <TouchableOpacity onPress={togglePasswordVisibility}>
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"} // Toggle icon
                    size={20}
                    color="black"
                  />
                </TouchableOpacity>
              </InputSlot>
            </Input>
          </FormControl>
        )}
      </form.Field>
      <Button
        size="lg"
        variant="solid"
        action="primary"
        onPress={form.handleSubmit}
      >
        <ButtonText>Continue</ButtonText>
      </Button>
      <HStack className="w-full flex-row justify-center items-center gap-2">
        <Text>Already have an account?</Text>
        <Button
          variant="link"
          action="primary"
          onPress={() => router.replace("login", { animation: "none" })}
        >
          <ButtonText>Log in</ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
};
