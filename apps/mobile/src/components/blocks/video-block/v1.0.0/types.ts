import type { ComponentProps } from '@plotpoint/types';
import type { VideoBlockProps as VideoBlockPropsSchema } from '@plotpoint/validators';

export type VideoBlockData = VideoBlockPropsSchema;

export type VideoBlockProps = ComponentProps<VideoBlockData>;
