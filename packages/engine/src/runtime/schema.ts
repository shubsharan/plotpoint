import { z } from 'zod';

const nonEmptyStringSchema = z.string().min(1);

type AvailableEdgeShape = {
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

type RuntimeSnapshotShape = {
  availableEdges: AvailableEdgeShape[];
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

type SubmitActionInputShape = {
  action: unknown;
  blockId: string;
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

export const availableEdgeSchema: z.ZodType<AvailableEdgeShape> = z
  .object({
    edgeId: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    targetNodeId: nonEmptyStringSchema,
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
    availableEdges: z.array(availableEdgeSchema),
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

export const submitActionInputSchema: z.ZodType<SubmitActionInputShape> = z
  .object({
    action: requiredUnknownSchema,
    blockId: nonEmptyStringSchema,
    state: runtimeStateInputSchema,
  })
  .strict();

export type AvailableEdge = z.infer<typeof availableEdgeSchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
export type LoadRuntimeInput = z.infer<typeof loadRuntimeInputSchema>;
export type StartGameInput = z.infer<typeof startGameInputSchema>;
export type SubmitActionInput = z.infer<typeof submitActionInputSchema>;
