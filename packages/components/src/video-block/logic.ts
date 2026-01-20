/**
 * Format milliseconds to MM:SS format
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate playback progress as a percentage
 */
export function getPlaybackProgress(
  currentPosition: number,
  duration: number
): number {
  if (duration === 0) return 0;
  return Math.min(100, Math.max(0, (currentPosition / duration) * 100));
}

/**
 * Determine if video should show continue button
 */
export function shouldShowContinue(
  hasEnded: boolean,
  onEndAction: 'continue' | 'loop' | 'pause'
): boolean {
  return hasEnded || onEndAction === 'pause';
}
