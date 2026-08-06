import {
  createReleaseArtifact,
  type GameComposition,
  type ProgressionInstance,
  type ReleaseManifest,
} from "@plotpoint/protocol";
import { describe, expect, it } from "vitest";

import type { CandidateTransition, DurableCommandRecord } from "../src/model";
import {
  isRecoverableSnapshotState,
  validateRecoveryRecords,
  verifyRecoveryArtifact,
  type RecoveryRecords,
} from "../src/runtime/recovery";

const manifest = {
  releaseFormatVersion: 1,
  hostApi: { major: 1, minimumMinor: 0 },
  aggregateSchemas: [
    { id: "field.player-state", kind: "player", version: 1, path: "schemas/player.json" },
  ],
  capabilities: [],
  entrypoints: { logic: "logic.js", presentation: "presentation.js" },
  inventory: [],
} satisfies ReleaseManifest;

const composition = {
  application: { components: ["field.component"] },
  aggregateModels: [
    {
      id: "field.player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "field.player-state" },
      initializationSchema: { id: "field.initialization" },
      events: [
        { type: "field.advanced", schema: { id: "field.event" } },
        { type: "field.noted", schema: { id: "field.noted-event" } },
      ],
      effects: [{ type: "field.notify", schema: { id: "field.effect" } }],
    },
  ],
  commands: [
    {
      id: "field.advance",
      type: "field.advance",
      aggregateModel: "field.player",
      payloadSchema: { id: "field.advance-payload" },
      outcomeSchema: { id: "field.advance-outcome" },
      execution: "local",
    },
  ],
  progressions: [{ id: "field.progression", aggregateModel: "field.player" }],
  components: [
    {
      id: "field.component",
      commands: ["field.advance"],
      content: [],
      assets: [],
      capabilities: [],
    },
  ],
  resources: [
    {
      id: "field.advance-outcome",
      role: "schema",
      path: "schemas/field.advance-outcome.json",
    },
    {
      id: "field.advance-payload",
      role: "schema",
      path: "schemas/field.advance-payload.json",
    },
    {
      id: "field.component",
      role: "component-descriptor",
      path: "composition/components/field.component.json",
    },
    { id: "field.effect", role: "schema", path: "schemas/field.effect.json" },
    { id: "field.event", role: "schema", path: "schemas/field.event.json" },
    { id: "field.initialization", role: "schema", path: "schemas/field.initialization.json" },
    { id: "field.noted-event", role: "schema", path: "schemas/field.noted-event.json" },
    { id: "field.player-state", role: "schema", path: "schemas/player.json" },
    {
      id: "field.progression",
      role: "progression-descriptor",
      path: "progressions/field.progression.json",
    },
  ],
} satisfies GameComposition;

const progression = {
  graphId: "field.progression",
  nodes: [{ nodeId: "finish", status: "completed" as const }],
};

const acceptedCandidate = {
  commandId: "command-1",
  modelId: "field.player",
  commandType: "field.advance",
  payload: { answer: "north" },
  target: {
    aggregateId: "field-player",
    aggregateKind: "player",
    schemaId: "field.player-state",
  },
  expectedStateVersion: 0,
  observationIds: ["location-1"],
  terminal: "accepted",
  nextState: { attempts: 0, phase: "complete" },
  nextProgression: progression,
  outcome: { result: "advanced" },
  domainEvents: [{ type: "field.advanced", payload: { phase: "complete" } }],
  effectIntents: [{ type: "field.notify", payload: { message: "Complete" } }],
  progressionTrace: [
    {
      sequence: 1,
      round: 1,
      source: "command",
      nodeId: "finish",
      from: "active",
      to: "completed",
    },
  ],
} satisfies CandidateTransition;

const acceptedResult = {
  commandId: "command-1",
  disposition: "committed",
  terminal: "accepted",
  resultingStateVersion: 1,
  outcome: { result: "advanced" },
} as const;

const acceptedRecord = {
  candidate: acceptedCandidate,
  result: acceptedResult,
} satisfies DurableCommandRecord;

