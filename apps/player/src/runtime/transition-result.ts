import type { TransitionResult } from "@plotpoint/protocol";

import type { DurableTransitionResult } from "../model";

export function transitionResultFromDurable(result: DurableTransitionResult): TransitionResult {
  return result;
}
