import { computeReleaseId, isReleaseId, type SyncPull } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
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

function secureStoreKey(runId: string, kind: "credential" | "invitation"): string {
  const scope = /^[A-Za-z0-9._-]+$/.test(runId) ? runId : digest(runId).slice("sha256:".length);
  return `plotpoint.shared.${scope}.${kind}`;
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
    let attempt: PendingSharedJoin;
    let credential: string;
    let invitation: string;

    if (existing === null) {
      credential = this.credentials.generateCredential();
      const candidate = pendingInput(
        input,
        serviceOrigin,
        invitationDigest,
        this.credentials.generateJoinRequestId(),
        digest(credential),
        secureStoreKey(input.runId, "invitation"),
        secureStoreKey(input.runId, "credential"),
      );
      attempt = await this.store.reservePendingJoin(candidate);
      await this.credentials.putCredential(attempt.credentialKey, credential);
      await this.credentials.putInvitation(attempt.invitationKey, input.invitation);
      attempt = await this.store.markPendingJoinReady(input.runId, attempt.requestDigest);
      invitation = input.invitation;
    } else {
      attempt = await this.store.reservePendingJoin(
        existingAttemptInput(existing, input, serviceOrigin, invitationDigest),
      );
      const storedCredential = await this.credentials.getCredential(attempt.credentialKey);
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
      const storedInvitation = await this.credentials.getInvitation(attempt.invitationKey);
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
    await this.credentials.removeInvitation(attempt.invitationKey);
    return result.sync;
  }
}
