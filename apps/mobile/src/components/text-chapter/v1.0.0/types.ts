import type { ComponentProps } from "@plotpoint/schemas";

export interface TextChapterData {
  title?: string;
  content: string;
  showContinueButton?: boolean;
  continueButtonText?: string;
  autoAdvanceDelay?: number;
  typingEffect?: boolean;
  typingSpeed?: number;
}

export type TextChapterProps = ComponentProps<TextChapterData>;
