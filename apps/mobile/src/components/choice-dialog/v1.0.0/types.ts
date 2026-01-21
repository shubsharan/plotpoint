import type { ComponentProps } from "@plotpoint/schemas";

export interface ChoiceDialogData {
  prompt?: string;
  showPrompt?: boolean;
  allowMultiple?: boolean;
  minSelections?: number;
  maxSelections?: number;
  shuffleChoices?: boolean;
  timedChoice?: boolean;
  timeLimit?: number;
  defaultChoice?: string;
}

export type ChoiceDialogProps = ComponentProps<ChoiceDialogData>;
