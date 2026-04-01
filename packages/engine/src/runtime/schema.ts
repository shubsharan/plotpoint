import { z } from 'zod';
import { storyPackageJsonObjectSchema } from '../story-packages/schema.js';

const nonEmptyStringSchema = z.string().min(1);

type TraversableEdgeShape = {
  edgeId: string;
  label?: string | undefined;
  targetNodeId: string;
};

type RuntimeStateBucketShape = {
  blockStates: Record<string, unknown>;
};

type RuntimeStateShape = {
  currentNodeId: string;
  gameId: string;
  playerId: string;
  playerState: RuntimeStateBucketShape;
  roleId: string;
  sharedState: RuntimeStateBucketShape;
  storyId: string;
  storyPackageVersionId: string;
};

type CurrentNodeBlockShape = {
  config: Record<string, unknown>;
  id: string;
  interactive: boolean;
  state: unknown;
  type: string;
};

type CurrentNodeShape = {
  blocks: CurrentNodeBlockShape[];
  id: string;
  title: string;
};

type RuntimeSnapshotShape = {
  currentNode: CurrentNodeShape;
  traversableEdges: TraversableEdgeShape[];
} & RuntimeStateShape;

type LoadRuntimeInputShape = {
  state: RuntimeStateShape;
};

type StartGameInputShape = {
  gameId: string;
  playerId: string;
  roleId: string;
  storyId: string;
};

type PerformBlockActionInputShape = {
  action: unknown;
  blockId: string;
  state: RuntimeStateShape;
};

type TraverseEdgeInputShape = {
  edgeId: string;
  state: RuntimeStateShape;
};

const runtimeBlockStatesSchema: z.ZodType<Record<string, unknown>> = z.record(
  z.string(),
  z.unknown(),
);

const runtimeStateBucketSchema: z.ZodType<RuntimeStateBucketShape> = z
  .object({
    blockStates: runtimeBlockStatesSchema,
  })
  .strict();

const requiredUnknownSchema: z.ZodType<unknown> = z.unknown().refine(
  (value) => value !== undefined,
);

export const traversableEdgeSchema: z.ZodType<TraversableEdgeShape> = z
  .object({
    edgeId: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    targetNodeId: nonEmptyStringSchema,
  })
  .strict();

export const currentNodeBlockSchema: z.ZodType<CurrentNodeBlockShape> = z
  .object({
    config: storyPackageJsonObjectSchema,
    id: nonEmptyStringSchema,
    interactive: z.boolean(),
    state: z.unknown(),
    type: nonEmptyStringSchema,
  })
  .strict();

export const currentNodeSchema: z.ZodType<CurrentNodeShape> = z
  .object({
    blocks: z.array(currentNodeBlockSchema),
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
  })
  .strict();

const runtimeStateObjectSchema = z.object({
  currentNodeId: nonEmptyStringSchema,
  gameId: nonEmptyStringSchema,
  playerId: nonEmptyStringSchema,
  playerState: runtimeStateBucketSchema,
  roleId: nonEmptyStringSchema,
  sharedState: runtimeStateBucketSchema,
  storyId: nonEmptyStringSchema,
  storyPackageVersionId: nonEmptyStringSchema,
});

export const runtimeStateSchema: z.ZodType<RuntimeStateShape> = runtimeStateObjectSchema.strict();

const runtimeStateInputSchema: z.ZodType<RuntimeStateShape> = runtimeStateObjectSchema.strip();

export const runtimeSnapshotSchema: z.ZodType<RuntimeSnapshotShape> = runtimeStateObjectSchema
  .extend({
    currentNode: currentNodeSchema,
    traversableEdges: z.array(traversableEdgeSchema),
  })
  .strict();

export const loadRuntimeInputSchema: z.ZodType<LoadRuntimeInputShape> = z
  .object({
    state: runtimeStateInputSchema,
  })
  .strict();

export const startGameInputSchema: z.ZodType<StartGameInputShape> = z
  .object({
    gameId: nonEmptyStringSchema,
    playerId: nonEmptyStringSchema,
    roleId: nonEmptyStringSchema,
    storyId: nonEmptyStringSchema,
  })
  .strict();

export const performBlockActionInputSchema: z.ZodType<PerformBlockActionInputShape> = z
  .object({
    action: requiredUnknownSchema,
    blockId: nonEmptyStringSchema,
    state: runtimeStateInputSchema,
  })
  .strict();

export const traverseEdgeInputSchema: z.ZodType<TraverseEdgeInputShape> = z
  .object({
    edgeId: nonEmptyStringSchema,
    state: runtimeStateInputSchema,
  })
  .strict();

export type TraversableEdge = z.infer<typeof traversableEdgeSchema>;
export type CurrentNodeBlockSnapshot = z.infer<typeof currentNodeBlockSchema>;
export type CurrentNodeSnapshot = z.infer<typeof currentNodeSchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
export type LoadRuntimeInput = z.infer<typeof loadRuntimeInputSchema>;
export type StartGameInput = z.infer<typeof startGameInputSchema>;
export type PerformBlockActionInput = z.infer<typeof performBlockActionInputSchema>;
export type TraverseEdgeInput = z.infer<typeof traverseEdgeInputSchema>;
