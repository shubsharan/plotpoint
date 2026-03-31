import type { Clock } from '../ports/clock.js';
import type { LocationReader } from '../ports/location-reader.js';
import type { StoryPackageRepo } from '../ports/story-package-repo.js';
import type {
  AvailableEdge,
  LoadRuntimeInput,
  RuntimeState,
  RuntimeSnapshot,
  StartGameInput,
  SubmitActionInput,
} from './schema.js';

export type {
  AvailableEdge,
  LoadRuntimeInput,
  RuntimeState,
  RuntimeSnapshot,
  StartGameInput,
  SubmitActionInput,
};

export type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock | undefined;
  locationReader?: LocationReader | undefined;
};

export type Engine = {
  startGame: (input: StartGameInput) => Promise<RuntimeSnapshot>;
  loadRuntime: (input: LoadRuntimeInput) => Promise<RuntimeSnapshot>;
  submitAction: (input: SubmitActionInput) => Promise<RuntimeSnapshot>;
};
