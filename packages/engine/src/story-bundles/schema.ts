import { z } from "zod";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type StoryBundleCondition =
  | {
      type: "always";
    }
  | {
      type: "check";
      condition: string;
      params: Record<string, JsonValue>;
    }
  | {
      type: "and";
      children: StoryBundleCondition[];
    }
  | {
      type: "or";
      children: StoryBundleCondition[];
    };

export type StoryBundle = {
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
        config: Record<string, JsonValue>;
      }>;
      edges: Array<{
        id: string;
        targetNodeId: string;
        label?: string | undefined;
        condition?: StoryBundleCondition | undefined;
      }>;
    }>;
  };
  version: {
    schemaVersion: 1;
    engineMajor: number | null;
  };
};

const nonEmptyStringSchema = z.string().min(1);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

const storyBundleMetadataSchema = z
  .object({
    storyId: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema.optional(),
  })
  .strict();

const storyBundleRoleSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
  })
  .strict();

const storyBundleConditionSchema: z.ZodType<StoryBundleCondition> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("always") }).strict(),
    z
      .object({
        type: z.literal("check"),
        condition: nonEmptyStringSchema,
        params: jsonObjectSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("and"),
        children: z.array(storyBundleConditionSchema).min(1),
      })
      .strict(),
    z
      .object({
        type: z.literal("or"),
        children: z.array(storyBundleConditionSchema).min(1),
      })
      .strict(),
  ]),
);

const storyBundleBlockSchema = z
  .object({
    id: nonEmptyStringSchema,
    type: nonEmptyStringSchema,
    config: jsonObjectSchema,
  })
  .strict();

const storyBundleEdgeSchema = z
  .object({
    id: nonEmptyStringSchema,
    targetNodeId: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    condition: storyBundleConditionSchema.optional(),
  })
  .strict();

const storyBundleNodeSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    blocks: z.array(storyBundleBlockSchema),
    edges: z.array(storyBundleEdgeSchema),
  })
  .strict();

const storyBundleGraphSchema = z
  .object({
    entryNodeId: nonEmptyStringSchema,
    nodes: z.array(storyBundleNodeSchema),
  })
  .strict();

const storyBundleVersionSchema = z
  .object({
    schemaVersion: z.literal(1),
    engineMajor: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const storyBundleSchema: z.ZodType<StoryBundle> = z
  .object({
    metadata: storyBundleMetadataSchema,
    roles: z.array(storyBundleRoleSchema),
    graph: storyBundleGraphSchema,
    version: storyBundleVersionSchema,
  })
  .strict();
