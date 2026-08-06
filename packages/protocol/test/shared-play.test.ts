import { describe, expect, it, vi } from "vitest";

import {
  createSharedPlayClient,
  isGamePlayReport,
  isSharedJoinRequest,
  isSharedJoinResponse,
  isSharedCommandIntent,
  isSharedPlayView,
  isSyncCommand,
  isSyncPull,
  type SharedCommandIntent,
  type SharedJoinRequest,
  type SharedJoinResponse,
  type SharedPlayView,
} from "../src/index.js";
import * as protocol from "../src/index.js";

const releaseId = `sha256:${"a".repeat(64)}` as const;
const confirmedAt = "2026-08-04T00:00:00.000Z";

const target = {
  aggregateKind: "team",
  aggregateId: "team-1",
  schemaId: "example.shared-state",
} as const;

const intent: SharedCommandIntent = {
  commandId: "command-1",
  target,
  expectedStateVersion: 0,
  type: "example.vote.cast",
  payload: { optionId: "north" },
  observationIds: [],
};

const view: SharedPlayView = {
  sessionId: "session-1",
  releaseId,
  transport: "online",
  synchronization: "current",
  confirmedAt,
  membership: { status: "active", teamId: "team-1" },
  projections: [{ ...target, stateVersion: 0, value: { votes: [] } }],
  actions: [],
};

const initialPull = {
  kind: "snapshot",
  reset: true,
  nextCursor: "0",
  snapshot: {
    sessionId: view.sessionId,
    releaseId,
    participantId: "participant-1",
    teamId: "team-1",
    membershipStatus: "active",
    confirmedAt,
    projections: view.projections,
  },
  commandResults: [],
} as const;

describe("generic shared play contracts", () => {
  it("rejects the removed SharedHuntReport surface and shape", () => {
    expect(protocol).not.toHaveProperty("isSharedHuntReport");
    expect(
      isGamePlayReport({
        releaseId,
        sessionAlias: "session",
        selfAlias: "self",
        platform: "ios",
        durationMs: 1,
        completion: { completedTargets: 1, totalTargets: 1, complete: true },
        events: [],
      }),
    ).toBe(false);
  });

  it("accepts unrelated command and projection schemas without mechanic branches", () => {
    expect(isSharedCommandIntent(intent)).toBe(true);
    expect(
      isSharedCommandIntent({
        ...intent,
        type: "example.inventory.claim",
        payload: { itemId: "map" },
      }),
    ).toBe(true);
    expect(isSharedPlayView(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("hunt");
    expect(JSON.stringify(view)).not.toContain("targetId");
  });

  it("rejects unknown fields and replacement observation values", () => {
    expect(isSharedCommandIntent({ ...intent, hunt: {} })).toBe(false);
    expect(isSharedCommandIntent({ ...intent, observations: [{ latitude: 1 }] })).toBe(false);
    expect(
      isSharedCommandIntent({
        ...intent,
        target: { ...intent.target, schemaVersion: 1 },
      }),
    ).toBe(false);
  });

  it("preserves every terminal through snapshot recovery", () => {
    const results = ["accepted", "no-op", "rejected", "invalid"].map((terminal, index) => ({
      commandId: `command-${index}`,
      disposition: "decided",
      terminal,
      outcomeCode: terminal,
      resultingStateVersion: index,
      decisionPosition: String(index + 1),
    }));
    expect(
      isSyncPull({
        kind: "snapshot",
        reset: false,
        nextCursor: "4",
        snapshot: {
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

  it("requires host-resolved Location  observations on the service wire", () => {
    expect(
      isSyncCommand({
        commandId: intent.commandId,
        target: intent.target,
        expectedStateVersion: intent.expectedStateVersion,
        type: intent.type,
        payload: intent.payload,
        observations: [
          {
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

  it("uses plain release-pinned join bodies and rejects repeated body versions", () => {
    const request: SharedJoinRequest = {
      joinRequestId: "join-1",
      expectedReleaseId: releaseId,
      invitation: "invitation-secret-with-enough-entropy",
      participantCredential: "participant-secret-with-enough-entropy",
    };
    const response: SharedJoinResponse = {
      participantId: initialPull.snapshot.participantId,
      teamId: initialPull.snapshot.teamId,
      releaseId,
      disposition: "joined",
      sync: initialPull,
    };

    expect(isSharedJoinRequest(request)).toBe(true);
    expect(isSharedJoinResponse(response)).toBe(true);
    expect(isSharedJoinRequest({ version: 1, ...request })).toBe(false);
    expect(isSharedJoinResponse({ version: 1, ...response })).toBe(false);
    expect(
      isSharedJoinResponse({
        ...response,
        teamId: "different-team",
      }),
    ).toBe(false);
    expect(
      isSharedJoinResponse({
        ...response,
        sync: {
          ...response.sync,
          snapshot: { ...response.sync.snapshot, releaseId: `sha256:${"b".repeat(64)}` },
        },
      }),
    ).toBe(false);
  });

  it("validates semantic client responses and correlation", async () => {
    const send = vi.fn().mockResolvedValueOnce(view).mockResolvedValueOnce({
      commandId: intent.commandId,
      disposition: "queued",
      terminal: "pending",
    });
    const client = createSharedPlayClient({ send, subscribe: () => () => undefined });
    await expect(client.getView()).resolves.toEqual(view);
    await expect(client.enqueueCommand(intent)).resolves.toMatchObject({ terminal: "pending" });
  });
});
