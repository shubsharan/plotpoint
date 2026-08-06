import type { SyncCommand, SyncPull } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
import { SharedSyncStore, type SharedSessionBinding } from "./database";
import { SharedHttpClient, SharedHttpError } from "./http-client";

export type SharedSyncTrigger = "startup" | "enqueue" | "foreground" | "reconnect" | "retry";

interface SessionDrain {
  claimComplete: boolean;
  trailingRequested: boolean;
  phase: "running" | "settling";
  promise: Promise<void>;
}

export class SharedSyncCoordinator {
  private readonly sessionDrains = new Map<string, SessionDrain>();

  constructor(
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly clientFactory: (serviceUrl: string) => SharedHttpClient = (url) =>
      new SharedHttpClient(url),
  ) {}

  request(sessionId: string, trigger: SharedSyncTrigger): Promise<void> {
    if (
      !sessionId ||
      !["startup", "enqueue", "foreground", "reconnect", "retry"].includes(trigger)
    ) {
      return Promise.reject(new Error("shared-sync-request-invalid"));
    }
    const existing = this.sessionDrains.get(sessionId);
    if (existing !== undefined && existing.phase === "running") {
      if (existing.claimComplete) existing.trailingRequested = true;
      return existing.promise;
    }

    const state: SessionDrain = {
      claimComplete: false,
      trailingRequested: false,
      phase: "running",
      promise: Promise.resolve(),
    };
    const drain = Promise.resolve().then(() => this.drainSession(sessionId, state));
    state.promise = drain.finally(() => {
      if (this.sessionDrains.get(sessionId) === state) this.sessionDrains.delete(sessionId);
    });
    this.sessionDrains.set(sessionId, state);
    return state.promise;
  }

  private async drainSession(sessionId: string, state: SessionDrain): Promise<void> {
    while (true) {
      state.claimComplete = false;
      const disposition = await this.runPass(sessionId, () => {
        state.claimComplete = true;
      });
      if (disposition === "revoked") {
        state.phase = "settling";
        return;
      }
      if (!state.trailingRequested) {
        state.phase = "settling";
        return;
      }
      state.trailingRequested = false;
    }
  }

  private async runPass(
    sessionId: string,
    onClaimComplete: () => void,
  ): Promise<"current" | "revoked"> {
    const session = await this.store.session(sessionId);
    if (session === null) throw new Error("shared-session-missing");
    if (session.membershipStatus === "revoked") {
      await this.credentials.removeEnvelope(session.envelopeKey);
      return "revoked";
    }
    const envelope = await this.credentials.getEnvelope(session.envelopeKey);
    if (envelope?.kind !== "bound") throw new Error("shared-bound-envelope-missing");
    const credential = envelope.participantCredential;
    const client = this.clientFactory(session.serviceOrigin);
    const binding: SharedSessionBinding = {
      sessionId: session.sessionId,
      runId: session.runId,
      releaseId: session.releaseId,
      participantId: session.participantId,
      teamId: session.teamId,
      serviceOrigin: session.serviceOrigin,
      envelopeKey: session.envelopeKey,
    };
    let batchClaimed = false;
    let networkFailure: "submit-failed" | "pull-failed" | undefined;
    try {
      onClaimComplete();
      const batch = await this.store.beginSubmissionBatch(sessionId);
      batchClaimed = true;
      if (batch.sessionId !== sessionId)
        throw new Error("shared-submission-batch-session-mismatch");
      await this.store.recordSyncEvidence(sessionId, {
        phase: "connecting",
        disposition: "scheduled",
      });
      if (batch.commands.length > 0) {
        await this.store.recordSyncEvidence(sessionId, {
          phase: "submitting",
          disposition: "batch-claimed",
        });
      }
      for (const command of batch.commands) {
        const observations = await this.store.observations(session.runId, command.observationIds);
        const request: SyncCommand = {
          commandId: command.commandId,
          target: command.target,
          expectedStateVersion: command.expectedStateVersion,
          type: command.commandType,
          payload: command.payload,
          observations,
        };
        try {
          await client.submit(sessionId, credential, request);
        } catch (error) {
          networkFailure = "submit-failed";
          throw error;
        }
        await this.store.recordSyncEvidence(sessionId, {
          phase: "submitting",
          disposition: "submit-succeeded",
          commandId: command.commandId,
        });
      }
      await this.store.recordSyncEvidence(sessionId, {
        phase: "pulling",
        disposition: "scheduled",
      });
      let pull: SyncPull;
      try {
        pull = await client.pull(sessionId, credential, session.cursor);
      } catch (error) {
        networkFailure = "pull-failed";
        throw error;
      }
      await this.store.applyPull(binding, pull);
      if (pull.snapshot.membershipStatus === "revoked") {
        await this.credentials.removeEnvelope(session.envelopeKey);
        return "revoked";
      }
      return "current";
    } catch (error) {
      if (error instanceof SharedHttpError && error.code === "participant-revoked") {
        await this.store.markRevoked(sessionId);
        await this.credentials.removeEnvelope(session.envelopeKey);
        return "revoked";
      }
      if (batchClaimed) {
        if (networkFailure === undefined) await this.store.recoverSubmissionBatch(sessionId);
        else await this.store.failSubmissionBatch(sessionId, networkFailure);
      }
      throw error;
    }
  }
}
