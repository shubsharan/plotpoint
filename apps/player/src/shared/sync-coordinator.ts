import { CONTRACT_VERSIONS, type SyncCommand } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
import { SharedSyncStore } from "./database";
import { SharedHttpClient, SharedHttpError } from "./http-client";

export class SharedSyncCoordinator {
  constructor(
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly clientFactory: (serviceUrl: string) => SharedHttpClient = (url) =>
      new SharedHttpClient(url),
  ) {}

  async synchronize(sessionId: string): Promise<void> {
    const session = await this.store.session(sessionId);
    if (session === null) throw new Error("shared-session-missing");
    if (session.membershipStatus === "revoked") return;
    const credential = await this.credentials.get(sessionId);
    if (credential === null) throw new Error("shared-credential-missing");
    const client = this.clientFactory(session.serviceUrl);
    try {
      await this.store.recordSyncEvent(sessionId, 0, "connecting", "started");
      while (true) {
        const command = await this.store.nextQueued(sessionId);
        if (command === null) break;
        const observations = await this.store.observations(session.runId, command.observationIds);
        const request: SyncCommand = {
          version: CONTRACT_VERSIONS.sharedSync,
          commandId: command.commandId,
          target: command.target,
          expectedStateVersion: command.expectedStateVersion,
          type: command.type,
          payload: command.payload,
          observations,
        };
        await this.store.recordSyncEvent(sessionId, 0, "submitting", "started", command.commandId);
        await client.submit(sessionId, credential, request);
      }
      await this.store.recordSyncEvent(sessionId, 0, "pulling", "started");
      await this.store.applyPull(
        sessionId,
        await client.pull(sessionId, credential, session.cursor),
      );
      await this.store.recordSyncEvent(sessionId, 0, "current", "snapshot-replaced");
    } catch (error) {
      if (error instanceof SharedHttpError && error.code === "participant-revoked") {
        await this.store.markRevoked(sessionId);
        await this.credentials.remove(sessionId);
        await this.store.recordSyncEvent(sessionId, 0, "revoked", "participant-revoked");
        return;
      }
      await this.store.recordSyncEvent(sessionId, 0, "degraded", "transport-failed");
      throw error;
    }
  }
}
