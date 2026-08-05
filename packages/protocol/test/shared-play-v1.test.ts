import { describe, expect, it, vi } from "vitest";

import {
  createSharedPlayClientV1,
  isSharedCommandIntentV1,
  isSharedPlayViewV1,
  isSyncCommandV1,
  isSyncPullV1,
  type SharedCommandIntentV1,
  type SharedPlayViewV1,
} from "../src/index.js";

const target = {
  aggregateKind: "team",
  aggregateId: "team-1",
  schemaId: "example.shared-state.v1",
  schemaVersion: 1,
} as const;

const intent: SharedCommandIntentV1 = {
  commandId: "command-1",
  target,
  expectedStateVersion: 0,
  type: "example.vote.cast.v1",
  payload: { optionId: "north" },
  observationIds: [],
};

const view: SharedPlayViewV1 = {
  sessionId: "session-1",
  releaseId: `sha256:${"a".repeat(64)}`,
  transport: "online",
  synchronization: "current",
  confirmedAt: "2026-08-04T00:00:00.000Z",
  membership: { status: "active", teamId: "team-1" },
  projections: [{ ...target, stateVersion: 0, value: { votes: [] } }],
  actions: [],
};

describe("generic shared play contracts", () => {
  it("accepts unrelated command and projection schemas without mechanic branches", () => {
    expect(isSharedCommandIntentV1(intent)).toBe(true);
    expect(
      isSharedCommandIntentV1({
        ...intent,
        type: "example.inventory.claim.v1",
        payload: { itemId: "map" },
      }),
    ).toBe(true);
    expect(isSharedPlayViewV1(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("hunt");
    expect(JSON.stringify(view)).not.toContain("targetId");
  });

  it("rejects unknown fields and replacement observation values", () => {
    expect(isSharedCommandIntentV1({ ...intent, hunt: {} })).toBe(false);
    expect(isSharedCommandIntentV1({ ...intent, observations: [{ latitude: 1 }] })).toBe(false);
  });

  it("preserves every terminal through snapshot recovery", () => {
    const results = ["accepted", "no-op", "rejected", "invalid"].map((terminal, index) => ({
      version: 1,
      commandId: `command-${index}`,
      disposition: "decided",
      terminal,
      outcomeCode: terminal,
      resultingStateVersion: index,
      decisionPosition: String(index + 1),
    }));
    expect(
      isSyncPullV1({
        version: 1,
        kind: "snapshot",
        reset: false,
        nextCursor: "4",
        snapshot: {
          version: 1,
          sessionId: view.sessionId,
          releaseId: view.releaseId,
          participantId: "participant-1",
          teamId: "team-1",
          membershipStatus: "active",
          confirmedAt: view.confirmedAt,
          projections: view.projections,
        },
        commandResults: results,
      }),
    ).toBe(true);
  });

  it("requires host-resolved Location V1 observations on the service wire", () => {
    expect(
      isSyncCommandV1({
        version: 1,
        commandId: intent.commandId,
        target: intent.target,
        expectedStateVersion: intent.expectedStateVersion,
        type: intent.type,
        payload: intent.payload,
        observations: [
          {
            version: 1,
            observationId: "observation-1",
            recordedAt: "2026-08-04T00:00:00.000Z",
            availability: "available",
            capturedAt: "2026-08-04T00:00:00.000Z",
            ageMs: 0,
            latitude: 37,
            longitude: -122,
            horizontalAccuracy: 5,
          },
        ],
      }),
    ).toBe(true);
  });

  it("validates semantic client responses and correlation", async () => {
    const send = vi.fn().mockResolvedValueOnce(view).mockResolvedValueOnce({
      commandId: intent.commandId,
      disposition: "queued",
      terminal: "pending",
    });
    const client = createSharedPlayClientV1({ send, subscribe: () => () => undefined });
    await expect(client.getView()).resolves.toEqual(view);
    await expect(client.enqueueCommand(intent)).resolves.toMatchObject({ terminal: "pending" });
  });
});
