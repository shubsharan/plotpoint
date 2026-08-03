import {
  canonicalizeValue,
  executeCommand,
  type Command,
  type CommandDefinition,
  type ExecutionRecord,
  type ExecutionResult,
  type JsonObject,
  type ProgressionDefinition,
} from "@plotpoint/runtime";

import { firstDifference } from "./assertions.js";

export interface ReplayInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
> {
  readonly record: ExecutionRecord<State, Outcome>;
  readonly definition: CommandDefinition<State, Payload, Outcome>;
  readonly progression?: ProgressionDefinition<State, Payload, Outcome>;
}

export type ReplayResult<State extends JsonObject, Outcome extends JsonObject> =
  | { readonly kind: "match"; readonly result: ExecutionResult<State, Outcome> }
  | {
      readonly kind: "mismatch";
      readonly path: string;
      readonly result?: ExecutionResult<State, Outcome>;
    };

export function replayScenario<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
>(input: ReplayInput<State, Payload, Outcome>): ReplayResult<State, Outcome> {
  if (input.record.definitionId !== input.definition.definitionId) {
    return { kind: "mismatch", path: "/definitionId" };
  }
  const result = executeCommand({
    definition: input.definition,
    aggregate: input.record.aggregateBefore,
    command: input.record.command as Command<Payload>,
    observations: input.record.observations,
    policy: input.record.policy,
    ...(input.progression === undefined ? {} : { progression: input.progression }),
  });
  const expected = canonicalizeValue(input.record);
  const actual = canonicalizeValue(result.record);
  if (expected.kind === "invalid" || actual.kind === "invalid") {
    throw new TypeError("Replay records must be canonical");
  }
  const path = firstDifference(expected.canonical.value, actual.canonical.value);
  return path === null ? { kind: "match", result } : { kind: "mismatch", path, result };
}
