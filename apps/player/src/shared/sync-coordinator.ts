import type { SyncCommand } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
import { SharedSyncStore } from "./database";
import { SharedHttpClient, SharedHttpError } from "./http-client";

export type SharedSyncTrigger = "enqueue" | "foreground" | "reconnect" | "retry";

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
    if (!sessionId || !["enqueue", "foreground", "reconnect", "retry"].includes(trigger)) {
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
    if (session.membershipStatus === "revoked") return "revoked";
    const credential = await this.credentials.get(sessionId);
    if (credential === null) throw new Error("shared-credential-missing");
    const client = this.clientFactory(session.serviceUrl);
    let batchClaimed = false;
    try {
      const batch = await this.store.beginSubmissionBatch(sessionId);
      batchClaimed = true;
      onClaimComplete();
      if (batch.sessionId !== sessionId)
        throw new Error("shared-submission-batch-session-mismatch");
      await this.store.recordSyncEvent(sessionId, 0, "connecting", "started");
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
        await this.store.recordSyncEvent(sessionId, 0, "submitting", "started", command.commandId);
        await client.submit(sessionId, credential, request);
      }
      await this.store.recordSyncEvent(sessionId, 0, "pulling", "started");
      const pull = await client.pull(sessionId, credential, session.cursor);
      await this.store.applyPull(sessionId, pull);
      if (pull.snapshot.membershipStatus === "revoked") {
        await this.credentials.remove(sessionId);
        await this.store.recordSyncEvent(sessionId, 0, "revoked", "snapshot-replaced");
        return "revoked";
      }
      await this.store.recordSyncEvent(sessionId, 0, "current", "snapshot-replaced");
      return "current";
    } catch (error) {
      if (error instanceof SharedHttpError && error.code === "participant-revoked") {
        await this.store.markRevoked(sessionId);
        await this.credentials.remove(sessionId);
        await this.store.recordSyncEvent(sessionId, 0, "revoked", "participant-revoked");
        return "revoked";
      }
      if (batchClaimed) await this.store.failSubmissionBatch(sessionId);
      await this.store.recordSyncEvent(sessionId, 0, "degraded", "transport-failed");
      throw error;
    }
  }
}
