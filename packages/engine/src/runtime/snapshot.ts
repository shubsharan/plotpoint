import type { ZodError, ZodType } from 'zod';
import type { PublishedStoryPackage } from '../ports/story-package-repo.js';
import type { StoryPackage } from '../story-packages/schema.js';
import type { StoryPackageValidationIssue } from '../story-packages/types.js';
import { validateStoryPackageCompatibility } from '../story-packages/validate-compatibility.js';
import { validateStoryPackageStructure } from '../story-packages/validate-structure.js';
import { currentEngineMajor } from '../version.js';
import { EngineRuntimeError } from './errors.js';
import type { EnginePorts, RuntimeSnapshot, RuntimeState, TraversableEdge } from './types.js';

type StoryNode = StoryPackage['graph']['nodes'][number];
type StoryBlock = StoryNode['blocks'][number];
type StoryEdge = StoryNode['edges'][number];

type ResolveRuntimeSnapshotOptions = {
  blockId?: string | undefined;
  edgeId?: string | undefined;
};

type ResolvedRuntimeSnapshotContext = {
  currentNode: StoryNode;
  story: StoryPackage;
  targetBlock?: StoryBlock | undefined;
  targetEdge?: StoryEdge | undefined;
};

const runtimeError = {
  blockNotFound: (storyId: string, nodeId: string, blockId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_block_not_found',
      `Runtime block "${blockId}" was not found in node "${nodeId}" for story "${storyId}".`,
    ),
  edgeNotFound: (storyId: string, nodeId: string, edgeId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_edge_not_found',
      `Runtime edge "${edgeId}" was not found in node "${nodeId}" for story "${storyId}".`,
    ),
  nodeNotFound: (storyId: string, nodeId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_node_not_found',
      `Runtime node "${nodeId}" was not found in story "${storyId}".`,
    ),
  roleNotFound: (storyId: string, roleId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_role_not_found',
      `Runtime role "${roleId}" was not found in story "${storyId}".`,
    ),
  storyIdMismatch: (expectedStoryId: string, actualStoryId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_story_id_mismatch',
      `Runtime story id "${expectedStoryId}" does not match published package story id "${actualStoryId}".`,
    ),
  storyPackageInvalid: (storyId: string, issue: StoryPackageValidationIssue): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_story_package_invalid',
      `Published story package "${storyId}" failed runtime validation: ${issue.code} at ${formatIssuePath(issue.path)}.`,
    ),
  storyPackageUnavailable: (storyId: string, details: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_story_package_unavailable',
      `Published story package "${storyId}" could not be loaded: ${details}.`,
    ),
  storyPackageVersionUnavailable: (
    storyId: string,
    storyPackageVersionId: string,
    details: string,
  ): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_story_package_version_unavailable',
      `Published story package version "${storyPackageVersionId}" for story "${storyId}" could not be loaded: ${details}.`,
    ),
  snapshotInvalid: (details: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_snapshot_invalid',
      `Runtime snapshot input is invalid: ${details}.`,
    ),
} as const;

const createTraversableEdge = (
  edge: StoryPackage['graph']['nodes'][number]['edges'][number],
): TraversableEdge => {
  if (edge.label === undefined) {
    return {
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
    };
  }

  return {
    edgeId: edge.id,
    label: edge.label,
    targetNodeId: edge.targetNodeId,
  };
};

export const formatIssuePath = (path: ReadonlyArray<number | string | symbol>): string => {
  if (path.length === 0) {
    return '<root>';
  }

  let formattedPath = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formattedPath = `${formattedPath}[${segment}]`;
      continue;
    }

    const segmentLabel = String(segment);
    formattedPath =
      formattedPath.length === 0 ? segmentLabel : `${formattedPath}.${segmentLabel}`;
  }

  return formattedPath;
};

const getValidationIssues = (storyPackage: StoryPackage): StoryPackageValidationIssue[] => [
  ...validateStoryPackageStructure(storyPackage),
  ...validateStoryPackageCompatibility(storyPackage, {
    currentEngineMajor,
    mode: 'runtime',
  }),
];

const getErrorDetails = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'unknown error';
};

export const loadStoryOrThrow = async (
  ports: EnginePorts,
  storyId: string,
): Promise<PublishedStoryPackage> => {
  let currentPublishedStory: PublishedStoryPackage;
  try {
    currentPublishedStory = await ports.storyPackageRepo.getCurrentPublishedPackage(storyId);
  } catch (error) {
    if (error instanceof EngineRuntimeError) {
      throw error;
    }

    throw runtimeError.storyPackageUnavailable(storyId, getErrorDetails(error));
  }

  const story = validateStoryOrThrow(currentPublishedStory.storyPackage, storyId);
  return {
    storyPackageVersionId: currentPublishedStory.storyPackageVersionId,
    storyPackage: story,
  };
};

