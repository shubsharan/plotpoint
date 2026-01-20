import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated } from 'react-native';
import type { TextChapterProps } from './types';
import { textChapterSchema } from './schema';
import { registerComponent } from '@plotpoint/engine/registry';

function TextChapterV1({ data, context, edges }: TextChapterProps) {
  const {
    title,
    content,
    showContinueButton = true,
    continueButtonText = 'Continue',
    autoAdvanceDelay,
    typingEffect = false,
    typingSpeed = 30,
  } = data;

  const [displayedContent, setDisplayedContent] = useState(typingEffect ? '' : content);
  const [isTypingComplete, setIsTypingComplete] = useState(!typingEffect);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentIndexRef = useRef(0);

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Typing effect
  useEffect(() => {
    if (!typingEffect) {
      setDisplayedContent(content);
      setIsTypingComplete(true);
      return;
    }

    setDisplayedContent('');
    contentIndexRef.current = 0;
    setIsTypingComplete(false);

    const timer = setInterval(() => {
      if (contentIndexRef.current < content.length) {
        setDisplayedContent(content.slice(0, contentIndexRef.current + 1));
        contentIndexRef.current++;
      } else {
        clearInterval(timer);
        setIsTypingComplete(true);
      }
    }, typingSpeed);

    return () => clearInterval(timer);
  }, [content, typingEffect, typingSpeed]);

  // Auto-advance
  useEffect(() => {
    if (!isTypingComplete || !autoAdvanceDelay) return;

    const timer = setTimeout(() => {
      context.onComplete();
    }, autoAdvanceDelay);

    return () => clearTimeout(timer);
  }, [isTypingComplete, autoAdvanceDelay, context]);

  const handleSkipTyping = () => {
    if (!isTypingComplete) {
      setDisplayedContent(content);
      setIsTypingComplete(true);
    }
  };

  const handleContinue = () => {
    context.onComplete();
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onTouchEnd={typingEffect && !isTypingComplete ? handleSkipTyping : undefined}
      >
        {title && <Text style={styles.title}>{title}</Text>}
        <Text style={styles.content}>{displayedContent}</Text>
        {typingEffect && !isTypingComplete && (
          <Text style={styles.hint}>Tap to skip</Text>
        )}
      </ScrollView>

      {showContinueButton && isTypingComplete && (
        <View style={styles.buttonContainer}>
          <Pressable style={styles.button} onPress={handleContinue}>
            <Text style={styles.buttonText}>{continueButtonText}</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 24,
  },
  content: {
    fontSize: 18,
    lineHeight: 28,
    color: '#e0e0e0',
  },
  hint: {
    fontSize: 14,
    color: '#666666',
    marginTop: 16,
    fontStyle: 'italic',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});

// Register the component
registerComponent({
  componentType: 'text_chapter',
  version: '1.0.0',
  Component: TextChapterV1,
  propsSchema: textChapterSchema,
  defaultProps: {
    showContinueButton: true,
    continueButtonText: 'Continue',
    typingEffect: false,
    typingSpeed: 30,
  },
});

export default TextChapterV1;
