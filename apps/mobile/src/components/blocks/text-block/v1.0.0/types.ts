import type { ComponentProps } from '@plotpoint/types';
import type { TextBlockProps as TextBlockPropsSchema } from '@plotpoint/validators';

export type TextBlockData = TextBlockPropsSchema;

export type TextBlockProps = ComponentProps<TextBlockData>;
