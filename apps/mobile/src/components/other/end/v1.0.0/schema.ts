import { z } from "zod";

export const endSchema = z.object({
  endingType: z.enum(["success", "failure", "neutral", "secret"]).default("neutral"),
  title: z.string().optional(),
  message: z.string().optional(),
  showStats: z.boolean().default(false),
  allowRestart: z.boolean().default(true),
  showCredits: z.boolean().default(false),
});

export type EndSchema = z.infer<typeof endSchema>;
