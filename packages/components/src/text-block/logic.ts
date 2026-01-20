/**
 * Calculate the displayed content based on typing progress
 */
export function getTypingState(
  content: string,
  currentIndex: number,
  typingEnabled: boolean
): {
  displayedContent: string;
  isComplete: boolean;
} {
  if (!typingEnabled) {
    return {
      displayedContent: content,
      isComplete: true,
    };
  }

  const isComplete = currentIndex >= content.length;
  return {
    displayedContent: content.slice(0, currentIndex),
    isComplete,
  };
}

/**
 * Calculate whether auto-advance should trigger
 */
export function shouldAutoAdvance(
  isTypingComplete: boolean,
  autoAdvanceDelay?: number
): boolean {
  return isTypingComplete && autoAdvanceDelay !== undefined && autoAdvanceDelay > 0;
}

/**
 * Calculate the next character index for typing animation
 */
export function getNextTypingIndex(
  currentIndex: number,
  contentLength: number
): number {
  return Math.min(currentIndex + 1, contentLength);
}
