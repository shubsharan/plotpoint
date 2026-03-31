import type { Clock } from '../ports/clock.js';
import type { LocationReader } from '../ports/location-reader.js';
import type { StoryPackageRepo } from '../ports/story-package-repo.js';
import type {
  AvailableEdge,
  LoadRuntimeInput,
  RuntimeSnapshot,
  SubmitActionInput,
} from './schema.js';

export type { AvailableEdge, LoadRuntimeInput, RuntimeSnapshot, SubmitActionInput };

export type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock | undefined;
  locationReader?: LocationReader | undefined;
};

export type StartGameInput = {
  gameId: string;
  playerId: string;
  roleId: string;
  storyId: string;
};

export type Engine = {
  startGame: (input: StartGameInput) => Promise<RuntimeSnapshot>;
  loadRuntime: (input: LoadRuntimeInput) => Promise<RuntimeSnapshot>;
  submitAction: (input: SubmitActionInput) => Promise<RuntimeSnapshot>;
};
