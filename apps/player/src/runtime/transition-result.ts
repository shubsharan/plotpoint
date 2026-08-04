import type { TransitionResultV1 } from "@plotpoint/protocol";

import type { DurableTransitionResult } from "../model";

export function transitionResultFromDurable(result: DurableTransitionResult): TransitionResultV1 {
  if (
    (result.kind !== "accepted" && result.kind !== "duplicate") ||
    result.commandOutcome === undefined ||
    result.resultingVersion === undefined
  ) {
    throw new Error("transition-durable-result-invalid");
  }
  const base = {
    commandId: result.commandId,
    disposition: result.kind === "duplicate" ? "duplicate" : "committed",
    resultingVersion: result.resultingVersion,
  } as const;
  if (result.commandOutcome === "invalid") {
    if (result.diagnosticCodes === undefined) throw new Error("transition-durable-result-invalid");
    return { ...base, terminal: "invalid", diagnosticCodes: result.diagnosticCodes };
  }
  if (result.outcome === undefined) throw new Error("transition-durable-result-invalid");
  return { ...base, terminal: result.commandOutcome, outcome: result.outcome };
}
