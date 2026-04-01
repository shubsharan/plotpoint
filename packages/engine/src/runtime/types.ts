import type { Clock } from '../ports/clock.js';
import type { LocationReader } from '../ports/location-reader.js';
import type { StoryPackageRepo } from '../ports/story-package-repo.js';
import type {
  CurrentNodeBlockSnapshot,
  CurrentNodeSnapshot,
  PerformBlockActionInput,
  LoadRuntimeInput,
  RuntimeState,
  RuntimeSnapshot,
  StartGameInput,
  TraversableEdge,
  TraverseEdgeInput,
} from './schema.js';

export type {
  CurrentNodeBlockSnapshot,
  CurrentNodeSnapshot,
  PerformBlockActionInput,
  LoadRuntimeInput,
  RuntimeState,
  RuntimeSnapshot,
  StartGameInput,
  TraversableEdge,
  TraverseEdgeInput,
};

export type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock | undefined;
  locationReader?: LocationReader | undefined;
};

export type Engine = {
  startGame: (input: StartGameInput) => Promise<RuntimeSnapshot>;
  loadRuntime: (input: LoadRuntimeInput) => Promise<RuntimeSnapshot>;
  performBlockAction: (input: PerformBlockActionInput) => Promise<RuntimeSnapshot>;
  traverseEdge: (input: TraverseEdgeInput) => Promise<RuntimeSnapshot>;
};
