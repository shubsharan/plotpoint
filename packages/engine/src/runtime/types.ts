import type { Clock } from '../ports/clock.js';
import type { LocationReader } from '../ports/location-reader.js';
import type { StoryPackageRepo } from '../ports/story-package-repo.js';
import type {
  LoadSessionInput,
  StartSessionInput,
  SubmitActionInput,
  TraverseInput,
} from './contracts/command-inputs.js';
import type { RuntimeFrame } from './contracts/runtime-frame.js';
import type {
  CurrentNodeBlockView,
  CurrentNodeView,
  RuntimeView,
  TraversableEdge,
} from './contracts/runtime-view.js';
import type { SessionState } from './contracts/session-state.js';

export type {
  LoadSessionInput,
  StartSessionInput,
  SubmitActionInput,
  TraverseInput,
} from './contracts/command-inputs.js';
export type { RuntimeFrame } from './contracts/runtime-frame.js';
export type {
  CurrentNodeBlockView,
  CurrentNodeView,
  RuntimeView,
  TraversableEdge,
} from './contracts/runtime-view.js';
export type { SessionState } from './contracts/session-state.js';

export type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock | undefined;
  locationReader?: LocationReader | undefined;
};

export type Engine = {
  startSession: (input: StartSessionInput) => Promise<RuntimeFrame>;
  loadSession: (input: LoadSessionInput) => Promise<RuntimeFrame>;
  submitAction: (input: SubmitActionInput) => Promise<RuntimeFrame>;
  traverse: (input: TraverseInput) => Promise<RuntimeFrame>;
};
