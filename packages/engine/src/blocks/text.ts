import { z } from 'zod';
import {
  defineBlockDefinition,
  type NonInteractiveBlockDefinition,
} from './types.js';

type TextLeaf = {
  text: string;
  type: 'text';
};

type LinkLeaf = {
  children: TextLeaf[];
  href: string;
  type: 'link';
};

type ParagraphNode = {
  children: Array<TextLeaf | LinkLeaf>;
  type: 'paragraph';
};

type HeadingNode = {
  children: TextLeaf[];
  level: 1 | 2 | 3;
  type: 'heading';
};

type ImageNode = {
  alt?: string | undefined;
  caption?: string | undefined;
  type: 'image';
  url: string;
};

type AudioNode = {
  caption?: string | undefined;
  title?: string | undefined;
  type: 'audio';
  url: string;
};

type VideoNode = {
  caption?: string | undefined;
  posterUrl?: string | undefined;
  title?: string | undefined;
  type: 'video';
  url: string;
};

type TextBlockConfig = {
  document: {
    children: Array<ParagraphNode | HeadingNode | ImageNode | AudioNode | VideoNode>;
    type: 'doc';
  };
};

type TextBlockState = {
  unlocked: true;
};

const textLeafSchema = z
  .object({
    text: z.string().min(1),
    type: z.literal('text'),
  })
  .strict();

const linkLeafSchema = z
  .object({
    children: z.array(textLeafSchema).min(1),
    href: z.string().min(1),
    type: z.literal('link'),
  })
  .strict();

const inlineNodeSchema = z.union([textLeafSchema, linkLeafSchema]);

const paragraphNodeSchema = z
  .object({
    children: z.array(inlineNodeSchema).min(1),
    type: z.literal('paragraph'),
  })
  .strict();

const headingNodeSchema = z
  .object({
    children: z.array(textLeafSchema).min(1),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    type: z.literal('heading'),
  })
  .strict();

const imageNodeSchema = z
  .object({
    alt: z.string().min(1).optional(),
    caption: z.string().min(1).optional(),
    type: z.literal('image'),
    url: z.string().min(1),
  })
  .strict();

const audioNodeSchema = z
  .object({
    caption: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    type: z.literal('audio'),
    url: z.string().min(1),
  })
  .strict();

const videoNodeSchema = z
  .object({
    caption: z.string().min(1).optional(),
    posterUrl: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    type: z.literal('video'),
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

const textConfigSchema: z.ZodType<TextBlockConfig> = z
  .object({
    document: z
      .object({
        children: z.array(blockNodeSchema).min(1),
        type: z.literal('doc'),
      })
      .strict(),
  })
  .strict();

const textStateSchema: z.ZodType<TextBlockState> = z
  .object({
    unlocked: z.literal(true),
  })
  .strict();

export const textBlock: NonInteractiveBlockDefinition<TextBlockConfig, TextBlockState> = defineBlockDefinition({
  configSchema: textConfigSchema,
  initialState: () => ({
    unlocked: true as const,
  }),
  interactive: false,
  scope: 'user',
  stateSchema: textStateSchema,
});
