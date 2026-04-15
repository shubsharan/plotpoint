import { z } from 'zod';
import { storyPackageJsonObjectSchema } from '../../story-packages/schema.js';
import { nonEmptyStringSchema } from './session-state.js';

export type TraversableEdge = {
  edgeId: string;
  label?: string | undefined;
  targetNodeId: string;
};

export type CurrentNodeBlockView = {
  config: Record<string, unknown>;
  id: string;
  interactive: boolean;
  state: unknown;
  type: string;
};

export type CurrentNodeView = {
  blocks: CurrentNodeBlockView[];
  id: string;
  title: string;
};

export type RuntimeView = {
  currentNode: CurrentNodeView;
  traversableEdges: TraversableEdge[];
};

export const traversableEdgeSchema: z.ZodType<TraversableEdge> = z
  .object({
    edgeId: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    targetNodeId: nonEmptyStringSchema,
  })
  .strict();

export const currentNodeBlockSchema: z.ZodType<CurrentNodeBlockView> = z
  .object({
    config: storyPackageJsonObjectSchema,
    id: nonEmptyStringSchema,
    interactive: z.boolean(),
    state: z.unknown(),
    type: nonEmptyStringSchema,
  })
  .strict();

export const currentNodeSchema: z.ZodType<CurrentNodeView> = z
  .object({
    blocks: z.array(currentNodeBlockSchema),
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
  })
  .strict();

export const runtimeViewSchema: z.ZodType<RuntimeView> = z
  .object({
    currentNode: currentNodeSchema,
    traversableEdges: z.array(traversableEdgeSchema),
  })
  .strict();
