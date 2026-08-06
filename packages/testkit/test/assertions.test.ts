import { describe, expect, it } from "vitest";

import {
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";
import { assertAccepted, assertInvalid, assertNoOp, assertRejected } from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

type State = JsonObject & { readonly count: number };
type Terminal = "accepted" | "invalid" | "no-op" | "rejected";

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "p1",
  modelId: "assertions.player",
  aggregateKind: "player",
  schemaId: "assertions.state",
  stateVersion: 4,
  state: { count: 0 },
};
const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "change",
  target: { kind: "player", id: aggregate.aggregateId },
  expectedStateVersion: aggregate.stateVersion,
  payload: {},
};
const stateSchema = runtimeSchema(
  "assertions.state",
  (value): value is State =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "count" in value &&
    typeof value.count === "number",
);
const jsonSchema = runtimeSchema("assertions.json", isJsonObject);

function execute(terminal: Terminal) {
  const definition = defineCommand<"player", State, JsonObject, JsonObject>({
    definitionId: `assertions.${terminal}`,
    commandType: "change",
    aggregateKind: "player",
    handle(target) {
      if (terminal === "invalid") throw new Error("recorded invalid fixture");
      if (terminal === "accepted") {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + 1 },
          outcome: { result: terminal },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      }
      return { kind: terminal, outcome: { result: terminal } };
    },
  });
  const binding = resolveCommandBinding({
    registrationId: definition.definitionId,
    definition,
    payloadSchema: jsonSchema,
    outcomeSchema: jsonSchema,
  });
  const model = modelFixture({
    modelId: aggregate.modelId,
    aggregateKind: "player",
    authority: "local",
    stateSchema,
    initializeState: () => ({ count: 0 }),
    commandsByType: { change: binding },
  });
  return model.execute({ aggregate, command, observations: [] });
}

describe("runtime result assertions", () => {
  it("accepts real runtime records for every recorded terminal", () => {
    const accepted = execute("accepted");
    const noOp = execute("no-op");
    const rejected = execute("rejected");
    const invalid = execute("invalid");

    assertAccepted(accepted);
    expect(accepted.record).toMatchObject({ priorStateVersion: 4, resultingStateVersion: 5 });
    expect(accepted.record.aggregateAfter.stateVersion).toBe(5);

    assertNoOp(noOp);
    expect(noOp.record).toMatchObject({ priorStateVersion: 4, resultingStateVersion: 4 });
    expect(noOp.record).not.toHaveProperty("aggregateAfter");

    assertRejected(rejected);
    expect(rejected.record).toMatchObject({ priorStateVersion: 4, resultingStateVersion: 4 });
    expect(rejected.record).not.toHaveProperty("aggregateAfter");

    assertInvalid(invalid, "handler-threw");
    if (invalid.kind !== "recorded") throw new Error("expected recorded invalid result");
    expect(invalid.record).toMatchObject({ priorStateVersion: 4, resultingStateVersion: 4 });
    expect(invalid.record).not.toHaveProperty("aggregateAfter");
  });

  it("rejects corrupted prior, resulting, and increment version evidence", () => {
    const accepted = execute("accepted");
    const noOp = execute("no-op");
    const rejected = execute("rejected");
    const invalid = execute("invalid");
    assertAccepted(accepted);
    assertNoOp(noOp);
    assertRejected(rejected);
    assertInvalid(invalid);
    if (invalid.kind !== "recorded") throw new Error("expected recorded invalid result");

    expect(() =>
      assertAccepted({
        ...accepted,
        record: { ...accepted.record, priorStateVersion: 3 },
      }),
    ).toThrow("expected-accepted:prior-version-mismatch:3:4");
    expect(() =>
      assertAccepted({
        ...accepted,
        record: { ...accepted.record, resultingStateVersion: 4 },
      }),
    ).toThrow("expected-accepted:resulting-version-mismatch:4:5");
    expect(() =>
      assertNoOp({
        ...noOp,
        record: { ...noOp.record, resultingStateVersion: 5 },
      }),
    ).toThrow("expected-no-op:version-changed:4:5");
    expect(() =>
      assertRejected({
        ...rejected,
        record: { ...rejected.record, priorStateVersion: 3 },
      }),
    ).toThrow("expected-rejected:prior-version-mismatch:3:4");
    expect(() =>
      assertInvalid({
        ...invalid,
        record: { ...invalid.record, resultingStateVersion: 5 },
      }),
    ).toThrow("expected-invalid:version-changed:4:5");

    const nonIncrementingAggregate = {
      ...accepted.record.aggregateAfter,
      stateVersion: accepted.record.aggregateBefore.stateVersion,
    };
    expect(() =>
      assertAccepted({
        ...accepted,
        aggregate: nonIncrementingAggregate,
        record: {
          ...accepted.record,
          aggregateAfter: nonIncrementingAggregate,
          resultingStateVersion: accepted.record.priorStateVersion,
        },
      }),
    ).toThrow("expected-accepted:version-not-incremented:4:4");
  });
});
