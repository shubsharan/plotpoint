import type {
  StoryPackageValidationIssue,
  StoryPackageValidationLayer,
  StoryPackageValidationPath,
} from './types.js';

type StoryPackageValidationDetails = NonNullable<StoryPackageValidationIssue['details']>;

export type StoryPackageValidationPathInput = ReadonlyArray<PropertyKey>;

export const normalizeStoryPackageValidationPath = (
  path: StoryPackageValidationPathInput,
): StoryPackageValidationPath =>
  path.map((segment) => (typeof segment === 'number' ? segment : String(segment)));

export const createStoryPackageIssueFactory = (layer: StoryPackageValidationLayer) =>
  (
    code: string,
    path: StoryPackageValidationPathInput,
    message: string,
    details?: StoryPackageValidationDetails,
  ): StoryPackageValidationIssue => {
    const normalizedPath = normalizeStoryPackageValidationPath(path);

    if (details === undefined) {
      return {
        code,
        layer,
        message,
        path: normalizedPath,
      };
    }

    return {
      code,
      details,
      layer,
      message,
      path: normalizedPath,
    };
  };
