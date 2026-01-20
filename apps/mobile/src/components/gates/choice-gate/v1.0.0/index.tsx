import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import type { ChoiceGateProps } from './types';
import { choiceGateSchema } from './schema';
import { registerComponent } from '@engine/registry';

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
    const choices = edges.filter((e) => e.edgeType === 'choice');
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
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {timedChoice && timeLimit && (
        <View style={styles.timerContainer}>
          <Animated.View
            style={[
              styles.timerBar,
              {
                width: timerBarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
          <Text style={styles.timerText}>{timeRemaining}s</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {showPrompt && prompt && (
          <Text style={styles.prompt}>{prompt}</Text>
        )}

        <View style={styles.choicesContainer}>
          {choiceEdges.map((edge, index) => {
            return (
              <Pressable
                key={edge.id}
                style={styles.choiceButton}
                onPress={() => handleChoicePress(edge.id)}
              >
                <Text style={styles.choiceText}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  timerContainer: {
    height: 40,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#3b82f6',
    opacity: 0.3,
  },
  timerText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  prompt: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 24,
    lineHeight: 30,
  },
  choicesContainer: {
    gap: 12,
  },
  choiceButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  choiceText: {
    fontSize: 16,
    color: '#e0e0e0',
    flex: 1,
  },
});

// Register the component with new taxonomy
registerComponent({
  componentType: 'choice_gate',
  version: '1.0.0',
  Component: ChoiceGateV1,
  propsSchema: choiceGateSchema,
  defaultProps: {
    showPrompt: true,
    shuffleChoices: false,
    timedChoice: false,
  },
});

export default ChoiceGateV1;
