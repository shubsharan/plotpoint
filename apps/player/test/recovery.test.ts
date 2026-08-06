import { createReleaseArtifact, type ReleaseManifest } from "@plotpoint/protocol";
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
        { path: "schemas/player.json", kind: "aggregate-schema", value: { type: "object" } },
      ],
    });
    if ("kind" in artifact) throw new Error("release-fixture-invalid");

    await expect(
      verifyRecoveryArtifact({
        bytes: artifact.bytes,
        expectedReleaseId: artifact.releaseId,
        manifestJson: JSON.stringify(artifact.manifest),
      }),
    ).resolves.toMatchObject({ kind: "valid" });

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
    expect(validateRecoveryRecords(manifest, validRecords, validateState)).toEqual({
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
        validateState,
      ),
    ).toMatchObject({ kind: "valid", aggregate: { stateVersion: 1 } });
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
          { ...validRecords, snapshot } as RecoveryRecords,
          validateState,
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
      expect(validateRecoveryRecords(manifest, records, validateState).kind).toBe("invalid");
    }
  });

  it.each([null, [], "receipt", 7])("rejects JSON-valid non-object receipt result %j", (result) => {
    expect(
      validateRecoveryRecords(
        manifest,
        {
          ...validRecords,
          receipts: [
            {
              ...validRecords.receipts[0]!,
              result_json: JSON.stringify(result),
            },
          ],
        },
        validateState,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-receipt-invalid" });
  });

  it("rejects receipts or links when no snapshot exists", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        { ...validRecords, snapshot: null, journals: [] },
        validateState,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-records-without-snapshot" });
  });

  it("rejects canonical state that fails the installed release schema", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        {
          ...validRecords,
          snapshot: { ...validRecords.snapshot, state_json: JSON.stringify({ phase: "complete" }) },
        },
        validateState,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-snapshot-state-schema-invalid" });
  });
});
