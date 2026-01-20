import type { Story, StoryNode, StoryEdge, StoryManifest, StorySession } from '@plotpoint/db';
import type { StoryGraph } from '../graph/story-graph';
import type { ValidationResult } from '../graph/validator';
import type { StoryExecutor } from '../executor/story-executor';
import type { EngineEvent } from '../events/event-emitter';
import { createStoryGraph } from '../graph/story-graph';
import { validateGraph } from '../graph/validator';
import { createStoryExecutor } from '../executor/story-executor';

/**
 * Input data for loading a story.
 */
export interface StoryData {
  story: Story;
  nodes: StoryNode[];
  edges: StoryEdge[];
  manifest?: StoryManifest;
}

/**
 * A loaded story with graph, validation, and manifest.
 */
export interface LoadedStory {
  story: Story;
  graph: StoryGraph;
  manifest: StoryManifest | null;
  validation: ValidationResult;
}

/**
 * Load a story from its component parts.
 * Creates the graph, validates it, and returns a LoadedStory.
 */
export function loadStory(data: StoryData): LoadedStory {
  const { story, nodes, edges, manifest } = data;

  // Validate that story has a start node
  if (!story.startNodeId) {
    throw new Error(`Story '${story.title}' has no startNodeId`);
  }

  // Create the graph
  const graph = createStoryGraph(nodes, edges, story.startNodeId);

  // Validate the graph
  const validation = validateGraph(graph);

  return {
    story,
    graph,
    manifest: manifest ?? null,
    validation,
  };
}

/**
 * Prepare a story executor from a loaded story.
 * Convenience function that creates an executor ready for execution.
 */
export function prepareExecutor(
  loaded: LoadedStory,
  initialState?: Partial<StorySession>,
  onEvent?: (event: EngineEvent) => void
): StoryExecutor {
  // Warn if validation failed
  if (!loaded.validation.valid) {
    console.warn(
      `Story '${loaded.story.title}' has validation errors:`,
      loaded.validation.errors
    );
  }

  // Create executor
  const executor = createStoryExecutor({
    graph: loaded.graph,
    manifest: loaded.manifest ?? undefined,
    initialState,
    onEvent,
  });

  // Initialize if no initial state provided
  if (!initialState || !initialState.currentNodeId) {
    executor.start();
  }

  return executor;
}

/**
 * Load and start a story in one step.
 * Returns both the loaded story and a ready-to-use executor.
 */
export function loadAndStart(
  data: StoryData,
  onEvent?: (event: EngineEvent) => void
): { loaded: LoadedStory; executor: StoryExecutor } {
  const loaded = loadStory(data);
  const executor = prepareExecutor(loaded, undefined, onEvent);

  return { loaded, executor };
}

/**
 * Check if a loaded story is valid (no validation errors).
 */
export function isStoryValid(loaded: LoadedStory): boolean {
  return loaded.validation.valid;
}

/**
 * Get validation error count from a loaded story.
 */
export function getValidationErrorCount(loaded: LoadedStory): number {
  return loaded.validation.errors.length;
}

/**
 * Get validation warning count from a loaded story.
 */
export function getValidationWarningCount(loaded: LoadedStory): number {
  return loaded.validation.warnings.length;
}
