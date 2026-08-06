import type { SyncPull } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
import { SharedSyncStore } from "./database";
import { SharedHttpClient } from "./http-client";
import type { SharedSyncCoordinator } from "./sync-coordinator";

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
    readonly invitation: string;
  }): Promise<SyncPull> {
    const credential =
      (await this.credentials.get(input.sessionId)) ??
      (await this.credentials.create(input.sessionId));
    const joinRequestId = await this.credentials.getOrCreateJoinRequestId(input.sessionId);
    const result = await this.clientFactory(input.serviceUrl).join({
      sessionId: input.sessionId,
      joinRequestId,
      invitation: input.invitation,
      participantCredential: credential,
    });
    await this.store.saveJoinedSession(
      {
        sessionId: input.sessionId,
        runId: input.runId,
        releaseId: result.releaseId,
        participantId: result.participantId,
        teamId: result.teamId,
        serviceUrl: input.serviceUrl,
      },
      result.sync,
    );
    return result.sync;
  }
}
