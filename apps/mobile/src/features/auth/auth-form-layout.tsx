import { View, Text, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView } from "react-native";

interface AuthFormLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthFormLayout({ title, subtitle, children }: AuthFormLayoutProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 justify-center p-6">
            <Text className="text-4xl font-bold text-foreground mb-2">{title}</Text>
            <Text className="text-base text-muted-foreground mb-8">{subtitle}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