const validRecords = {
  snapshot: {
    model_id: "field.player",
    aggregate_id: "field-player",
    aggregate_kind: "player",
    schema_id: "field.player-state",
    state_version: 1,
    state_json: JSON.stringify({ attempts: 0, phase: "complete" }),
    progression_json: JSON.stringify(progression),
    initial_state_json: JSON.stringify({ attempts: 0, phase: "puzzle" }),
    initial_progression_json: JSON.stringify({
      graphId: "field.progression",
      nodes: [{ nodeId: "finish", status: "active" }],
    }),
    journal_position: 1,
  },
  journals: [
    {
      sequence: 1,
      command_id: "command-1",
      record_json: JSON.stringify(acceptedRecord),
    },
  ],
  receipts: [
    {
      command_id: "command-1",
      expected_state_version: 0,
      candidate_json: JSON.stringify(acceptedCandidate),
      result_json: JSON.stringify(acceptedResult),
      resulting_state_version: 1,
    },
  ],
  observationLinks: [
    { command_id: "command-1", observation_id: "location-1", observation_exists: 1 },
  ],
} satisfies RecoveryRecords;

const validateState = ({ state }: { readonly state: Record<string, unknown> }) =>
  typeof state.phase === "string" && typeof state.attempts === "number";
const validators = {
  validateState,
  validateSchema: (schemaId: string, value: Record<string, unknown>) =>
    schemaId === "field.player-state" ? validateState({ state: value }) : true,
  validateProgression: (progressionId: string, value: ProgressionInstance) =>
    progressionId === "field.progression" && value.graphId === progressionId,
};

describe("recovery artifact boundary", () => {
  it("reverifies exact installed bytes and the stored manifest", async () => {
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 0 },
      aggregateSchemas: [
        {
          id: "field.player-state",
          kind: "player",
          version: 1,
          path: "schemas/player.json",
        },
      ],
      capabilities: [],
      entrypoints: { logic: "logic.js", presentation: "presentation.js" },
      entries: [
        { path: "logic.js", kind: "logic-bundle", bytes: new TextEncoder().encode("export {}") },
        {
          path: "presentation.js",
          kind: "presentation-bundle",
          bytes: new TextEncoder().encode("export {}"),
        },
        { path: "composition/game.json", kind: "content", value: composition },
        {
          path: "composition/components/field.component.json",
          kind: "component-data",
          value: { id: "field.component" },
        },
        {
          path: "progressions/field.progression.json",
          kind: "progression",
          value: { id: "field.progression", aggregateModel: "field.player" },
        },
        {
          path: "schemas/field.advance-outcome.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        {
          path: "schemas/field.advance-payload.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        {
          path: "schemas/field.effect.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        {
          path: "schemas/field.event.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        {
          path: "schemas/field.initialization.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        {
          path: "schemas/field.noted-event.json",
          kind: "command-schema",
          value: { type: "object" },
        },
        { path: "schemas/player.json", kind: "aggregate-schema", value: { type: "object" } },
      ],
    });
    if ("kind" in artifact) throw new Error("release-fixture-invalid");

    const verified = await verifyRecoveryArtifact({
      bytes: artifact.bytes,
      expectedReleaseId: artifact.releaseId,
      manifestJson: JSON.stringify(artifact.manifest),
    });
    expect(verified).toMatchObject({ kind: "valid", composition });
    if (verified.kind !== "valid") throw new Error(verified.code);
    expect(verified.validateSchema("field.player-state", { attempts: 0 })).toBe(true);
    expect(verified.validateSchema("missing", {})).toBe(false);
    expect(verified.validateProgression("field.progression", progression)).toBe(true);
    expect(
      verified.validateProgression("field.progression", {
        graphId: "other.progression",
        nodes: progression.nodes,
      }),
    ).toBe(false);

    const altered = new Uint8Array(artifact.bytes);
    const lastIndex = altered.length - 1;
    altered[lastIndex] = altered[lastIndex]! ^ 1;
    await expect(
      verifyRecoveryArtifact({
        bytes: altered,
        expectedReleaseId: artifact.releaseId,
        manifestJson: JSON.stringify(artifact.manifest),
      }),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      verifyRecoveryArtifact({
        bytes: artifact.bytes,
        expectedReleaseId: artifact.releaseId,
        manifestJson: JSON.stringify({ ...artifact.manifest, capabilities: [{ id: "extra" }] }),
      }),
    ).resolves.toEqual({ kind: "invalid", code: "recovery-manifest-mismatch" });
  });
});

