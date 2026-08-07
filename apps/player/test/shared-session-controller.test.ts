import { computeReleaseId, type SyncPull } from "@plotpoint/protocol";
import { describe, expect, it, vi } from "vitest";

import type { ParticipantCredentialStore, SharedSecretEnvelope } from "../src/shared/credentials";
import type { SharedSyncStore } from "../src/shared/database";
import type { SharedHttpClient } from "../src/shared/http-client";
import { SharedJoinCoordinator } from "../src/shared/session-controller";

const releaseA = `sha256:${"a".repeat(64)}` as const;
const releaseB = `sha256:${"b".repeat(64)}` as const;
const serviceOrigin = "https://service.example";
const textEncoder = new TextEncoder();

function digest(value: unknown): `sha256:${string}` {
  return computeReleaseId(textEncoder.encode(JSON.stringify(value)));
}

interface PendingJoinRecord {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly joinRequestId: string;
  readonly invitationDigest: string;
  readonly envelopeKey: string;
  readonly requestDigest: string;
  readonly status: "preparing" | "ready" | "submitting";
}

interface SessionBinding {
  readonly sessionId: string;
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly serviceOrigin: string;
  readonly envelopeKey: string;
}

interface JoinResponse {
  readonly participantId: string;
  readonly teamId: string;
  readonly releaseId: `sha256:${string}`;
  readonly disposition: "joined" | "duplicate";
  readonly sync: SyncPull;
}

interface Phase7Controller {
  recover(input: {
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
  }): Promise<unknown>;
  join(input: {
    readonly serviceUrl: string;
    readonly sessionId: string;
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
    readonly invitation: string;
  }): Promise<SyncPull>;
}

function pull(
  overrides: {
    readonly releaseId?: `sha256:${string}`;
    readonly membershipStatus?: "active" | "revoked";
  } = {},
): SyncPull {
  return {
    kind: "snapshot",
    reset: true,
    nextCursor: "cursor-1",
    snapshot: {
      sessionId: "session-a",
      releaseId: overrides.releaseId ?? releaseA,
      participantId: "participant-a",
      teamId: "team-a",
      membershipStatus: overrides.membershipStatus ?? "active",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      projections: [],
    },
    commandResults: [],
  };
}

function joinResponse(overrides: Partial<JoinResponse> = {}): JoinResponse {
  return {
    participantId: "participant-a",
    teamId: "team-a",
    releaseId: releaseA,
    disposition: "joined",
    sync: pull(),
    ...overrides,
  };
}

function pending(status: PendingJoinRecord["status"]): PendingJoinRecord {
  const invitationDigest = digest("invitation-a");
  const envelopeKey = "plotpoint.shared.run-a.envelope";
  const requestDigest = digest({
    credentialDigest: digest("credential-a"),
    envelopeKey,
    expectedReleaseId: releaseA,
    invitationDigest,
    joinRequestId: "join-request-a",
    runId: "run-a",
    serviceOrigin,
    sessionId: "session-a",
  });
  return {
    sessionId: "session-a",
    runId: "run-a",
    expectedReleaseId: releaseA,
    serviceOrigin,
    joinRequestId: "join-request-a",
    invitationDigest,
    envelopeKey,
    requestDigest,
    status,
  };
}

class PendingJoinStoreHarness {
  pending: PendingJoinRecord | null = null;
  bound = false;
  binding: SessionBinding | null = null;
  commitError: Error | null = null;
  readonly order: string[] = [];

  async sessionForRun(runId: string): Promise<string | null> {
    return this.binding?.runId === runId ? this.binding.sessionId : null;
  }

  async session(sessionId: string): Promise<SessionBinding | null> {
    return this.binding?.sessionId === sessionId ? this.binding : null;
  }

  async pendingJoinForRun(runId: string): Promise<PendingJoinRecord | null> {
    this.order.push("pending-read");
    return this.pending?.runId === runId ? this.pending : null;
  }

  async reservePendingJoin(input: Omit<PendingJoinRecord, "status">): Promise<PendingJoinRecord> {
    this.order.push("reserve");
    if (this.pending !== null) {
      const { status: _status, ...existing } = this.pending;
      if (JSON.stringify(existing) !== JSON.stringify(input)) {
        throw new Error("shared-pending-join-conflict");
      }
      return this.pending;
    }
    this.pending = { ...input, status: "preparing" };
    return this.pending;
  }

