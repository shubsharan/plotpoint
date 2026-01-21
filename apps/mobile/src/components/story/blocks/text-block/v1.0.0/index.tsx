import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Animated } from "react-native";
import type { TextBlockProps } from "./types";
import { textBlockSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

function TextBlockV1({ data, context, edges: _edges }: TextBlockProps) {
  const {
    title,
    content,
    showContinueButton = true,
    continueButtonText = "Continue",
    autoAdvanceDelay,
    typingEffect = false,
    typingSpeed = 30,
  } = data;

  const [displayedContent, setDisplayedContent] = useState(typingEffect ? "" : content);
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

    setDisplayedContent("");
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
    <Animated.View style={[{ flex: 1, opacity: fadeAnim }]} className="bg-background">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        onTouchEnd={typingEffect && !isTypingComplete ? handleSkipTyping : undefined}
      >
        {title && <Text className="text-foreground text-2xl font-bold mb-6">{title}</Text>}
        <Text className="text-foreground text-lg leading-7">{displayedContent}</Text>
        {typingEffect && !isTypingComplete && (
          <Text className="text-muted-foreground text-sm mt-4 italic">Tap to skip</Text>
        )}
      </ScrollView>

      {showContinueButton && isTypingComplete && (
        <View className="absolute bottom-0 left-0 right-0 p-6 bg-background border-t-1 border-border">
          <Pressable className="bg-primary py-4 rounded-lg items-center" onPress={handleContinue}>
            <Text className="text-primary-foreground text-lg font-semibold">
              {continueButtonText}
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

// Register the component with new taxonomy
registerComponent({
  componentType: "text_block",
  version: "1.0.0",
  Component: TextBlockV1,
  propsSchema: textBlockSchema,
  defaultProps: {
    showContinueButton: true,
    continueButtonText: "Continue",
    typingEffect: false,
    typingSpeed: 30,
  },
});

export default TextBlockV1;
