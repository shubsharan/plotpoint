import type { StoryPackage } from './schema.js';

export type StoryPackageValidationPath = ReadonlyArray<number | string>;
export type StoryPackageValidationLayer = 'compatibility' | 'schema' | 'structure';

export type StoryPackageValidationIssue = {
  layer: StoryPackageValidationLayer;
  code: string;
  path: StoryPackageValidationPath;
  message: string;
  details?: Record<string, boolean | null | number | string>;
};

export type StoryPackageCompatibilityMode = 'draft' | 'published' | 'runtime';

export type StoryPackageCompatibilityOptions = {
  currentEngineMajor: number;
  mode?: StoryPackageCompatibilityMode;
};

export type StoryPackageValidator = (storyPackage: StoryPackage) => StoryPackageValidationIssue[];

export type { StoryPackage };
