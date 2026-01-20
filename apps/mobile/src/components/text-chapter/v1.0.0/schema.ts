import { z } from 'zod';

export const textChapterSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
  showContinueButton: z.boolean().default(true),
  continueButtonText: z.string().default('Continue'),
  autoAdvanceDelay: z.number().int().min(0).optional(),
  typingEffect: z.boolean().default(false),
  typingSpeed: z.number().int().min(1).max(100).default(30),
});

export type TextChapterSchema = z.infer<typeof textChapterSchema>;
