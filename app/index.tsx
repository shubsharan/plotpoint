import LogoComponent from "@/assets/images/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetUserById } from "@/queries/users";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function HomeScreen() {
  const { session } = useAuth();

  const { data: user } = useGetUserById(session?.user.id!);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1">
          {/* Header */}
          <View className="w-full flex flex-row gap-3 items-center px-4 pt-safe pb-3 bg-background web:pt-3">
            {/* Logo */}
            <View className="size-12 rounded-full bg-primary items-center justify-center bg-yellow-300">
              <LogoComponent size={24} />
            </View>

            {/* Search Bar */}
            <View className="flex-grow flex-shrink flex-row items-center">
              <Input
                className="flex-grow py-2 pl-10 overflow-hidden rounded-full h-12"
                placeholder="Search"
              />
              <Ionicons
                name="search-outline"
                size={16}
                className="absolute left-4 text-muted-foreground"
              />
            </View>

            {/* Profile */}
            <Button
              className="size-12 rounded-full items-center justify-center p-0"
              variant={"secondary"}
              size={"icon"}
              onPress={() => {
                router.push("/profile");
              }}
            >
              <Avatar alt={`${user?.name}'s Avatar`} className="size-12">
                <AvatarImage source={{ uri: user?.avatar || undefined }} />
                <AvatarFallback>
                  {user ? (
                    <Text className="text-lg text-primary-foreground font-semibold">
                      {user?.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </Text>
                  ) : (
                    <Ionicons
                      name="person"
                      className="text-primary-foreground"
                      size={16}
                    />
                  )}
                </AvatarFallback>
              </Avatar>
            </Button>
          </View>

          {/* Content */}
          <View className="flex-1 flex-col items-center justify-center bg-background">
            <Ionicons
              name="map-outline"
              size={48}
              className="text-muted-foreground"
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
