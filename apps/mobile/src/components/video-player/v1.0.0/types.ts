import type { ComponentProps } from "@plotpoint/schemas";

export interface VideoPlayerData {
  videoUrl: string;
  posterUrl?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  showControls?: boolean;
  onEndAction?: "pause" | "continue" | "loop";
}

export type VideoPlayerProps = ComponentProps<VideoPlayerData>;
