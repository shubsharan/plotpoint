import React, { useRef, useEffect } from "react";
import { View, Text, Pressable, ScrollView, Animated } from "react-native";
import { useRouter } from "expo-router";
import type { EndProps } from "./types";
import { endSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

function EndV1({ data, context, edges }: EndProps) {
  const router = useRouter();
  const {
    endingType = "neutral",
    title,
    message,
    showStats = false,
    allowRestart = true,
    showCredits = false,
  } = data;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const getEndingConfig = () => {
    switch (endingType) {
      case "success":
        return {
          icon: "🏆",
          defaultTitle: "Victory!",
          backgroundColor: "#1a3d1a",
          accentColor: "#4ade80",
        };
      case "failure":
        return {
          icon: "💀",
          defaultTitle: "Game Over",
          backgroundColor: "#3d1a1a",
          accentColor: "#f87171",
        };
      case "secret":
        return {
          icon: "🌟",
          defaultTitle: "Secret Ending",
          backgroundColor: "#3d3d1a",
          accentColor: "#fbbf24",
        };
      case "neutral":
      default:
        return {
          icon: "📖",
          defaultTitle: "The End",
          backgroundColor: "#1a1a1a",
          accentColor: "#94a3b8",
        };
    }
  };

  const config = getEndingConfig();

  const handleRestart = () => {
    // Signal to restart the story
    context.onStateUpdate({ __restart: true });
  };

  const handleExit = () => {
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: config.backgroundColor }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <Animated.View
        style={{
          alignItems: "center",
          width: "100%",
          maxWidth: 400,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <Text className="text-8xl mb-6">{config.icon}</Text>
        <Text style={{ color: config.accentColor }} className="text-4xl font-bold text-center mb-4">
          {title ?? config.defaultTitle}
        </Text>

        {message && (
          <Text className="text-lg leading-7 text-card-foreground text-center mb-8">{message}</Text>
        )}

        {showStats && (
          <View className="bg-black/30 rounded-2xl p-5 w-full mb-6">
            <Text className="text-muted-foreground text-base font-semibold mb-4 text-center">
              Your Journey
            </Text>
            <View className="flex-row justify-between my-2">
              <Text className="text-card-foreground text-base">Nodes Visited</Text>
              <Text className="text-foreground text-base font-semibold">
                {context.visitedNodes.length}
              </Text>
            </View>
            <View className="flex-row justify-between my-2">
              <Text className="text-card-foreground text-base">Items Collected</Text>
              <Text className="text-foreground text-base font-semibold">
                {context.inventory.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          </View>
        )}

        {showCredits && (
          <View className="mb-8">
            <Text className="text-muted-foreground text-sm font-semibold mb-2 text-center">
              Credits
            </Text>
            <Text className="text-muted-foreground text-sm text-center">Made with Plotpoint</Text>
          </View>
        )}

        <View className="w-full gap-3">
          {allowRestart && (
            <Pressable className="bg-primary py-4 rounded-lg items-center" onPress={handleRestart}>
              <Text className="text-primary-foreground text-lg font-semibold">Play Again</Text>
            </Pressable>
          )}
          <Pressable
            className="bg-transparent border-2 border-border py-4 rounded-lg items-center"
            onPress={handleExit}
          >
            <Text className="text-muted-foreground text-lg font-medium">Exit Story</Text>
          </Pressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

// Register the component
registerComponent({
  componentType: "end",
  version: "1.0.0",
  Component: EndV1,
  propsSchema: endSchema,
  defaultProps: {
    endingType: "neutral",
    showStats: false,
    allowRestart: true,
    showCredits: false,
  },
});

export default EndV1;
