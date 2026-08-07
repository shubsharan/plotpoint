import {
  computeReleaseId,
  isReleaseId,
  type SharedCommandIntent,
  type SharedCommandStatus,
  type SharedPlayView,
  type SyncPull,
} from "@plotpoint/protocol";

import type { ParticipantCredentialStore, SharedSecretEnvelope } from "./credentials";
import {
  SharedSyncStore,
  type PendingSharedJoin,
  type PendingSharedJoinInput,
  type SharedSessionBinding,
} from "./database";
import { SharedHttpClient, SharedHttpError } from "./http-client";
import type { SharedSyncCoordinator } from "./sync-coordinator";

const textEncoder = new TextEncoder();

function digest(value: unknown): `sha256:${string}` {
  return computeReleaseId(textEncoder.encode(JSON.stringify(value)));
}

function canonicalServiceOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("shared-service-origin-invalid");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("shared-service-origin-invalid");
  }
  return url.origin;
}

function secureStoreKey(runId: string): string {
  const scope = /^[A-Za-z0-9._-]+$/.test(runId) ? runId : digest(runId).slice("sha256:".length);
  return `plotpoint.shared.${scope}.envelope`;
}

function pendingInput(
  input: {
    readonly sessionId: string;
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
  },
  serviceOrigin: string,
  invitationDigest: `sha256:${string}`,
  joinRequestId: string,
  credentialDigest: `sha256:${string}`,
  envelopeKey: string,
): PendingSharedJoinInput {
  const requestDigest = digest({
    credentialDigest,
    envelopeKey,
    expectedReleaseId: input.expectedReleaseId,
    invitationDigest,
    joinRequestId,
    runId: input.runId,
    serviceOrigin,
    sessionId: input.sessionId,
  });
  return {
    sessionId: input.sessionId,
    runId: input.runId,
    expectedReleaseId: input.expectedReleaseId,
    serviceOrigin,
    joinRequestId,
    invitationDigest,
    envelopeKey,
    requestDigest,
  };
}

function existingAttemptInput(
  attempt: PendingSharedJoin,
  input: {
    readonly sessionId: string;
    readonly expectedReleaseId: `sha256:${string}`;
  },
  serviceOrigin: string,
  invitationDigest: `sha256:${string}`,
): PendingSharedJoinInput {
  return {
    sessionId: input.sessionId,
    runId: attempt.runId,
    expectedReleaseId: input.expectedReleaseId,
    serviceOrigin,
    joinRequestId: attempt.joinRequestId,
    invitationDigest,
    envelopeKey: attempt.envelopeKey,
    requestDigest: attempt.requestDigest,
  };
}

export type SharedJoinRecoveryOutcome =
  | { readonly kind: "unbound" }
  | { readonly kind: "bound"; readonly sessionId: string }
  | {
      readonly kind: "blocked";
      readonly code: string;
      readonly retryable: boolean;
      readonly sessionId?: string;
    };

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const NON_RETRYABLE_JOIN_RECOVERY_CODES = new Set([
  "shared-join-input-invalid",
  "shared-join-response-invalid",
  "shared-pending-join-conflict",
  "shared-pending-join-credential-conflict",
  "shared-pending-join-envelope-conflict",
  "shared-pending-join-envelope-missing",
  "shared-pending-join-invitation-conflict",
  "shared-pending-join-invitation-digest-invalid",
  "shared-pending-join-not-submittable",
  "shared-run-binding-conflict",
  "shared-service-origin-invalid",
  "shared-session-binding-conflict",
]);