  async markPendingJoinReady(runId: string, requestDigest: string): Promise<PendingJoinRecord> {
    this.order.push("ready");
    if (
      this.pending === null ||
      this.pending.runId !== runId ||
      this.pending.requestDigest !== requestDigest
    ) {
      throw new Error("shared-pending-join-conflict");
    }
    this.pending = { ...this.pending, status: "ready" };
    return this.pending;
  }

  async markPendingJoinSubmitting(
    runId: string,
    requestDigest: string,
  ): Promise<PendingJoinRecord> {
    this.order.push("submitting");
    if (
      this.pending === null ||
      this.pending.runId !== runId ||
      this.pending.requestDigest !== requestDigest ||
      this.pending.status === "preparing"
    ) {
      throw new Error("shared-pending-join-conflict");
    }
    this.pending = { ...this.pending, status: "submitting" };
    return this.pending;
  }

  async cancelPreparingJoin(runId: string, requestDigest: string): Promise<void> {
    this.order.push("cancel-preparing");
    if (
      this.pending === null ||
      this.pending.runId !== runId ||
      this.pending.requestDigest !== requestDigest ||
      this.pending.status !== "preparing"
    ) {
      throw new Error("shared-pending-join-cancel-conflict");
    }
    this.pending = null;
  }

  async commitJoinedSession(input: {
    readonly binding: SessionBinding;
    readonly pull: SyncPull;
    readonly recoveryDisposition?: "join-resumed";
  }): Promise<void> {
    this.order.push("binding-commit");
    if (this.commitError !== null) {
      const error = this.commitError;
      this.commitError = null;
      throw error;
    }
    const attempt = this.pending;
    if (
      attempt === null ||
      attempt.status !== "submitting" ||
      input.binding.sessionId !== attempt.sessionId ||
      input.binding.runId !== attempt.runId ||
      input.binding.releaseId !== attempt.expectedReleaseId ||
      input.binding.serviceOrigin !== attempt.serviceOrigin ||
      input.binding.envelopeKey !== attempt.envelopeKey ||
      input.pull.snapshot.sessionId !== attempt.sessionId ||
      input.pull.snapshot.releaseId !== input.binding.releaseId ||
      input.pull.snapshot.participantId !== input.binding.participantId ||
      input.pull.snapshot.teamId !== input.binding.teamId
    ) {
      throw new Error("shared-session-binding-conflict");
    }
    this.bound = true;
    this.binding = input.binding;
    this.pending = null;
    if (input.recoveryDisposition !== undefined) this.order.push(input.recoveryDisposition);
  }

  async recordRecoveryEvidence(): Promise<void> {
    this.order.push("join-resumed");
  }

  async recordDiagnosticEvidence(): Promise<void> {
    this.order.push("delivery-interrupted");
  }
}

class JoinSecretHarness {
  readonly order: string[];
  readonly values = new Map<string, SharedSecretEnvelope>();
  generatedCredentials = 0;
  failBoundWrite = false;

  constructor(order: string[]) {
    this.order = order;
  }

  generateCredential(): string {
    this.generatedCredentials += 1;
    return "credential-a";
  }

  generateJoinRequestId(): string {
    return "join-request-a";
  }

  async putEnvelope(key: string, value: SharedSecretEnvelope): Promise<void> {
    this.order.push(`envelope-${value.kind}`);
    if (value.kind === "bound" && this.failBoundWrite) {
      throw new Error("secure-store-unavailable");
    }
    this.values.set(key, value);
  }

  async getEnvelope(key: string): Promise<SharedSecretEnvelope | null> {
    return this.values.get(key) ?? null;
  }

  async removeEnvelope(key: string): Promise<void> {
    this.order.push("envelope-delete");
    this.values.delete(key);
  }
}

interface Harness {
  readonly controller: Phase7Controller;
  readonly store: PendingJoinStoreHarness;
  readonly secrets: JoinSecretHarness;
  readonly requests: Array<{
    readonly sessionId: string;
    readonly joinRequestId: string;
    readonly expectedReleaseId?: `sha256:${string}`;
    readonly invitation: string;
    readonly participantCredential: string;
  }>;
  readonly order: string[];
}

function createHarness(responses: readonly (JoinResponse | Error)[] = [joinResponse()]): Harness {
  const store = new PendingJoinStoreHarness();
  const secrets = new JoinSecretHarness(store.order);
  const requests: Harness["requests"] = [];
  const queue = [...responses];
  const client = {
    join: vi.fn(async (request: Harness["requests"][number]) => {
      store.order.push("send");
      requests.push({ ...request });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error("test-join-response-missing");
      return next;
    }),
  };
  const controller = new SharedJoinCoordinator(
    store as unknown as SharedSyncStore,
    secrets as unknown as ParticipantCredentialStore,
    () => client as unknown as SharedHttpClient,
  ) as unknown as Phase7Controller;
  return { controller, store, secrets, requests, order: store.order };
}

