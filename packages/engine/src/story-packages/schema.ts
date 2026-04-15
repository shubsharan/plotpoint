import { z } from 'zod';

type StoryPackageJsonPrimitive = boolean | null | number | string;
export type StoryPackageJsonValue =
  | StoryPackageJsonPrimitive
  | StoryPackageJsonValue[]
  | { [key: string]: StoryPackageJsonValue };

const nonEmptyStringSchema = z.string().min(1);
export const storyPackageFactEqualityOperators = ['eq', 'neq'] as const;
export const storyPackageFactNumericOperators = ['gt', 'gte', 'lt', 'lte'] as const;
export type StoryPackageFactEqualityOperator =
  (typeof storyPackageFactEqualityOperators)[number];
export type StoryPackageFactNumericOperator =
  (typeof storyPackageFactNumericOperators)[number];
export type StoryPackageFactOperator =
  | StoryPackageFactEqualityOperator
  | StoryPackageFactNumericOperator;
export type StoryPackageFactValue = boolean | number | string;

export const storyPackageJsonValueSchema: z.ZodType<StoryPackageJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(storyPackageJsonValueSchema),
    z.record(z.string(), storyPackageJsonValueSchema),
  ]),
);

export const storyPackageJsonObjectSchema: z.ZodType<Record<string, StoryPackageJsonValue>> = z.record(
  z.string(),
  storyPackageJsonValueSchema,
);

export const storyPackageMetadataSchema: z.ZodType<StoryPackageMetadataShape> = z
  .object({
    storyId: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema.optional(),
  })
  .strict();

export const storyPackageRoleSchema: z.ZodType<StoryPackageRoleShape> = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
  })
  .strict();

const storyPackageAlwaysConditionSchema = z.object({ type: z.literal('always') }).strict();
const storyPackageFactConditionSchema = z
  .object({
    blockId: nonEmptyStringSchema,
    fact: nonEmptyStringSchema,
    type: z.literal('fact'),
  })
  .strict();
const storyPackageFactEqualityConditionSchema = z
  .object({
    blockId: nonEmptyStringSchema,
    fact: nonEmptyStringSchema,
    operator: z.enum(storyPackageFactEqualityOperators),
    type: z.literal('fact'),
    value: z.union([z.boolean(), z.number(), z.string()]),
  })
  .strict();
const storyPackageFactNumericConditionSchema = z
  .object({
    blockId: nonEmptyStringSchema,
    fact: nonEmptyStringSchema,
    operator: z.enum(storyPackageFactNumericOperators),
    type: z.literal('fact'),
    value: z.number(),
  })
  .strict();

type StoryPackageFactConditionShape =
  | {
      blockId: string;
      fact: string;
      type: 'fact';
    }
  | {
      blockId: string;
      fact: string;
      operator: StoryPackageFactEqualityOperator;
      type: 'fact';
      value: StoryPackageFactValue;
    }
  | {
      blockId: string;
      fact: string;
      operator: StoryPackageFactNumericOperator;
      type: 'fact';
      value: number;
    };

type StoryPackageConditionShape =
  | {
      type: 'always';
    }
  | StoryPackageFactConditionShape
  | {
      type: 'and';
      children: StoryPackageConditionShape[];
    }
  | {
      type: 'or';
      children: StoryPackageConditionShape[];
    };

type StoryPackageShape = {
  metadata: {
    storyId: string;
    title: string;
    summary?: string | undefined;
  };
  roles: Array<{
    id: string;
    title: string;
    description?: string | undefined;
  }>;
  graph: {
    entryNodeId: string;
    nodes: Array<{
      id: string;
      title: string;
      blocks: Array<{
        id: string;
        type: string;
        config: Record<string, StoryPackageJsonValue>;
      }>;
      edges: Array<{
        id: string;
        targetNodeId: string;
        label?: string | undefined;
        condition?: StoryPackageConditionShape | undefined;
      }>;
    }>;
  };
  version: {
    schemaVersion: 1;
    engineMajor: number | null;
  };
};

type StoryPackageMetadataShape = StoryPackageShape['metadata'];
type StoryPackageRoleShape = StoryPackageShape['roles'][number];
type StoryPackageBlockShape = StoryPackageShape['graph']['nodes'][number]['blocks'][number];
type StoryPackageEdgeShape = StoryPackageShape['graph']['nodes'][number]['edges'][number];
type StoryPackageNodeShape = StoryPackageShape['graph']['nodes'][number];
type StoryPackageGraphShape = StoryPackageShape['graph'];
type StoryPackageVersionShape = StoryPackageShape['version'];

export const storyPackageConditionSchema: z.ZodType<StoryPackageConditionShape> = z.lazy(() =>
  z.union([
    storyPackageAlwaysConditionSchema,
    storyPackageFactConditionSchema,
    storyPackageFactEqualityConditionSchema,
    storyPackageFactNumericConditionSchema,
    z
      .object({
        type: z.literal('and'),
        children: z.array(storyPackageConditionSchema).min(1),
      })
      .strict(),
    z
      .object({
        type: z.literal('or'),
        children: z.array(storyPackageConditionSchema).min(1),
      })
      .strict(),
  ]),
);
export type StoryPackageCondition = z.infer<typeof storyPackageConditionSchema>;

export const storyPackageBlockSchema: z.ZodType<StoryPackageBlockShape> = z
  .object({
    id: nonEmptyStringSchema,
    type: nonEmptyStringSchema,
    config: storyPackageJsonObjectSchema,
  })
  .strict();

export const storyPackageEdgeSchema: z.ZodType<StoryPackageEdgeShape> = z
  .object({
    id: nonEmptyStringSchema,
    targetNodeId: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    condition: storyPackageConditionSchema.optional(),
  })
  .strict();

export const storyPackageNodeSchema: z.ZodType<StoryPackageNodeShape> = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    blocks: z.array(storyPackageBlockSchema),
    edges: z.array(storyPackageEdgeSchema),
  })
  .strict();

export const storyPackageGraphSchema: z.ZodType<StoryPackageGraphShape> = z
  .object({
    entryNodeId: nonEmptyStringSchema,
    nodes: z.array(storyPackageNodeSchema),
  })
  .strict();

export const storyPackageVersionSchema: z.ZodType<StoryPackageVersionShape> = z
  .object({
    schemaVersion: z.literal(1),
    engineMajor: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const storyPackageSchema: z.ZodType<StoryPackageShape> = z
  .object({
    metadata: storyPackageMetadataSchema,
    roles: z.array(storyPackageRoleSchema),
    graph: storyPackageGraphSchema,
    version: storyPackageVersionSchema,
  })
  .strict();

export type StoryPackage = z.infer<typeof storyPackageSchema>;
