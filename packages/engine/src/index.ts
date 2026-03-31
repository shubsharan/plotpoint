export { blockRegistry, getBlockDefinition, hasBlockType } from './blocks/index.js';
export type {
  BlockConfig,
  BlockRegistryEntry,
  BlockScope,
  KnownBlockType,
} from './blocks/index.js';
export { conditionRegistry, hasConditionName } from './graph/conditions.js';
export type { KnownConditionName } from './graph/conditions.js';
export type { Clock } from './ports/clock.js';
export type { GeoCoord, LocationReader } from './ports/location-reader.js';
export type {
  PublishedStoryPackage,
  StoryPackageRepo,
} from './ports/story-package-repo.js';
export { createEngine } from './runtime/create-engine.js';
export { EngineRuntimeError } from './runtime/errors.js';
export type { EngineRuntimeErrorCode } from './runtime/errors.js';
export type {
  AvailableEdge,
  Engine,
  EnginePorts,
  LoadRuntimeInput,
  RuntimeState,
  RuntimeSnapshot,
  StartGameInput,
  SubmitActionInput,
} from './runtime/types.js';
export {
  storyPackageBlockSchema,
  storyPackageConditionSchema,
  storyPackageEdgeSchema,
  storyPackageGraphSchema,
  storyPackageJsonObjectSchema,
  storyPackageJsonValueSchema,
  storyPackageMetadataSchema,
  storyPackageNodeSchema,
  storyPackageRoleSchema,
  storyPackageSchema,
  storyPackageVersionSchema,
} from './story-packages/schema.js';
export type {
  StoryPackageCompatibilityMode,
  StoryPackageCompatibilityOptions,
  StoryPackageValidationIssue,
  StoryPackageValidationLayer,
  StoryPackageValidationPath,
  StoryPackageValidator,
} from './story-packages/types.js';
export type { StoryPackage, StoryPackageCondition } from './story-packages/schema.js';
export { validateStoryPackageCompatibility } from './story-packages/validate-compatibility.js';
export { validateStoryPackageStructure } from './story-packages/validate-structure.js';
export { currentEngineMajor } from './version.js';
