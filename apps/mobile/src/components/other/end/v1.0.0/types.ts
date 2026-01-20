import type { ComponentProps } from '@plotpoint/schemas';

export interface EndData {
  endingType?: 'success' | 'failure' | 'neutral' | 'secret';
  title?: string;
  message?: string;
  showStats?: boolean;
  allowRestart?: boolean;
  showCredits?: boolean;
}

export type EndProps = ComponentProps<EndData>;
