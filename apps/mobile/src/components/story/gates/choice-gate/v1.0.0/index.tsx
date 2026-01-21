import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView, Animated } from "react-native";
import type { ChoiceGateProps } from "./types";
import { choiceGateSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function ChoiceGateV1({ data, context, edges }: ChoiceGateProps) {
  const {
    prompt,
    showPrompt = true,
    shuffleChoices = false,
    timedChoice = false,
    timeLimit,
    defaultChoice,
  } = data;

  const [timeRemaining, setTimeRemaining] = useState(timeLimit);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerBarAnim = useRef(new Animated.Value(1)).current;

  // Get choice edges (edges with type 'choice')
  const choiceEdges = useMemo(() => {
    const choices = edges.filter((e) => e.edgeType === "choice");
    return shuffleChoices ? shuffleArray(choices) : choices;
  }, [edges, shuffleChoices]);

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Timer for timed choices
  useEffect(() => {
    if (!timedChoice || !timeLimit) return;

    setTimeRemaining(timeLimit);

    // Animate timer bar
    Animated.timing(timerBarAnim, {
      toValue: 0,
      duration: timeLimit * 1000,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === undefined || prev <= 1) {
          clearInterval(interval);
          // Auto-select default choice or first choice
          if (defaultChoice) {
            context.onNavigate(defaultChoice);
          } else if (choiceEdges.length > 0) {
            context.onNavigate(choiceEdges[0].id);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timedChoice, timeLimit, defaultChoice, choiceEdges, context]);

  const handleChoicePress = (edgeId: string) => {
    // Single selection - navigate immediately
    context.onNavigate(edgeId);
  };

  return (
    <Animated.View style={[{ flex: 1, opacity: fadeAnim }]} className="bg-background">
      {timedChoice && timeLimit && (
        <View className="h-10 bg-card justify-center items-center">
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                backgroundColor: "var(--primary)",
                opacity: 0.3,
              },
              {
                width: timerBarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
          <Text className="text-card-foreground text-base font-semibold">{timeRemaining}s</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        {showPrompt && prompt && (
          <Text className="text-foreground text-2xl font-semibold mb-6 leading-8">{prompt}</Text>
        )}

        <View className="gap-3">
          {choiceEdges.map((edge, index) => {
            return (
              <Pressable
                key={edge.id}
                className="bg-card border-2 border-border rounded-xl p-5 flex-row items-center justify-between"
                onPress={() => handleChoicePress(edge.id)}
              >
                <Text className="text-card-foreground text-base flex-1">
                  {edge.label ?? `Option ${index + 1}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// Register the component with new taxonomy
registerComponent({
  componentType: "choice_gate",
  version: "1.0.0",
  Component: ChoiceGateV1,
  propsSchema: choiceGateSchema,
  defaultProps: {
    showPrompt: true,
    shuffleChoices: false,
    timedChoice: false,
  },
});

export default ChoiceGateV1;
