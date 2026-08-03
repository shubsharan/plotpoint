import {
  canonicalizeValue,
  executeCommand,
  type AggregateKind,
  type CommandDefinition,
  type DefinedProgression,
  type ExecutionRecord,
  type RecordedExecutionResult,
  type JsonObject,
} from "@plotpoint/runtime";

import { firstDifference } from "./assertions.js";

export interface ReplayInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly record: ExecutionRecord<State, Outcome, Payload, Kind>;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly progression?: DefinedProgression<State, Payload, Outcome, Kind>;
}

export type ReplayResult<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> =
  | {
      readonly kind: "match";
      readonly result: RecordedExecutionResult<State, Outcome, Payload, Kind>;
    }
  | {
      readonly kind: "mismatch";
      readonly path: string;
      readonly result?: RecordedExecutionResult<State, Outcome, Payload, Kind>;
    };

export function replayScenario<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: ReplayInput<State, Payload, Outcome, Kind>): ReplayResult<State, Payload, Outcome, Kind> {
  if (input.record.definitionId !== input.definition.definitionId) {
    return { kind: "mismatch", path: "/definitionId" };
  }
  const result = executeCommand({
    definition: input.definition,
    aggregate: input.record.aggregateBefore,
    command: input.record.command,
    observations: input.record.observations,
    policy: input.record.policy,
    ...(input.progression === undefined ? {} : { progression: input.progression }),
  });
  if (!("record" in result)) return { kind: "mismatch", path: "/preflight" };
  const expected = canonicalizeValue(input.record);
  const actual = canonicalizeValue(result.record);
  if (expected.kind === "invalid" || actual.kind === "invalid") {
    throw new TypeError("Replay records must be canonical");
  }
  const path = firstDifference(expected.canonical.value, actual.canonical.value);
  return path === null ? { kind: "match", result } : { kind: "mismatch", path, result };
}
