import { z } from 'zod';

export const videoPlayerSchema = z.object({
  videoUrl: z.string().url(),
  posterUrl: z.string().url().optional(),
  autoPlay: z.boolean().default(false),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  showControls: z.boolean().default(true),
  onEndAction: z.enum(['pause', 'continue', 'loop']).default('continue'),
});

export type VideoPlayerSchema = z.infer<typeof videoPlayerSchema>;