const joinInput = {
  serviceUrl: `${serviceOrigin}/`,
  sessionId: "session-a",
  runId: "run-a",
  expectedReleaseId: releaseA,
  invitation: "invitation-a",
} as const;

function seedRecoverableAttempt(
  harness: Harness,
  status: "preparing" | "ready" | "submitting",
): void {
  const attempt = pending(status);
  harness.store.pending = attempt;
  harness.secrets.values.set(attempt.envelopeKey, {
    kind: "pending",
    sessionId: attempt.sessionId,
    expectedReleaseId: attempt.expectedReleaseId,
    serviceOrigin: attempt.serviceOrigin,
    joinRequestId: attempt.joinRequestId,
    invitation: "invitation-a",
    participantCredential: "credential-a",
  });
}

describe("shared join coordinator recovery", () => {
  it("returns a retryable typed outcome when durable storage is unavailable", async () => {
    const coordinator = new SharedJoinCoordinator(
      {
        sessionForRun: async () => {
          throw new Error("sqlite-unavailable");
        },
      } as unknown as SharedSyncStore,
      {
        getEnvelope: async () => null,
      } as unknown as ParticipantCredentialStore,
    );

    await expect(
      coordinator.recover({ runId: "run-a", expectedReleaseId: releaseA }),
    ).resolves.toEqual({ kind: "blocked", code: "sqlite-unavailable", retryable: true });
  });

  it("reserves one join owner before persisting its recoverable envelope and reduces it after commit", async () => {
    const harness = createHarness();

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    const position = (event: string) => harness.order.indexOf(event);
    expect(position("reserve")).toBeGreaterThanOrEqual(0);
    expect(position("reserve")).toBeLessThan(position("envelope-pending"));
    expect(position("envelope-pending")).toBeLessThan(position("ready"));
    expect(position("ready")).toBeLessThan(position("submitting"));
    expect(position("submitting")).toBeLessThan(position("send"));
    expect(position("send")).toBeLessThan(position("binding-commit"));
    expect(position("binding-commit")).toBeLessThan(position("envelope-bound"));
    expect(harness.requests).toEqual([
      {
        sessionId: "session-a",
        joinRequestId: "join-request-a",
        expectedReleaseId: releaseA,
        invitation: "invitation-a",
        participantCredential: "credential-a",
      },
    ]);
    expect(harness.store.pending).toBeNull();
    expect(harness.store.bound).toBe(true);
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toEqual({
      kind: "bound",
      participantCredential: "credential-a",
    });
  });

  it("keeps a committed join successful when bound-envelope reduction must resume", async () => {
    const harness = createHarness();
    harness.secrets.failBoundWrite = true;

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    expect(harness.store.bound).toBe(true);
    expect(harness.store.pending).toBeNull();
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toMatchObject({
      kind: "pending",
      invitation: "invitation-a",
      participantCredential: "credential-a",
    });
    expect(harness.order).toContain("delivery-interrupted");

    harness.secrets.failBoundWrite = false;
    await expect(
      harness.controller.recover({ runId: "run-a", expectedReleaseId: releaseA }),
    ).resolves.toEqual({ kind: "bound", sessionId: "session-a" });
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toEqual({
      kind: "bound",
      participantCredential: "credential-a",
    });
  });

  it("cancels a crashed preparing reservation with no envelope and starts a fresh attempt", async () => {
    const harness = createHarness();
    harness.store.pending = pending("preparing");

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    expect(harness.order).toContain("cancel-preparing");
    expect(harness.secrets.generatedCredentials).toBe(1);
    expect(harness.store.bound).toBe(true);
  });

  it("advances a preparing reservation with its exact envelope without replacing identity", async () => {
    const harness = createHarness();
    seedRecoverableAttempt(harness, "preparing");

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    expect(harness.secrets.generatedCredentials).toBe(0);
    expect(harness.order).not.toContain("cancel-preparing");
    expect(harness.requests[0]).toMatchObject({
      joinRequestId: "join-request-a",
      participantCredential: "credential-a",
    });
  });

  it("reconstructs SQLite ownership from a complete orphan envelope", async () => {
    const harness = createHarness();
    const attempt = pending("preparing");
    harness.secrets.values.set(attempt.envelopeKey, {
      kind: "pending",
      sessionId: attempt.sessionId,
      expectedReleaseId: attempt.expectedReleaseId,
      serviceOrigin: attempt.serviceOrigin,
      joinRequestId: attempt.joinRequestId,
      invitation: "invitation-a",
      participantCredential: "credential-a",
    });

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    expect(harness.order.slice(0, 4)).toEqual(["pending-read", "reserve", "ready", "submitting"]);
    expect(harness.secrets.generatedCredentials).toBe(0);
  });

  it("classifies a changed durable credential as non-retryable corruption", async () => {
    const harness = createHarness();
    const attempt = pending("ready");
    harness.store.pending = attempt;
    harness.secrets.values.set(attempt.envelopeKey, {
      kind: "pending",
      sessionId: attempt.sessionId,
      expectedReleaseId: attempt.expectedReleaseId,
      serviceOrigin: attempt.serviceOrigin,
      joinRequestId: attempt.joinRequestId,
      invitation: "invitation-a",
      participantCredential: "credential-changed",
    });

    await expect(
      harness.controller.recover({ runId: "run-a", expectedReleaseId: releaseA }),
    ).resolves.toEqual({
      kind: "blocked",
      code: "shared-pending-join-credential-conflict",
      retryable: false,
    });
    expect(harness.requests).toHaveLength(0);
  });

  it("resumes a complete ready attempt without allocating a new request or secret", async () => {
    const harness = createHarness();
    seedRecoverableAttempt(harness, "ready");

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    expect(harness.secrets.generatedCredentials).toBe(0);
    expect(harness.order).not.toContain("envelope-pending");
    expect(harness.order.indexOf("submitting")).toBeLessThan(harness.order.indexOf("send"));
    expect(harness.requests[0]).toEqual({
      sessionId: "session-a",
      joinRequestId: "join-request-a",
      expectedReleaseId: releaseA,
      invitation: "invitation-a",
      participantCredential: "credential-a",
    });
    expect(harness.store.pending).toBeNull();
  });

  it("retains a submitting attempt across response loss and retries the exact request after restart", async () => {
    const duplicate = joinResponse({ disposition: "duplicate" });
    const harness = createHarness([new Error("response-lost"), duplicate]);
    seedRecoverableAttempt(harness, "submitting");

    await expect(harness.controller.join(joinInput)).rejects.toThrow("response-lost");
    expect(harness.store.pending).toEqual(pending("submitting"));
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toMatchObject({
      kind: "pending",
      invitation: "invitation-a",
      participantCredential: "credential-a",
    });

    await expect(harness.controller.join(joinInput)).resolves.toEqual(duplicate.sync);
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1]).toEqual(harness.requests[0]);
    expect(harness.store.pending).toBeNull();
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toEqual({
      kind: "bound",
      participantCredential: "credential-a",
    });
  });

  it("retains the complete attempt when binding commit is interrupted and reduces only after retry", async () => {
    const harness = createHarness([joinResponse(), joinResponse({ disposition: "duplicate" })]);
    seedRecoverableAttempt(harness, "submitting");
    harness.store.commitError = new Error("sqlite-interrupted-before-commit");

    await expect(harness.controller.join(joinInput)).rejects.toThrow(
      "sqlite-interrupted-before-commit",
    );
    expect(harness.store.pending).toEqual(pending("submitting"));
    expect(harness.store.bound).toBe(false);
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toMatchObject({
      kind: "pending",
    });

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());
    expect(harness.store.pending).toBeNull();
    expect(harness.store.bound).toBe(true);
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toMatchObject({
      kind: "bound",
    });
    expect(harness.order.lastIndexOf("binding-commit")).toBeLessThan(
      harness.order.lastIndexOf("envelope-bound"),
    );
  });

  it("retains the pending envelope when a response mismatches the pinned release", async () => {
    const mismatch = joinResponse({ releaseId: releaseB, sync: pull({ releaseId: releaseB }) });
    const harness = createHarness([mismatch]);
    seedRecoverableAttempt(harness, "submitting");

    await expect(harness.controller.join(joinInput)).rejects.toThrow(
      "shared-session-binding-conflict",
    );
    expect(harness.store.pending).toEqual(pending("submitting"));
    expect(harness.store.bound).toBe(false);
    expect(harness.secrets.values.get(pending("submitting").envelopeKey)).toMatchObject({
      kind: "pending",
      invitation: "invitation-a",
      participantCredential: "credential-a",
    });
  });
});