function retryableJoinRecovery(error: unknown): boolean {
  if (error instanceof SharedHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return !(error instanceof Error && NON_RETRYABLE_JOIN_RECOVERY_CODES.has(error.message));
}

export class SharedJoinCoordinator {
  constructor(
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly clientFactory: (url: string) => SharedHttpClient = (url) =>
      new SharedHttpClient(url),
  ) {}

  async recover(input: {
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
  }): Promise<SharedJoinRecoveryOutcome> {
    try {
      return await this.recoverState(input);
    } catch (error) {
      return {
        kind: "blocked",
        code: errorCode(error, "shared-join-recovery-failed"),
        retryable: retryableJoinRecovery(error),
      };
    }
  }

  private async recoverState(input: {
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
  }): Promise<SharedJoinRecoveryOutcome> {
    const sessionId = await this.store.sessionForRun(input.runId);
    if (sessionId !== null) return this.recoverBinding(sessionId, input);

    const pending = await this.store.pendingJoinForRun(input.runId);
    const envelopeKey = pending?.envelopeKey ?? secureStoreKey(input.runId);
    let envelope: SharedSecretEnvelope | null;
    try {
      envelope = await this.credentials.getEnvelope(envelopeKey);
    } catch (error) {
      return {
        kind: "blocked",
        code: errorCode(error, "shared-pending-join-envelope-invalid"),
        retryable: true,
      };
    }

    if (pending === null && envelope === null) return { kind: "unbound" };
    if (envelope?.kind === "bound") {
      return {
        kind: "blocked",
        code: "shared-binding-missing",
        retryable: false,
      };
    }
    if (envelope?.kind !== "pending") {
      if (pending?.status === "preparing") {
        await this.store.cancelPreparingJoin(input.runId, pending.requestDigest);
        return { kind: "unbound" };
      }
      return {
        kind: "blocked",
        code: "shared-pending-join-envelope-missing",
        retryable: false,
      };
    }
    if (envelope.expectedReleaseId !== input.expectedReleaseId) {
      return {
        kind: "blocked",
        code: "shared-pending-join-envelope-conflict",
        retryable: false,
      };
    }

    try {
      await this.join({
        serviceUrl: envelope.serviceOrigin,
        sessionId: envelope.sessionId,
        runId: input.runId,
        expectedReleaseId: input.expectedReleaseId,
        invitation: envelope.invitation,
      });
    } catch (error) {
      return {
        kind: "blocked",
        code: errorCode(error, "shared-join-recovery-failed"),
        retryable: retryableJoinRecovery(error),
      };
    }
    const bound = await this.store.sessionForRun(input.runId);
    return bound === null
      ? {
          kind: "blocked",
          code: "shared-session-binding-missing",
          retryable: false,
        }
      : { kind: "bound", sessionId: bound };
  }

  private async recoverBinding(
    sessionId: string,
    input: { readonly runId: string; readonly expectedReleaseId: `sha256:${string}` },
  ): Promise<SharedJoinRecoveryOutcome> {
    const session = await this.store.session(sessionId);
    if (session === null) {
      return {
        kind: "blocked",
        sessionId,
        code: "shared-session-binding-missing",
        retryable: false,
      };
    }
    if (session.runId !== input.runId || session.releaseId !== input.expectedReleaseId) {
      return {
        kind: "blocked",
        sessionId,
        code: "shared-session-binding-conflict",
        retryable: false,
      };
    }
    let envelope: SharedSecretEnvelope | null;
    try {
      envelope = await this.credentials.getEnvelope(session.envelopeKey);
    } catch (error) {
      return {
        kind: "blocked",
        sessionId,
        code: errorCode(error, "shared-bound-envelope-unavailable"),
        retryable: true,
      };
    }
    if (envelope === null) {
      return {
        kind: "blocked",
        sessionId,
        code: "shared-bound-envelope-missing",
        retryable: false,
      };
    }
    if (envelope.kind === "pending") {
      if (
        envelope.sessionId !== session.sessionId ||
        envelope.expectedReleaseId !== session.releaseId ||
        envelope.serviceOrigin !== session.serviceOrigin
      ) {
        return {
          kind: "blocked",
          sessionId,
          code: "shared-bound-envelope-conflict",
          retryable: false,
        };
      }
      try {
        await this.credentials.putEnvelope(session.envelopeKey, {
          kind: "bound",
          participantCredential: envelope.participantCredential,
        });
      } catch (error) {
        return {
          kind: "blocked",
          sessionId,
          code: errorCode(error, "shared-bound-envelope-unavailable"),
          retryable: true,
        };
      }
    }
    return { kind: "bound", sessionId };
  }

  async removeCredential(sessionId: string): Promise<void> {
    const session = await this.store.session(sessionId);
    if (session !== null) await this.credentials.removeEnvelope(session.envelopeKey);
  }

  async join(input: {
    readonly serviceUrl: string;
    readonly sessionId: string;
    readonly runId: string;
    readonly expectedReleaseId: `sha256:${string}`;
    readonly invitation: string;
  }): Promise<SyncPull> {
    if (
      input.sessionId.length === 0 ||
      input.runId.length === 0 ||
      input.invitation.length === 0 ||
      !isReleaseId(input.expectedReleaseId)
    ) {
      throw new Error("shared-join-input-invalid");
    }
    const serviceOrigin = canonicalServiceOrigin(input.serviceUrl);
    const invitationDigest = digest(input.invitation);
    let existing = await this.store.pendingJoinForRun(input.runId);
    const orphanKey = secureStoreKey(input.runId);
    const orphan = existing === null ? await this.credentials.getEnvelope(orphanKey) : null;
    const resumed = existing !== null || orphan?.kind === "pending";
    let attempt: PendingSharedJoin;
    let credential: string;
    let invitation: string;

    if (orphan?.kind === "pending") {
      if (
        orphan.sessionId !== input.sessionId ||
        orphan.expectedReleaseId !== input.expectedReleaseId ||
        orphan.serviceOrigin !== serviceOrigin ||
        digest(orphan.invitation) !== invitationDigest
      ) {
        throw new Error("shared-pending-join-envelope-conflict");
      }
      credential = orphan.participantCredential;
      invitation = orphan.invitation;
      attempt = await this.store.reservePendingJoin(
        pendingInput(
          input,
          serviceOrigin,
          invitationDigest,
          orphan.joinRequestId,
          digest(credential),
          orphanKey,
        ),
      );
      attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
    } else if (existing === null) {
      ({ attempt, credential, invitation } = await this.prepareFreshAttempt(
        input,
        serviceOrigin,
        invitationDigest,
      ));
    } else {
      attempt = await this.store.reservePendingJoin(
        existingAttemptInput(existing, input, serviceOrigin, invitationDigest),
      );
      const storedEnvelope = await this.credentials.getEnvelope(attempt.envelopeKey);
      if (storedEnvelope?.kind !== "pending") {
        if (attempt.status !== "preparing") {
          throw new Error("shared-pending-join-envelope-missing");
        }
        await this.store.cancelPreparingJoin(attempt.runId, attempt.requestDigest);
        existing = null;
        ({ attempt, credential, invitation } = await this.prepareFreshAttempt(
          input,
          serviceOrigin,
          invitationDigest,
        ));
      } else {
        if (!isReleaseId(attempt.invitationDigest)) {
          throw new Error("shared-pending-join-invitation-digest-invalid");
        }
        credential = storedEnvelope.participantCredential;
        const exactRequest = pendingInput(
          {
            sessionId: attempt.sessionId,
            runId: attempt.runId,
            expectedReleaseId: attempt.expectedReleaseId,
          },
          attempt.serviceOrigin,
          attempt.invitationDigest,
          attempt.joinRequestId,
          digest(credential),
          attempt.envelopeKey,
        );
        if (exactRequest.requestDigest !== attempt.requestDigest) {
          throw new Error("shared-pending-join-credential-conflict");
        }
        if (digest(storedEnvelope.invitation) !== attempt.invitationDigest) {
          throw new Error("shared-pending-join-invitation-conflict");
        }
        invitation = storedEnvelope.invitation;
        if (attempt.status === "preparing") {
          attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
        }
      }
    }

    return this.submitAttempt(attempt, credential, invitation, existing !== null || resumed);
  }

  private async prepareFreshAttempt(
    input: {
      readonly serviceUrl: string;
      readonly sessionId: string;
      readonly runId: string;
      readonly expectedReleaseId: `sha256:${string}`;
      readonly invitation: string;
    },
    serviceOrigin: string,
    invitationDigest: `sha256:${string}`,
  ): Promise<{ attempt: PendingSharedJoin; credential: string; invitation: string }> {
    const credential = this.credentials.generateCredential();
    const envelopeKey = secureStoreKey(input.runId);
    const joinRequestId = this.credentials.generateJoinRequestId();
    const candidate = pendingInput(
      input,
      serviceOrigin,
      invitationDigest,
      joinRequestId,
      digest(credential),
      envelopeKey,
    );
    const envelope: SharedSecretEnvelope = {
      kind: "pending",
      sessionId: input.sessionId,
      expectedReleaseId: input.expectedReleaseId,
      serviceOrigin,
      joinRequestId,
      invitation: input.invitation,
      participantCredential: credential,
    };
    let attempt = await this.store.reservePendingJoin(candidate);
    try {
      await this.credentials.putEnvelope(envelopeKey, envelope);
    } catch (error) {
      await this.store.cancelPreparingJoin(input.runId, attempt.requestDigest);
      throw error;
    }
    attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
    return { attempt, credential, invitation: input.invitation };
  }

  private async submitAttempt(
    initialAttempt: PendingSharedJoin,
    credential: string,
    invitation: string,
    resumed: boolean,
  ): Promise<SyncPull> {
    let attempt = initialAttempt;
    if (attempt.status === "ready") {
      attempt = await this.store.markPendingJoinSubmitting(attempt.runId, attempt.requestDigest);
    }
    if (attempt.status !== "submitting") throw new Error("shared-pending-join-not-submittable");

    const result = await this.clientFactory(attempt.serviceOrigin).join({
      sessionId: attempt.sessionId,
      joinRequestId: attempt.joinRequestId,
      expectedReleaseId: attempt.expectedReleaseId,
      invitation,
      participantCredential: credential,
    });
    const binding: SharedSessionBinding = {
      sessionId: attempt.sessionId,
      runId: attempt.runId,
      releaseId: result.releaseId,
      participantId: result.participantId,
      teamId: result.teamId,
      serviceOrigin: attempt.serviceOrigin,
      envelopeKey: attempt.envelopeKey,
    };
    await this.store.commitJoinedSession({
      binding,
      pull: result.sync,
      ...(resumed ? { recoveryDisposition: "join-resumed" as const } : {}),
    });
    try {
      await this.credentials.putEnvelope(attempt.envelopeKey, {
        kind: "bound",
        participantCredential: credential,
      });
    } catch (error) {
      try {
        await this.store.recordDiagnosticEvidence(attempt.sessionId, "delivery-interrupted");
      } catch (diagnosticError) {
        console.warn("shared-delivery-diagnostic-failed", diagnosticError);
      }
      console.warn("shared-envelope-reduction-failed", error);
    }
    return result.sync;
  }
}

export type SharedPlayControllerState =
  | { readonly status: "local-only" }
  | { readonly status: "join-required" }
  | { readonly status: "joining" }
  | { readonly status: "synchronizing"; readonly sessionId: string }
  | { readonly status: "bound"; readonly sessionId: string; readonly view: SharedPlayView }
  | { readonly status: "revoked"; readonly sessionId: string }
  | {
      readonly status: "recovery-required";
      readonly code: string;
      readonly retryable: boolean;
      readonly sessionId?: string;
    };

export class SharedPlayController {
  private state: SharedPlayControllerState;
  private readonly listeners = new Set<(state: SharedPlayControllerState) => void>();
  private reachable: boolean | null = null;
  private disposed = false;
  private joinInFlight: { readonly identity: string; readonly promise: Promise<void> } | null =
    null;
  private readonly joinCoordinator: SharedJoinCoordinator;

  constructor(
    private readonly context: {
      readonly runId: string;
      readonly releaseId: `sha256:${string}`;
      readonly sharedRequired: boolean;
    },
    private readonly store: SharedSyncStore,
    credentials: ParticipantCredentialStore,
    private readonly scheduler: Pick<SharedSyncCoordinator, "request">,
    clientFactory?: (url: string) => SharedHttpClient,
  ) {
    this.state = context.sharedRequired ? { status: "join-required" } : { status: "local-only" };
    this.joinCoordinator = new SharedJoinCoordinator(store, credentials, clientFactory);
  }

  snapshot(): SharedPlayControllerState {
    return this.state;
  }

  subscribe(listener: (state: SharedPlayControllerState) => void): () => void {
    if (this.disposed) throw new Error("shared-controller-disposed");
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private publish(state: SharedPlayControllerState): void {
    if (this.disposed) return;
    this.state = Object.freeze(state);
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* Observers cannot break controller authority. */
      }
    }
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error("shared-controller-disposed");
    const recovery = await this.joinCoordinator.recover({
      runId: this.context.runId,
      expectedReleaseId: this.context.releaseId,
    });
    if (recovery.kind === "bound") {
      await this.synchronize(recovery.sessionId, "startup");
    } else if (recovery.kind === "blocked") {
      this.publish({
        status: "recovery-required",
        code: recovery.code,
        retryable: recovery.retryable,
        ...(recovery.sessionId === undefined ? {} : { sessionId: recovery.sessionId }),
      });
    } else {
      this.publish(
        this.context.sharedRequired ? { status: "join-required" } : { status: "local-only" },
      );
    }
  }

  join(input: {
    readonly serviceUrl: string;
    readonly sessionId: string;
    readonly invitation: string;
  }): Promise<void> {
    const identity = JSON.stringify(input);
    if (this.joinInFlight !== null) {
      return this.joinInFlight.identity === identity
        ? this.joinInFlight.promise
        : Promise.reject(new Error("shared-join-in-progress-conflict"));
    }
    const promise = this.performJoin(input).finally(() => {
      if (this.joinInFlight?.promise === promise) this.joinInFlight = null;
    });
    this.joinInFlight = { identity, promise };
    return promise;
  }

  private async performJoin(input: {
    readonly serviceUrl: string;
    readonly sessionId: string;
    readonly invitation: string;
  }): Promise<void> {
    this.publish({ status: "joining" });
    try {
      await this.joinCoordinator.join({
        ...input,
        runId: this.context.runId,
        expectedReleaseId: this.context.releaseId,
      });
      await this.refresh(input.sessionId);
    } catch (error) {
      this.publish({
        status: "recovery-required",
        code: error instanceof Error ? error.message : "shared-join-failed",
        retryable: retryableJoinRecovery(error),
      });
      throw error;
    }
  }

  async enqueue(command: SharedCommandIntent): Promise<SharedCommandStatus> {
    if (this.state.status !== "bound")
      throw new Error(
        this.state.status === "revoked"
          ? "shared-membership-revoked"
          : "shared-session-unavailable",
      );
    const result = await this.store.enqueue(
      this.state.sessionId,
      command,
      new Date().toISOString(),
    );
    if (result.terminal === "pending") void this.synchronize(this.state.sessionId, "enqueue");
    return result;
  }

  foreground(): Promise<void> {
    return this.requestCurrent("foreground");
  }
  async retry(): Promise<void> {
    if (this.state.status === "recovery-required") {
      if (!this.state.retryable) return;
      if (this.state.sessionId === undefined) {
        await this.start();
        return;
      }
    }
    return this.requestCurrent("retry");
  }

  async connectivityChanged(reachable: boolean): Promise<void> {
    const prior = this.reachable;
    this.reachable = reachable;
    if (prior === false && reachable) await this.requestCurrent("reconnect");
  }

  private async requestCurrent(trigger: "foreground" | "reconnect" | "retry"): Promise<void> {
    if (
      this.state.status !== "bound" &&
      this.state.status !== "synchronizing" &&
      this.state.status !== "recovery-required"
    )
      return;
    const sessionId =
      "sessionId" in this.state
        ? this.state.sessionId
        : await this.store.sessionForRun(this.context.runId);
    if (sessionId !== null && sessionId !== undefined) await this.synchronize(sessionId, trigger);
  }

  private async synchronize(
    sessionId: string,
    trigger: "startup" | "enqueue" | "foreground" | "reconnect" | "retry",
  ): Promise<void> {
    this.publish({ status: "synchronizing", sessionId });
    try {
      await this.scheduler.request(sessionId, trigger);
      await this.refresh(sessionId);
    } catch (error) {
      this.publish({
        status: "recovery-required",
        sessionId,
        code: error instanceof Error ? error.message : "shared-synchronization-failed",
        retryable: true,
      });
    }
  }

  private async refresh(sessionId: string): Promise<void> {
    const view = await this.store.view(sessionId);
    if (view.membership.status === "revoked") {
      await this.joinCoordinator.removeCredential(sessionId);
      this.publish({ status: "revoked", sessionId });
    } else if (view.synchronization === "recovery-required") {
      this.publish({
        status: "recovery-required",
        sessionId,
        code: "shared-synchronization-recovery-required",
        retryable: true,
      });
    } else this.publish({ status: "bound", sessionId, view });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
