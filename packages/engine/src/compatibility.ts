import { parseSemVer } from './semver';

export const ENGINE_VERSION = '1.0.0';

export interface CompatibilityResult {
  compatible: boolean;
  currentVersion: string;
  storyVersion: string;
  message?: string;
}

/**
 * Check if a story's engine version is compatible with current engine.
 * Uses semver: same major version = compatible.
 */
export function checkEngineCompatibility(
  storyEngineVersion: string
): CompatibilityResult {
  const current = parseSemVer(ENGINE_VERSION);
  const story = parseSemVer(storyEngineVersion);

  if (!story) {
    return {
      compatible: false,
      currentVersion: ENGINE_VERSION,
      storyVersion: storyEngineVersion,
      message: `Invalid story engine version: ${storyEngineVersion}`,
    };
  }

  // Same major version = compatible
  const compatible = current!.major === story.major;

  return {
    compatible,
    currentVersion: ENGINE_VERSION,
    storyVersion: storyEngineVersion,
    message: compatible
      ? undefined
      : `Story requires engine v${story.major}.x, but app has v${ENGINE_VERSION}`,
  };
}
