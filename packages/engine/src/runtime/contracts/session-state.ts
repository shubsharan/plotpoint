import { z } from 'zod';

export type SessionStateBucket = {
  blockStates: Record<string, unknown>;
};

export type SessionState = {
  currentNodeId: string;
  sessionId: string;
  playerId: string;
  playerState: SessionStateBucket;
  roleId: string;
  sharedState: SessionStateBucket;
  storyId: string;
  storyPackageVersionId: string;
};

export const nonEmptyStringSchema: z.ZodString = z.string().min(1);

export const sessionStateBucketSchema: z.ZodType<SessionStateBucket> = z
  .object({
    blockStates: z.record(z.string(), z.unknown()),
  })
  .strict();

export const sessionStateSchema: z.ZodType<SessionState> = z
  .object({
    currentNodeId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    playerId: nonEmptyStringSchema,
    playerState: sessionStateBucketSchema,
    roleId: nonEmptyStringSchema,
    sharedState: sessionStateBucketSchema,
    storyId: nonEmptyStringSchema,
    storyPackageVersionId: nonEmptyStringSchema,
  })
  .strict();
