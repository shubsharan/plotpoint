import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { EndProps } from './types';
import { endSchema } from './schema';
import { registerComponent } from '@plotpoint/engine/registry';

function EndV1({ data, context, edges }: EndProps) {
  const router = useRouter();
  const {
    endingType = 'neutral',
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
      case 'success':
        return {
          icon: '🏆',
          defaultTitle: 'Victory!',
          backgroundColor: '#1a3d1a',
          accentColor: '#4ade80',
        };
      case 'failure':
        return {
          icon: '💀',
          defaultTitle: 'Game Over',
          backgroundColor: '#3d1a1a',
          accentColor: '#f87171',
        };
      case 'secret':
        return {
          icon: '🌟',
          defaultTitle: 'Secret Ending',
          backgroundColor: '#3d3d1a',
          accentColor: '#fbbf24',
        };
      case 'neutral':
      default:
        return {
          icon: '📖',
          defaultTitle: 'The End',
          backgroundColor: '#1a1a1a',
          accentColor: '#94a3b8',
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
      style={[styles.container, { backgroundColor: config.backgroundColor }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.icon}>{config.icon}</Text>
        <Text style={[styles.title, { color: config.accentColor }]}>
          {title ?? config.defaultTitle}
        </Text>

        {message && <Text style={styles.message}>{message}</Text>}

        {showStats && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>Your Journey</Text>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Nodes Visited</Text>
              <Text style={styles.statValue}>{context.visitedNodes.length}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Items Collected</Text>
              <Text style={styles.statValue}>
                {context.inventory.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          </View>
        )}

        {showCredits && (
          <View style={styles.creditsContainer}>
            <Text style={styles.creditsTitle}>Credits</Text>
            <Text style={styles.creditsText}>Made with Plotpoint</Text>
          </View>
        )}

        <View style={styles.buttonsContainer}>
          {allowRestart && (
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={handleRestart}
            >
              <Text style={styles.buttonText}>Play Again</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={handleExit}
          >
            <Text style={styles.secondaryButtonText}>Exit Story</Text>
          </Pressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  icon: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontSize: 18,
    lineHeight: 28,
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 32,
  },
  statsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 16,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 16,
    color: '#e0e0e0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  creditsContainer: {
    marginBottom: 32,
  },
  creditsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 8,
    textAlign: 'center',
  },
  creditsText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4a4a4a',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#888888',
    fontSize: 18,
    fontWeight: '500',
  },
});

// Register the component
registerComponent({
  componentType: 'end',
  version: '1.0.0',
  Component: EndV1,
  propsSchema: endSchema,
  defaultProps: {
    endingType: 'neutral',
    showStats: false,
    allowRestart: true,
    showCredits: false,
  },
});

export default EndV1;
