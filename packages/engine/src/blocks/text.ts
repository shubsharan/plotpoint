import { z } from "zod";
import type { BlockConfig, BlockRegistryEntry } from "./types.js";

const textLeafSchema = z
  .object({
    text: z.string().min(1),
    type: z.literal("text"),
  })
  .strict();

const linkLeafSchema = z
  .object({
    children: z.array(textLeafSchema).min(1),
    href: z.string().min(1),
    type: z.literal("link"),
  })
  .strict();

const inlineNodeSchema = z.union([textLeafSchema, linkLeafSchema]);

const paragraphNodeSchema = z
  .object({
    children: z.array(inlineNodeSchema).min(1),
    type: z.literal("paragraph"),
  })
  .strict();

const headingNodeSchema = z
  .object({
    children: z.array(textLeafSchema).min(1),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    type: z.literal("heading"),
  })
  .strict();

const imageNodeSchema = z
  .object({
    alt: z.string().min(1).optional(),
    caption: z.string().min(1).optional(),
    type: z.literal("image"),
    url: z.string().min(1),
  })
  .strict();

const audioNodeSchema = z
  .object({
    caption: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    type: z.literal("audio"),
    url: z.string().min(1),
  })
  .strict();

const videoNodeSchema = z
  .object({
    caption: z.string().min(1).optional(),
    posterUrl: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    type: z.literal("video"),
    url: z.string().min(1),
  })
  .strict();

const blockNodeSchema = z.union([
  paragraphNodeSchema,
  headingNodeSchema,
  imageNodeSchema,
  audioNodeSchema,
  videoNodeSchema,
]);

export const textConfigSchema: z.ZodType<BlockConfig> = z
  .object({
    document: z
      .object({
        children: z.array(blockNodeSchema).min(1),
        type: z.literal("doc"),
      })
      .strict(),
  })
  .strict();

export const textBlock: BlockRegistryEntry = {
  configSchema: textConfigSchema,
  scope: "user",
};
