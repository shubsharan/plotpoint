import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import type { ChoiceDialogProps } from './types';
import { choiceDialogSchema } from './schema';
import { registerComponent } from '@engine/registry';

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

        {allowMultiple && (
          <Text style={styles.hint}>
            Select {minSelections === maxSelections
              ? minSelections
              : `${minSelections}${maxSelections ? `-${maxSelections}` : '+'}`} option{minSelections !== 1 ? 's' : ''}
          </Text>
        )}

        <View style={styles.choicesContainer}>
          {choiceEdges.map((edge, index) => {
            const isSelected = selectedChoices.has(edge.id);
            return (
              <Pressable
                key={edge.id}
                style={[
                  styles.choiceButton,
                  isSelected && styles.choiceButtonSelected,
                ]}
                onPress={() => handleChoicePress(edge.id)}
              >
                <Text
                  style={[
                    styles.choiceText,
                    isSelected && styles.choiceTextSelected,
                  ]}
                >
                  {edge.label ?? `Option ${index + 1}`}
                </Text>
                {allowMultiple && (
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {allowMultiple && (
        <View style={styles.confirmContainer}>
          <Pressable
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            <Text
              style={[
                styles.confirmText,
                !canConfirm && styles.confirmTextDisabled,
              ]}
            >
              Confirm Selection
            </Text>
          </Pressable>
        </View>
      )}
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
  hint: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 16,
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
  choiceButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1a2744',
  },
  choiceText: {
    fontSize: 16,
    color: '#e0e0e0',
    flex: 1,
  },
  choiceTextSelected: {
    color: '#ffffff',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a4a4a',
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  confirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#2a2a2a',
  },
  confirmText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  confirmTextDisabled: {
    color: '#666666',
  },
});

// Register the component
registerComponent({
  componentType: 'choice_dialog',
  version: '1.0.0',
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
