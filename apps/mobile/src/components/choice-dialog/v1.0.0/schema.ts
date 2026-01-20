import { z } from 'zod';

export const choiceDialogSchema = z.object({
  prompt: z.string().optional(),
  showPrompt: z.boolean().default(true),
  allowMultiple: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(1),
  maxSelections: z.number().int().min(1).optional(),
  shuffleChoices: z.boolean().default(false),
  timedChoice: z.boolean().default(false),
  timeLimit: z.number().int().min(1).optional(),
  defaultChoice: z.string().optional(),
});

export type ChoiceDialogSchema = z.infer<typeof choiceDialogSchema>;
