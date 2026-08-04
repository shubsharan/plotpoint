import { createReleaseArtifact, type ReleaseManifestV1 } from "@plotpoint/protocol";
import { describe, expect, it } from "vitest";

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
    { id: "field.player-state.v1", kind: "player", version: 1, path: "schemas/player.json" },
  ],
  capabilities: [],
  entrypoints: { logic: "logic.js", presentation: "presentation.js" },
  inventory: [],
} satisfies ReleaseManifestV1;

const validRecords = {
  snapshot: {
    aggregate_id: "field-player",
    aggregate_kind: "player",
    schema_id: "field.player-state.v1",
    schema_version: 1,
    state_version: 1,
    state_json: JSON.stringify({ attempts: 0, phase: "puzzle" }),
    journal_position: 1,
  },
  journals: [
    {
      sequence: 1,
      command_id: "command-1",
      outcome_json: JSON.stringify({ result: "advanced" }),
      progression_json: JSON.stringify(["puzzle"]),
    },
  ],
  receipts: [
    {
      command_id: "command-1",
      expected_version: 0,
      resulting_version: 1,
      result_json: JSON.stringify({
        kind: "accepted",
        commandId: "command-1",
        commandOutcome: "accepted",
        aggregateId: "field-player",
        aggregateKind: "player",
        schemaId: "field.player-state.v1",
        schemaVersion: 1,
        expectedVersion: 0,
        resultingVersion: 1,
        outcome: { result: "advanced" },
        observationIds: ["location-1"],
      }),
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
          id: "field.player-state.v1",
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
  it("accepts a valid restart snapshot with its exact journal and receipt", () => {
    expect(validateRecoveryRecords(manifest, validRecords, validateState)).toMatchObject({
      kind: "valid",
      aggregate: {
        aggregateId: "field-player",
        schemaId: "field.player-state.v1",
        schemaVersion: 1,
        stateVersion: 1,
        state: { attempts: 0, phase: "puzzle" },
      },
    });
  });

  it("rejects malformed snapshots and schema or version mismatch", () => {
    expect(isRecoverableSnapshotState({ phase: "puzzle", attempts: 1 })).toBe(true);
    expect(isRecoverableSnapshotState(null)).toBe(false);
    expect(isRecoverableSnapshotState(["partial"])).toBe(false);

    for (const snapshot of [
      { ...validRecords.snapshot, state_json: "{" },
      { ...validRecords.snapshot, state_json: "[]" },
      { ...validRecords.snapshot, aggregate_kind: "team" },
      { ...validRecords.snapshot, schema_id: "other.player-state.v1" },
      { ...validRecords.snapshot, schema_version: 2 },
      { ...validRecords.snapshot, state_version: -1 },
    ]) {
      expect(
        validateRecoveryRecords(manifest, { ...validRecords, snapshot }, validateState).kind,
      ).toBe("invalid");
    }
  });

  it("rejects journal positions, sequences, versions, and missing receipt links", () => {
    const incoherent: RecoveryRecords[] = [
      { ...validRecords, snapshot: { ...validRecords.snapshot, journal_position: 0 } },
      { ...validRecords, snapshot: { ...validRecords.snapshot, state_version: 2 } },
      { ...validRecords, journals: [{ ...validRecords.journals[0]!, sequence: 2 }] },
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
        receipts: [{ ...validRecords.receipts[0]!, resulting_version: 2 }],
      },
      {
        ...validRecords,
        receipts: [{ ...validRecords.receipts[0]!, result_json: "{" }],
      },
      {
        ...validRecords,
        receipts: [
          {
            ...validRecords.receipts[0]!,
            result_json: JSON.stringify({ kind: "accepted", commandId: "command-1" }),
          },
        ],
      },
      {
        ...validRecords,
        journals: [
          {
            ...validRecords.journals[0]!,
            outcome_json: JSON.stringify({ result: "different" }),
          },
        ],
      },
      {
        ...validRecords,
        journals: [{ ...validRecords.journals[0]!, progression_json: "{}" }],
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

  it("rejects canonical state that fails the release schema", () => {
    expect(
      validateRecoveryRecords(
        manifest,
        {
          ...validRecords,
          snapshot: { ...validRecords.snapshot, state_json: JSON.stringify({ phase: "puzzle" }) },
        },
        validateState,
      ),
    ).toEqual({ kind: "invalid", code: "recovery-snapshot-state-schema-invalid" });
  });
});