export const loadStoryByVersionOrThrow = async (
  ports: EnginePorts,
  storyId: string,
  storyPackageVersionId: string,
): Promise<StoryPackage> => {
  let story: StoryPackage;
  try {
    story = await ports.storyPackageRepo.getPublishedPackage(storyId, storyPackageVersionId);
  } catch (error) {
    if (error instanceof EngineRuntimeError) {
      throw error;
    }

    throw runtimeError.storyPackageVersionUnavailable(
      storyId,
      storyPackageVersionId,
      getErrorDetails(error),
    );
  }

  return validateStoryOrThrow(story, storyId);
};

const validateStoryOrThrow = (
  story: StoryPackage,
  storyId: string,
): StoryPackage => {
  if (story.metadata.storyId !== storyId) {
    throw runtimeError.storyIdMismatch(storyId, story.metadata.storyId);
  }

  const issues = getValidationIssues(story);
  const firstIssue = issues[0];
  if (firstIssue) {
    throw runtimeError.storyPackageInvalid(storyId, firstIssue);
  }

  return story;
};

export const getNodeOrThrow = (
  story: StoryPackage,
  nodeId: string,
): StoryNode => {
  const node = story.graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw runtimeError.nodeNotFound(story.metadata.storyId, nodeId);
  }

  return node;
};

export const assertRoleExistsOrThrow = (story: StoryPackage, roleId: string): void => {
  const hasRole = story.roles.some((role) => role.id === roleId);

  if (!hasRole) {
    throw runtimeError.roleNotFound(story.metadata.storyId, roleId);
  }
};

export const getBlockInNodeOrThrow = (
  story: StoryPackage,
  node: StoryNode,
  blockId: string,
): StoryBlock => {
  const block = node.blocks.find((candidate) => candidate.id === blockId);
  if (!block) {
    throw runtimeError.blockNotFound(story.metadata.storyId, node.id, blockId);
  }

  return block;
};

export const assertBlockInNodeOrThrow = (
  story: StoryPackage,
  node: StoryNode,
  blockId: string,
): void => {
  getBlockInNodeOrThrow(story, node, blockId);
};

export const getEdgeInNodeOrThrow = (
  story: StoryPackage,
  node: StoryNode,
  edgeId: string,
): StoryEdge => {
  const edge = node.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    throw runtimeError.edgeNotFound(story.metadata.storyId, node.id, edgeId);
  }

  return edge;
};

export const resolveRuntimeSnapshotContextOrThrow = async (
  ports: EnginePorts,
  state: RuntimeState,
  options?: ResolveRuntimeSnapshotOptions,
): Promise<ResolvedRuntimeSnapshotContext> => {
  const story = await loadStoryByVersionOrThrow(
    ports,
    state.storyId,
    state.storyPackageVersionId,
  );

  assertRoleExistsOrThrow(story, state.roleId);
  const currentNode = getNodeOrThrow(story, state.currentNodeId);

  const targetBlock =
    options?.blockId === undefined
      ? undefined
      : getBlockInNodeOrThrow(story, currentNode, options.blockId);
  const targetEdge =
    options?.edgeId === undefined
      ? undefined
      : getEdgeInNodeOrThrow(story, currentNode, options.edgeId);

  return {
    currentNode,
    story,
    targetBlock,
    targetEdge,
  };
};

export const createRuntimeSnapshotInvalidError = (error: ZodError): EngineRuntimeError => {
  const firstIssue = error.issues[0];

  if (!firstIssue) {
    return runtimeError.snapshotInvalid('no validation details were provided');
  }

  return runtimeError.snapshotInvalid(
    `${firstIssue.code} at ${formatIssuePath(firstIssue.path)}`
  );
};

export const parseRuntimeInputOrThrow = <TInput>(
  schema: ZodType<TInput>,
  input: unknown,
): TInput => {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw createRuntimeSnapshotInvalidError(parsed.error);
  }

  return parsed.data;
};

export const mapTraversableEdges = (node: StoryNode): TraversableEdge[] =>
  node.edges
    .filter((edge) => edge.condition === undefined)
    .map((edge) => createTraversableEdge(edge));

export const normalizeRuntimeState = (state: RuntimeState): RuntimeState => ({
  ...state,
  playerState: {
    ...state.playerState,
    blockStates: { ...state.playerState.blockStates },
  },
  sharedState: {
    ...state.sharedState,
    blockStates: { ...state.sharedState.blockStates },
  },
});

export const createRuntimeSnapshot = (
  state: RuntimeState,
  traversableEdges: TraversableEdge[],
  options?: {
    normalizeState?: boolean | undefined;
  },
): RuntimeSnapshot => ({
  ...(options?.normalizeState === false ? state : normalizeRuntimeState(state)),
  traversableEdges,
});
