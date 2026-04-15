import { z } from 'zod';
import type { SessionState } from './session-state.js';
import { sessionStateSchema } from './session-state.js';
import type { RuntimeView } from './runtime-view.js';
import { runtimeViewSchema } from './runtime-view.js';

export type RuntimeFrame = {
  state: SessionState;
  view: RuntimeView;
};

export const runtimeFrameSchema: z.ZodType<RuntimeFrame> = z
  .object({
    state: sessionStateSchema,
    view: runtimeViewSchema,
  })
  .strict();
