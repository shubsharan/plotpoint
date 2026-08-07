import {
  type AggregateKind,
  type ExecutableAggregateModel,
  type ExecutionRecord,
  type JsonObject,
  type RecordedExecution,
} from "@plotpoint/runtime";

import { canonicalRecordDifference } from "./assertions.js";

export interface ReplayInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly record: ExecutionRecord<State, Outcome, Payload, Kind>;
  readonly model: ExecutableAggregateModel<Kind>;
}

export type ReplayResult<Kind extends AggregateKind = AggregateKind> =
  | {
      readonly kind: "match";
      readonly result: RecordedExecution<JsonObject, JsonObject, JsonObject, Kind>;
    }
  | {
      readonly kind: "mismatch";
      readonly path: string;
      readonly result?: RecordedExecution<JsonObject, JsonObject, JsonObject, Kind>;
    };

export function replayScenario<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: ReplayInput<State, Payload, Outcome, Kind>): ReplayResult<Kind> {
  const result = input.model.execute({
    aggregate: input.record.aggregateBefore,
    command: input.record.command,
    observations: input.record.observations,
  });
  if (result.kind !== "recorded") return { kind: "mismatch", path: "/preflight" };
  const path = canonicalRecordDifference(input.record, result.record);
  return path === null ? { kind: "match", result } : { kind: "mismatch", path, result };
}
