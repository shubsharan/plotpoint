import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView, Animated } from "react-native";
import { cn } from "../../../lib/utils";
import type { ChoiceDialogProps } from "./types";
import { choiceDialogSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function ChoiceDialogV1({ data, context, edges }: ChoiceDialogProps) {
  const {
    prompt,
    showPrompt = true,
    allowMultiple = false,
    minSelections = 1,
    maxSelections,
    shuffleChoices = false,
    timedChoice = false,
    timeLimit,
    defaultChoice,
  } = data;

  const [selectedChoices, setSelectedChoices] = useState<Set<string>>(new Set());
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
    if (allowMultiple) {
      setSelectedChoices((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(edgeId)) {
          newSet.delete(edgeId);
        } else if (!maxSelections || newSet.size < maxSelections) {
          newSet.add(edgeId);
        }
        return newSet;
      });
    } else {
      // Single selection - navigate immediately
      context.onNavigate(edgeId);
    }
  };

  const handleConfirm = () => {
    if (selectedChoices.size >= minSelections) {
      // For multiple selections, navigate to the first selected choice
      // The game state could store all selections if needed
      const firstSelected = Array.from(selectedChoices)[0];
      if (firstSelected) {
        context.onStateUpdate({
          lastMultipleChoices: Array.from(selectedChoices),
        });
        context.onNavigate(firstSelected);
      }
    }
  };

  const canConfirm = selectedChoices.size >= minSelections;

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

        {allowMultiple && (
          <Text className="text-muted-foreground text-sm mb-4">
            Select{" "}
            {minSelections === maxSelections
              ? minSelections
              : `${minSelections}${maxSelections ? `-${maxSelections}` : "+"}`}{" "}
            option{minSelections !== 1 ? "s" : ""}
          </Text>
        )}

        <View className="gap-3">
          {choiceEdges.map((edge, index) => {
            const isSelected = selectedChoices.has(edge.id);
            return (
              <Pressable
                key={edge.id}
                className={cn(
                  "flex-row bg-card border-2 rounded-xl p-5 items-center justify-between",
                  isSelected ? "border-primary bg-blue-950" : "border-border",
                )}
                onPress={() => handleChoicePress(edge.id)}
              >
                <Text
                  className={cn(
                    "text-base flex-1",
                    isSelected ? "text-foreground" : "text-card-foreground",
                  )}
                >
                  {edge.label ?? `Option ${index + 1}`}
                </Text>
                {allowMultiple && (
                  <View
                    className={cn(
                      "w-6 h-6 rounded border-2 ml-3 items-center justify-center",
                      isSelected ? "bg-primary border-primary" : "border-muted",
                    )}
                  >
                    {isSelected && (
                      <Text className="text-primary-foreground text-sm font-bold">✓</Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {allowMultiple && (
        <View className="absolute bottom-0 left-0 right-0 p-6 bg-background border-t-1 border-border">
          <Pressable
            className={cn("py-4 rounded-lg items-center", canConfirm ? "bg-primary" : "bg-muted")}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            <Text
              className={cn(
                "text-lg font-semibold",
                canConfirm ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Confirm Selection
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

// Register the component
registerComponent({
  componentType: "choice_dialog",
  version: "1.0.0",
  Component: ChoiceDialogV1,
  propsSchema: choiceDialogSchema,
  defaultProps: {
    showPrompt: true,
    allowMultiple: false,
    minSelections: 1,
    shuffleChoices: false,
    timedChoice: false,
  },
});

export default ChoiceDialogV1;