describe("recovery record coherence", () => {
  it("recovers exact model, schema, state, progression, events, effects, and record identity", () => {
    expect(validateRecoveryRecords(manifest, composition, validRecords, validators)).toEqual({
      kind: "valid",
      aggregate: {
        modelId: "field.player",
        aggregateId: "field-player",
        aggregateKind: "player",
        schemaId: "field.player-state",
        stateVersion: 1,
        state: { attempts: 0, phase: "complete" },
        progression,
      },
    });
  });

  it("recovers state-, progression-, event-, and effect-only accepted records at exact versions", () => {
    const candidateBase = {
      modelId: "field.player",
      commandType: "field.advance",
      payload: { answer: "north" },
      target: {
        aggregateId: "field-player",
        aggregateKind: "player" as const,
        schemaId: "field.player-state",
      },
      observationIds: [],
    };
    const candidates = [
      {
        ...candidateBase,
        commandId: "state-only",
        expectedStateVersion: 0,
        terminal: "accepted",
        nextState: { attempts: 1, phase: "complete" },
        outcome: { result: "state-recorded" },
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [],
      },
      {
        ...candidateBase,
        commandId: "progression-only",
        expectedStateVersion: 1,
        terminal: "accepted",
        nextProgression: progression,
        outcome: { result: "progression-recorded" },
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [
          {
            sequence: 1,
            round: 1,
            source: "command",
            transitionId: "finish",
            nodeId: "finish",
            from: "active",
            to: "completed",
          },
        ],
      },
      {
        ...candidateBase,
        commandId: "event-only",
        expectedStateVersion: 2,
        terminal: "accepted",
        outcome: { result: "event-recorded" },
        domainEvents: [{ type: "field.noted", payload: { phase: "complete" } }],
        effectIntents: [],
        progressionTrace: [],
      },
      {
        ...candidateBase,
        commandId: "effect-only",
        expectedStateVersion: 3,
        terminal: "accepted",
        outcome: { result: "effect-recorded" },
        domainEvents: [],
        effectIntents: [{ type: "field.notify", payload: { message: "Complete" } }],
        progressionTrace: [],
      },
    ] satisfies readonly CandidateTransition[];
    const results = candidates.map((candidate, index) => ({
      commandId: candidate.commandId,
      disposition: "committed" as const,
      terminal: "accepted" as const,
      resultingStateVersion: index + 1,
      outcome: candidate.outcome,
    }));
    const records: RecoveryRecords = {
      snapshot: {
        model_id: "field.player",
        aggregate_id: "field-player",
        aggregate_kind: "player",
        schema_id: "field.player-state",
        state_version: 4,
        state_json: JSON.stringify({ attempts: 1, phase: "complete" }),
        progression_json: JSON.stringify(progression),
        initial_state_json: JSON.stringify({ attempts: 0, phase: "puzzle" }),
        initial_progression_json: JSON.stringify({
          graphId: "field.progression",
          nodes: [{ nodeId: "finish", status: "active" }],
        }),
        journal_position: 4,
      },
      journals: candidates.map((candidate, index) => ({
        sequence: index + 1,
        command_id: candidate.commandId,
        record_json: JSON.stringify({ candidate, result: results[index] }),
      })),
      receipts: candidates.map((candidate, index) => ({
        command_id: candidate.commandId,
        expected_state_version: index,
        candidate_json: JSON.stringify(candidate),
        result_json: JSON.stringify(results[index]),
        resulting_state_version: index + 1,
      })),
      observationLinks: [],
    };

    expect(validateRecoveryRecords(manifest, composition, records, validators)).toEqual({
      kind: "valid",
      aggregate: {
        modelId: "field.player",
        aggregateId: "field-player",
        aggregateKind: "player",
        schemaId: "field.player-state",
        stateVersion: 4,
        state: { attempts: 1, phase: "complete" },
        progression,
      },
    });
  });

  it("keeps no-op receipts without synthesizing a journal or state-version advance", () => {
    const noOpCandidate = {
      ...acceptedCandidate,
      commandId: "command-2",
      expectedStateVersion: 1,
      observationIds: [],
      terminal: "no-op",
      outcome: { result: "unchanged" },
    } as const;
    const noOpResult = {
      commandId: "command-2",
      disposition: "committed",
      terminal: "no-op",
      resultingStateVersion: 1,
      outcome: { result: "unchanged" },
    } as const;
    const { nextState, nextProgression, domainEvents, effectIntents, progressionTrace, ...base } =
      noOpCandidate;
    void nextState;
    void nextProgression;
    void domainEvents;
    void effectIntents;
    void progressionTrace;

    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          receipts: [
            ...validRecords.receipts,
            {
              command_id: "command-2",
              expected_state_version: 1,
              candidate_json: JSON.stringify(base),
              result_json: JSON.stringify(noOpResult),
              resulting_state_version: 1,
            },
          ],
        },
        validators,
      ),
    ).toMatchObject({ kind: "valid", aggregate: { stateVersion: 1 } });
  });

  it("recovers rejected and recorded-invalid receipts without synthesizing journal entries", () => {
    const {
      nextState,
      nextProgression,
      outcome,
      domainEvents,
      effectIntents,
      progressionTrace,
      ...candidateBase
    } = acceptedCandidate;
    void nextState;
    void nextProgression;
    void outcome;
    void domainEvents;
    void effectIntents;
    void progressionTrace;
    const rejectedCandidate = {
      ...candidateBase,
      commandId: "command-rejected",
      expectedStateVersion: 1,
      observationIds: [],
      terminal: "rejected",
      outcome: { result: "outside" },
    } satisfies CandidateTransition;
    const invalidCandidate = {
      ...candidateBase,
      commandId: "command-invalid",
      expectedStateVersion: 1,
      observationIds: [],
      terminal: "invalid",
      phase: "execution",
      diagnosticCodes: ["observation-exhausted"],
      attemptedProgressionTrace: [],
    } satisfies CandidateTransition;
    const rejectedResult = {
      commandId: rejectedCandidate.commandId,
      disposition: "committed",
      terminal: "rejected",
      resultingStateVersion: 1,
      outcome: rejectedCandidate.outcome,
    } as const;
    const invalidResult = {
      commandId: invalidCandidate.commandId,
      disposition: "committed",
      terminal: "invalid",
      phase: "execution",
      resultingStateVersion: 1,
      diagnosticCodes: invalidCandidate.diagnosticCodes,
    } as const;

    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          receipts: [
            ...validRecords.receipts,
            {
              command_id: rejectedCandidate.commandId,
              expected_state_version: 1,
              candidate_json: JSON.stringify(rejectedCandidate),
              result_json: JSON.stringify(rejectedResult),
              resulting_state_version: 1,
            },
            {
              command_id: invalidCandidate.commandId,
              expected_state_version: 1,
              candidate_json: JSON.stringify(invalidCandidate),
              result_json: JSON.stringify(invalidResult),
              resulting_state_version: 1,
            },
          ],
        },
        validators,
      ),
    ).toMatchObject({ kind: "valid", aggregate: { stateVersion: 1 } });
  });

  it("rejects records not bound to the installed composition model, command, or progression", () => {
    const undeclaredCandidate = { ...acceptedCandidate, commandType: "field.undeclared" };
    const undeclaredRecords: RecoveryRecords = {
      ...validRecords,
      journals: [
        {
          ...validRecords.journals[0]!,
          record_json: JSON.stringify({ candidate: undeclaredCandidate, result: acceptedResult }),
        },
      ],
      receipts: [
        {
          ...validRecords.receipts[0]!,
          candidate_json: JSON.stringify(undeclaredCandidate),
        },
      ],
    };
    expect(validateRecoveryRecords(manifest, composition, undeclaredRecords, validators)).toEqual({
      kind: "invalid",
      code: "recovery-command-composition-mismatch",
    });

    const mismatchedComposition = {
      ...composition,
      aggregateModels: [{ ...composition.aggregateModels[0]!, id: "other.player" }],
      commands: [{ ...composition.commands[0]!, aggregateModel: "other.player" }],
      progressions: [{ ...composition.progressions[0]!, aggregateModel: "other.player" }],
    } satisfies GameComposition;
    expect(
      validateRecoveryRecords(manifest, mismatchedComposition, validRecords, validators),
    ).toEqual({ kind: "invalid", code: "recovery-model-composition-mismatch" });

    expect(
      validateRecoveryRecords(
        manifest,
        { ...composition, progressions: [] },
        validRecords,
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-progression-composition-mismatch" });
  });

  it("rejects a final snapshot not reached by accepted journal state and progression changes", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          snapshot: {
            ...validRecords.snapshot,
            state_json: JSON.stringify({ attempts: 0, phase: "different" }),
          },
        },
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-journal-state-mismatch" });

    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          snapshot: {
            ...validRecords.snapshot,
            progression_json: JSON.stringify({
              graphId: "field.progression",
              nodes: [{ nodeId: "finish", status: "active" }],
            }),
          },
        },
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-journal-progression-mismatch" });
  });

  it("rejects a schema-valid final snapshot tampered after an event-only history", () => {
    const eventOnlyCandidate = {
      ...acceptedCandidate,
      nextState: undefined,
      nextProgression: undefined,
      observationIds: [],
      domainEvents: [{ type: "field.noted", payload: { phase: "puzzle" } }],
      effectIntents: [],
      progressionTrace: [],
    };
    const { nextState, nextProgression, ...candidateWithoutUndefined } = eventOnlyCandidate;
    void nextState;
    void nextProgression;
    const eventOnlyResult = { ...acceptedResult, outcome: candidateWithoutUndefined.outcome };
    const eventOnlyRecords: RecoveryRecords = {
      snapshot: {
        ...validRecords.snapshot,
        state_json: JSON.stringify({ attempts: 99, phase: "tampered" }),
        progression_json: validRecords.snapshot.initial_progression_json,
      },
      journals: [
        {
          sequence: 1,
          command_id: candidateWithoutUndefined.commandId,
          record_json: JSON.stringify({
            candidate: candidateWithoutUndefined,
            result: eventOnlyResult,
          }),
        },
      ],
      receipts: [
        {
          command_id: candidateWithoutUndefined.commandId,
          expected_state_version: 0,
          candidate_json: JSON.stringify(candidateWithoutUndefined),
          result_json: JSON.stringify(eventOnlyResult),
          resulting_state_version: 1,
        },
      ],
      observationLinks: [],
    };

    expect(validateRecoveryRecords(manifest, composition, eventOnlyRecords, validators)).toEqual({
      kind: "invalid",
      code: "recovery-journal-state-mismatch",
    });
  });

  it("rejects malformed, superseded, or identity-mismatched snapshots", () => {
    expect(isRecoverableSnapshotState({ phase: "puzzle", attempts: 1 })).toBe(true);
    expect(isRecoverableSnapshotState(null)).toBe(false);
    expect(isRecoverableSnapshotState(["partial"])).toBe(false);

    for (const snapshot of [
      { ...validRecords.snapshot, state_json: "{" },
      { ...validRecords.snapshot, state_json: "[]" },
      { ...validRecords.snapshot, model_id: "" },
      { ...validRecords.snapshot, aggregate_kind: "team" },
      { ...validRecords.snapshot, schema_id: "other.player-state" },
      { ...validRecords.snapshot, state_version: -1 },
      { ...validRecords.snapshot, progression_json: "{}" },
      { ...validRecords.snapshot, schema_version: 1 },
    ]) {
      expect(
        validateRecoveryRecords(
          manifest,
          composition,
          { ...validRecords, snapshot } as RecoveryRecords,
          validators,
        ).kind,
      ).toBe("invalid");
    }
  });

  it("rejects incoherent journals, versions, receipts, and observation links", () => {
    const changedRecord = {
      ...acceptedRecord,
      candidate: { ...acceptedCandidate, effectIntents: [] },
    };
    const incoherent: RecoveryRecords[] = [
      { ...validRecords, snapshot: { ...validRecords.snapshot, journal_position: 0 } },
      { ...validRecords, snapshot: { ...validRecords.snapshot, state_version: 2 } },
      { ...validRecords, journals: [{ ...validRecords.journals[0]!, sequence: 2 }] },
      { ...validRecords, journals: [{ ...validRecords.journals[0]!, record_json: "{" }] },
      {
        ...validRecords,
        journals: [{ ...validRecords.journals[0]!, record_json: JSON.stringify(changedRecord) }],
      },
      { ...validRecords, receipts: [] },
      { ...validRecords, observationLinks: [] },
      {
        ...validRecords,
        observationLinks: [
          { command_id: "command-1", observation_id: "location-1", observation_exists: 0 },
        ],
      },
      {
        ...validRecords,
        receipts: [{ ...validRecords.receipts[0]!, resulting_state_version: 2 }],
      },
      {
        ...validRecords,
        receipts: [{ ...validRecords.receipts[0]!, candidate_json: "{" }],
      },
      {
        ...validRecords,
        receipts: [{ ...validRecords.receipts[0]!, result_json: "{" }],
      },
    ];
    for (const records of incoherent) {
      expect(validateRecoveryRecords(manifest, composition, records, validators).kind).toBe(
        "invalid",
      );
    }
  });

  it.each([null, [], "receipt", 7])("rejects JSON-valid non-object receipt result %j", (result) => {
    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          receipts: [
            {
              ...validRecords.receipts[0]!,
              result_json: JSON.stringify(result),
            },
          ],
        },
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-receipt-invalid" });
  });

  it("rejects receipts or links when no snapshot exists", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        { ...validRecords, snapshot: null, journals: [] },
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-records-without-snapshot" });
  });

  it("rejects canonical state that fails the installed release schema", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        composition,
        {
          ...validRecords,
          snapshot: { ...validRecords.snapshot, state_json: JSON.stringify({ phase: "complete" }) },
        },
        validators,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-snapshot-state-schema-invalid" });
  });
});
