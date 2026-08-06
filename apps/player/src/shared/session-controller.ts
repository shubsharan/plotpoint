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
  type SharedBindingContext,
} from "./database";
import { SharedHttpClient } from "./http-client";
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
  invitationKey: string,
  credentialKey: string,
): PendingSharedJoinInput {
  const requestDigest = digest({
    credentialDigest,
    credentialKey,
    expectedReleaseId: input.expectedReleaseId,
    invitationDigest,
    invitationKey,
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
    invitationKey,
    credentialKey,
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
    invitationKey: attempt.invitationKey,
    credentialKey: attempt.credentialKey,
    requestDigest: attempt.requestDigest,
  };
}

export class SharedSessionController {
  constructor(
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly scheduler: Pick<SharedSyncCoordinator, "request">,
    private readonly clientFactory: (url: string) => SharedHttpClient = (url) =>
      new SharedHttpClient(url),
  ) {}

  foreground(sessionId: string): Promise<void> {
    return this.scheduler.request(sessionId, "foreground");
  }

  reconnect(sessionId: string): Promise<void> {
    return this.scheduler.request(sessionId, "reconnect");
  }

  retry(sessionId: string): Promise<void> {
    return this.scheduler.request(sessionId, "retry");
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
    const existing = await this.store.pendingJoinForRun(input.runId);
    const orphanKey = secureStoreKey(input.runId);
    const orphan = existing === null ? await this.credentials.getEnvelope?.(orphanKey) : null;
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
          orphanKey,
        ),
      );
      attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
    } else if (existing === null) {
      credential = this.credentials.generateCredential();
      const envelopeKey = secureStoreKey(input.runId);
      const joinRequestId = this.credentials.generateJoinRequestId();
      const candidate = pendingInput(
        input,
        serviceOrigin,
        invitationDigest,
        joinRequestId,
        digest(credential),
        envelopeKey,
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
      if (this.credentials.putEnvelope === undefined) {
        await this.credentials.putCredential(candidate.credentialKey, credential);
        await this.credentials.putInvitation(candidate.invitationKey, input.invitation);
      } else await this.credentials.putEnvelope(envelopeKey, envelope);
      try {
        attempt = await this.store.reservePendingJoin(candidate);
      } catch (error) {
        if (this.credentials.removeEnvelope !== undefined)
          await this.credentials.removeEnvelope(envelopeKey);
        else {
          await this.credentials.removeCredential(candidate.credentialKey);
          await this.credentials.removeInvitation(candidate.invitationKey);
        }
        throw error;
      }
      attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
      invitation = input.invitation;
    } else {
      attempt = await this.store.reservePendingJoin(
        existingAttemptInput(existing, input, serviceOrigin, invitationDigest),
      );
      const storedEnvelope = await this.credentials.getEnvelope?.(attempt.credentialKey);
      const storedCredential =
        storedEnvelope?.participantCredential ??
        (await this.credentials.getCredential(attempt.credentialKey));
      if (storedCredential === null) throw new Error("shared-pending-join-credential-missing");
      if (!isReleaseId(attempt.invitationDigest)) {
        throw new Error("shared-pending-join-invitation-digest-invalid");
      }
      credential = storedCredential;
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
        attempt.invitationKey,
        attempt.credentialKey,
      );
      if (exactRequest.requestDigest !== attempt.requestDigest) {
        throw new Error("shared-pending-join-credential-conflict");
      }
      const storedInvitation =
        storedEnvelope?.kind === "pending"
          ? storedEnvelope.invitation
          : await this.credentials.getInvitation(attempt.invitationKey);
      if (storedInvitation === null) {
        if (attempt.status !== "preparing") {
          throw new Error("shared-pending-join-invitation-missing");
        }
        await this.credentials.putInvitation(attempt.invitationKey, input.invitation);
        invitation = input.invitation;
      } else {
        if (digest(storedInvitation) !== attempt.invitationDigest) {
          throw new Error("shared-pending-join-invitation-conflict");
        }
        invitation = storedInvitation;
      }
      if (attempt.status === "preparing") {
        attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
      }
    }

    if (attempt.status === "ready") {
      attempt = await this.store.markPendingJoinSubmitting(input.runId, attempt.requestDigest);
    }
    if (attempt.status !== "submitting") throw new Error("shared-pending-join-not-submittable");

    const result = await this.clientFactory(serviceOrigin).join({
      sessionId: attempt.sessionId,
      joinRequestId: attempt.joinRequestId,
      expectedReleaseId: attempt.expectedReleaseId,
      invitation,
      participantCredential: credential,
    });
    const context: SharedBindingContext = {
      sessionId: attempt.sessionId,
      runId: attempt.runId,
      expectedReleaseId: attempt.expectedReleaseId,
      serviceOrigin: attempt.serviceOrigin,
      credentialKey: attempt.credentialKey,
    };
    await this.store.commitJoinedSession({
      context,
      response: {
        participantId: result.participantId,
        teamId: result.teamId,
        releaseId: result.releaseId,
      },
      pull: result.sync,
    });
    if (this.credentials.putEnvelope === undefined) {
      await this.credentials.removeInvitation(attempt.invitationKey);
    } else {
      try {
        await this.credentials.putEnvelope(attempt.credentialKey, {
          kind: "bound",
          participantCredential: credential,
        });
      } catch {
        // The binding is already committed. Startup can retry this envelope cleanup.
      }
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
  private readonly joins: SharedSessionController;

  constructor(
    private readonly context: {
      readonly runId: string;
      readonly releaseId: `sha256:${string}`;
      readonly sharedRequired: boolean;
    },
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly scheduler: Pick<SharedSyncCoordinator, "request">,
    clientFactory?: (url: string) => SharedHttpClient,
  ) {
    this.state = context.sharedRequired ? { status: "join-required" } : { status: "local-only" };
    this.joins = new SharedSessionController(store, credentials, scheduler, clientFactory);
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
    const sessionId = await this.store.sessionForRun(this.context.runId);
    if (sessionId !== null) {
      await this.synchronize(sessionId, "startup");
      return;
    }
    const pending = await this.store.pendingJoinForRun(this.context.runId);
    const envelopeKey = pending?.credentialKey ?? secureStoreKey(this.context.runId);
    const envelope = await this.credentials.getEnvelope?.(envelopeKey);
    if (pending === null && envelope?.kind === "bound") {
      this.publish({
        status: "recovery-required",
        code: "shared-binding-missing",
        retryable: false,
      });
      return;
    }
    if (pending !== null || envelope?.kind === "pending") {
      if (envelope?.kind !== "pending") {
        this.publish({
          status: "recovery-required",
          code: "shared-pending-join-envelope-missing",
          retryable: false,
        });
        return;
      }
      this.publish({ status: "joining" });
      try {
        await this.joins.join({
          serviceUrl: envelope.serviceOrigin,
          sessionId: envelope.sessionId,
          runId: this.context.runId,
          expectedReleaseId: this.context.releaseId,
          invitation: envelope.invitation,
        });
        const bound = await this.store.sessionForRun(this.context.runId);
        if (bound === null) throw new Error("shared-session-binding-missing");
        await this.refresh(bound);
      } catch (error) {
        this.publish({
          status: "recovery-required",
          code: error instanceof Error ? error.message : "shared-join-recovery-failed",
          retryable: true,
        });
      }
      return;
    }
    this.publish(
      this.context.sharedRequired ? { status: "join-required" } : { status: "local-only" },
    );
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
      await this.joins.join({
        ...input,
        runId: this.context.runId,
        expectedReleaseId: this.context.releaseId,
      });
      await this.refresh(input.sessionId);
    } catch (error) {
      this.publish({
        status: "recovery-required",
        code: error instanceof Error ? error.message : "shared-join-failed",
        retryable: true,
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
      const session = await this.store.session(sessionId);
      if (session !== null) await this.credentials.removeCredential(session.credentialKey);
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
