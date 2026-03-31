import type { ZodError } from 'zod';
import type { StoryPackage } from '../story-packages/schema.js';
import type { StoryPackageValidationIssue } from '../story-packages/types.js';
import { validateStoryPackageCompatibility } from '../story-packages/validate-compatibility.js';
import { validateStoryPackageStructure } from '../story-packages/validate-structure.js';
import { currentEngineMajor } from '../version.js';
import { EngineRuntimeError } from './errors.js';
import type { AvailableEdge, EnginePorts, RuntimeSnapshot } from './types.js';

type StoryNode = StoryPackage['graph']['nodes'][number];

type ResolveRuntimeSnapshotOptions = {
  blockId?: string | undefined;
};

type ResolvedRuntimeSnapshotContext = {
  currentNode: StoryNode;
};

const runtimeError = {
  blockNotFound: (storyId: string, nodeId: string, blockId: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_block_not_found',
      `Runtime block "${blockId}" was not found in node "${nodeId}" for story "${storyId}".`,
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
  snapshotInvalid: (details: string): EngineRuntimeError =>
    new EngineRuntimeError(
      'runtime_snapshot_invalid',
      `Runtime snapshot input is invalid: ${details}.`,
    ),
} as const;

const createAvailableEdge = (
  edge: StoryPackage['graph']['nodes'][number]['edges'][number],
): AvailableEdge => {
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

const formatIssuePath = (path: ReadonlyArray<number | string | symbol>): string => {
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
): Promise<StoryPackage> => {
  let story: StoryPackage;
  try {
    story = await ports.storyPackageRepo.getPublishedPackage(storyId);
  } catch (error) {
    if (error instanceof EngineRuntimeError) {
      throw error;
    }

    throw runtimeError.storyPackageUnavailable(storyId, getErrorDetails(error));
  }

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

export const assertBlockInNodeOrThrow = (
  story: StoryPackage,
  node: StoryNode,
  blockId: string,
): void => {
  const hasBlock = node.blocks.some((block) => block.id === blockId);

  if (!hasBlock) {
    throw runtimeError.blockNotFound(story.metadata.storyId, node.id, blockId);
  }
};

export const resolveRuntimeSnapshotContextOrThrow = async (
  ports: EnginePorts,
  snapshot: RuntimeSnapshot,
  options?: ResolveRuntimeSnapshotOptions,
): Promise<ResolvedRuntimeSnapshotContext> => {
  const story = await loadStoryOrThrow(ports, snapshot.storyId);

  assertRoleExistsOrThrow(story, snapshot.roleId);
  const currentNode = getNodeOrThrow(story, snapshot.currentNodeId);

  if (options?.blockId !== undefined) {
    assertBlockInNodeOrThrow(story, currentNode, options.blockId);
  }

  return {
    currentNode,
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

export const mapAvailableEdges = (node: StoryNode): AvailableEdge[] =>
  node.edges.map((edge) => createAvailableEdge(edge));

export const normalizeRuntimeSnapshot = (
  snapshot: RuntimeSnapshot,
  availableEdges: AvailableEdge[],
): RuntimeSnapshot => ({
  ...snapshot,
  playerState: {
    ...snapshot.playerState,
    blockStates: { ...snapshot.playerState.blockStates },
  },
  sharedState: {
    ...snapshot.sharedState,
    blockStates: { ...snapshot.sharedState.blockStates },
  },
  availableEdges,
});
