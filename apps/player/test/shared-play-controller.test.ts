import type { SharedPlayView } from "@plotpoint/protocol";
import { describe, expect, it, vi } from "vitest";

import type { ParticipantCredentialStore } from "../src/shared/credentials";
import type { SharedSyncStore } from "../src/shared/database";
import { SharedPlayController } from "../src/shared/session-controller";

const releaseId = `sha256:${"a".repeat(64)}` as const;

function view(membership: "active" | "revoked" = "active"): SharedPlayView {
  return {
    sessionId: "session-1",
    releaseId,
    transport: membership === "active" ? "online" : "degraded",
    synchronization: membership === "active" ? "current" : "revoked",
    confirmedAt: "2030-01-01T00:00:00.000Z",
    membership: { status: membership, teamId: "team-1" },
    projections: [],
    actions: [],
  };
}

function harness(initialMembership: "active" | "revoked" = "active") {
  let current = view(initialMembership);
  const request = vi.fn(async () => undefined);
  const removeCredential = vi.fn(async () => undefined);
  const store = {
    sessionForRun: vi.fn(async () => "session-1"),
    pendingJoinForRun: vi.fn(async () => null),
    view: vi.fn(async () => current),
    session: vi.fn(async () => ({ credentialKey: "run-envelope" })),
    enqueue: vi.fn(async () => ({
      commandId: "command-1",
      disposition: "enqueued" as const,
      terminal: "pending" as const,
    })),
  };
  const credentials = {
    removeCredential,
  };
  const controller = new SharedPlayController(
    { runId: "run-1", releaseId, sharedRequired: true },
    store as unknown as SharedSyncStore,
    credentials as unknown as ParticipantCredentialStore,
    { request },
  );
  return {
    controller,
    request,
    removeCredential,
    revoke: () => {
      current = view("revoked");
    },
  };
}

describe("run-scoped shared play controller", () => {
  it("recovers the deterministic pending envelope when a crash preceded SQLite reservation", async () => {
    let bound = false;
    const reservePendingJoin = vi.fn(async (input) => ({ ...input, status: "preparing" as const }));
    const markPendingJoinReady = vi.fn(async (runId: string, requestDigest: string) => ({
      ...(await reservePendingJoin.mock.results[0]!.value),
      runId,
      requestDigest,
      status: "ready" as const,
    }));
    const markPendingJoinSubmitting = vi.fn(async (runId: string, requestDigest: string) => ({
      ...(await markPendingJoinReady.mock.results[0]!.value),
      runId,
      requestDigest,
      status: "submitting" as const,
    }));
    const store = {
      sessionForRun: vi.fn(async () => (bound ? "session-1" : null)),
      pendingJoinForRun: vi.fn(async () => null),
      reservePendingJoin,
      markPendingJoinReady,
      markPendingJoinSubmitting,
      commitJoinedSession: vi.fn(async () => {
        bound = true;
      }),
      view: vi.fn(async () => view()),
    };
    const credentials = {
      getEnvelope: vi.fn(async () => ({
        kind: "pending" as const,
        sessionId: "session-1",
        expectedReleaseId: releaseId,
        serviceOrigin: "https://service.example",
        joinRequestId: "join-original",
        invitation: "invitation-original",
        participantCredential: "credential-original",
      })),
      getCredential: vi.fn(async () => "credential-original"),
      putEnvelope: vi.fn(async () => undefined),
      removeCredential: vi.fn(async () => undefined),
    };
    const join = vi.fn(async () => ({
      participantId: "participant-1",
      teamId: "team-1",
      releaseId,
      disposition: "joined" as const,
      sync: {
        kind: "snapshot" as const,
        reset: true,
        nextCursor: "1",
        snapshot: {
          sessionId: "session-1",
          releaseId,
          participantId: "participant-1",
          teamId: "team-1",
          membershipStatus: "active" as const,
          confirmedAt: "2030-01-01T00:00:00.000Z",
          projections: [],
        },
        commandResults: [],
      },
    }));
    const controller = new SharedPlayController(
      { runId: "run-1", releaseId, sharedRequired: true },
      store as unknown as SharedSyncStore,
      credentials as unknown as ParticipantCredentialStore,
      { request: vi.fn(async () => undefined) },
      () => ({ join }) as never,
    );

    await controller.start();

    expect(reservePendingJoin).toHaveBeenCalledWith(
      expect.objectContaining({ joinRequestId: "join-original" }),
    );
    expect(join).toHaveBeenCalledWith(
      expect.objectContaining({
        joinRequestId: "join-original",
        invitation: "invitation-original",
        participantCredential: "credential-original",
      }),
    );
    expect(controller.snapshot()).toMatchObject({ status: "bound", sessionId: "session-1" });
  });

  it("uses start as the only recovery entrypoint and publishes the bound view", async () => {
    const { controller, request } = harness();
    const states: string[] = [];
    controller.subscribe((state) => states.push(state.status));

    await controller.start();

    expect(request).toHaveBeenCalledWith("session-1", "startup");
    expect(states).toEqual(["join-required", "synchronizing", "bound"]);
    expect(controller.snapshot()).toMatchObject({ status: "bound", sessionId: "session-1" });
  });

  it("requests reconnect only for an unreachable-to-reachable transition", async () => {
    const { controller, request } = harness();
    await controller.start();
    request.mockClear();

    await controller.connectivityChanged(true);
    await controller.connectivityChanged(false);
    await controller.connectivityChanged(false);
    await controller.connectivityChanged(true);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("session-1", "reconnect");
  });

  it("publishes revocation, removes credentials, and blocks another command", async () => {
    const { controller, removeCredential, revoke } = harness();
    await controller.start();
    revoke();

    await controller.retry();

    expect(controller.snapshot()).toEqual({ status: "revoked", sessionId: "session-1" });
    expect(removeCredential).toHaveBeenCalledWith("run-envelope");
    await expect(
      controller.enqueue({
        commandId: "command-1",
        target: {
          aggregateKind: "team",
          aggregateId: "team-1",
          schemaId: "shared-state",
        },
        expectedStateVersion: 0,
        type: "shared.command",
        payload: {},
        observationIds: [],
      }),
    ).rejects.toThrow("shared-membership-revoked");
  });
});
