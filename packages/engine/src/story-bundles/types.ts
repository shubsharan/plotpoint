import type { StoryBundle } from "./schema.js";

export type StoryBundleValidationPath = ReadonlyArray<number | string>;
export type StoryBundleValidationLayer = "compatibility" | "schema" | "structure";

export type StoryBundleValidationIssue = {
  layer: StoryBundleValidationLayer;
  code: string;
  path: StoryBundleValidationPath;
  message: string;
  details?: Record<string, boolean | null | number | string>;
};

export type StoryBundleCompatibilityMode = "draft" | "published" | "runtime";

export type StoryBundleCompatibilityOptions = {
  currentEngineMajor: number;
  mode?: StoryBundleCompatibilityMode;
};

export type StoryBundleValidator = (bundle: StoryBundle) => StoryBundleValidationIssue[];

export type { StoryBundle };
