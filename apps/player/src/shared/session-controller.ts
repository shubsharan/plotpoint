import type { SyncPull } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "./credentials";
import { SharedSyncStore } from "./database";
import { SharedHttpClient } from "./http-client";

export class SharedSessionController {
  constructor(
    private readonly store: SharedSyncStore,
    private readonly credentials: ParticipantCredentialStore,
    private readonly clientFactory: (url: string) => SharedHttpClient = (url) =>
      new SharedHttpClient(url),
  ) {}

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
