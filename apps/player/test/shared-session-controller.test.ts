import { computeReleaseId, type SyncPull } from "@plotpoint/protocol";
import { describe, expect, it, vi } from "vitest";

import type { ParticipantCredentialStore, SharedSecretEnvelope } from "../src/shared/credentials";
import type { SharedSyncStore } from "../src/shared/database";
import type { SharedHttpClient } from "../src/shared/http-client";
import { SharedSessionController } from "../src/shared/session-controller";

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

interface BindingContext {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
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
  commitError: Error | null = null;
  readonly order: string[] = [];

  async recordSyncEvent(
    _sessionId: string,
    _elapsedMs: number,
    phase: string,
    disposition: string,
  ): Promise<void> {
    this.order.push(`${phase}-${disposition}`);
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

  async commitJoinedSession(input: {
    readonly context: BindingContext;
    readonly response: Omit<JoinResponse, "disposition" | "sync">;
    readonly pull: SyncPull;
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
      input.context.sessionId !== attempt.sessionId ||
      input.context.runId !== attempt.runId ||
      input.context.expectedReleaseId !== attempt.expectedReleaseId ||
      input.context.serviceOrigin !== attempt.serviceOrigin ||
      input.context.envelopeKey !== attempt.envelopeKey ||
      input.response.releaseId !== attempt.expectedReleaseId ||
      input.pull.snapshot.sessionId !== attempt.sessionId ||
      input.pull.snapshot.releaseId !== input.response.releaseId ||
      input.pull.snapshot.participantId !== input.response.participantId ||
      input.pull.snapshot.teamId !== input.response.teamId
    ) {
      throw new Error("shared-session-binding-conflict");
    }
    this.bound = true;
    this.pending = null;
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
  const scheduler = { request: vi.fn(async () => undefined) };
  const controller = new SharedSessionController(
    store as unknown as SharedSyncStore,
    secrets as unknown as ParticipantCredentialStore,
    scheduler,
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

function seedRecoverableAttempt(harness: Harness, status: "ready" | "submitting"): void {
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

describe("shared session controller recovery", () => {
  it("persists one recoverable envelope before reservation and reduces it after commit", async () => {
    const harness = createHarness();

    await expect(harness.controller.join(joinInput)).resolves.toEqual(pull());

    const position = (event: string) => harness.order.indexOf(event);
    expect(position("reserve")).toBeGreaterThanOrEqual(0);
    expect(position("envelope-pending")).toBeLessThan(position("reserve"));
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
    expect(harness.order).toContain("recovery-envelope-reduction-failed");
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
