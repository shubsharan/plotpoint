interface OperatorClientOptions {
  readonly origin: string;
  readonly token: string;
  readonly fetcher?: typeof fetch;
}

export class HuntOperatorClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OperatorClientOptions) {
    this.origin = options.origin.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, body: object): Promise<unknown> {
    const response = await this.fetcher(`${this.origin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        typeof value === "object" &&
          value !== null &&
          "code" in value &&
          typeof value.code === "string"
          ? value.code
          : "operator-request-failed",
      );
    return value;
  }

  async registerRelease(bytes: Uint8Array, expectedReleaseId: string): Promise<unknown> {
    const response = await this.fetcher(`${this.origin}/releases`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/vnd.plotpoint.release",
        "x-plotpoint-expected-release-id": expectedReleaseId,
      },
      body: bytes as BodyInit,
    });
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        typeof value === "object" &&
          value !== null &&
          "code" in value &&
          typeof value.code === "string"
          ? value.code
          : "operator-request-failed",
      );
    return value;
  }

  createSession(input: {
    readonly creationId: string;
    readonly releaseId: string;
    readonly teamLabel: string;
  }): Promise<unknown> {
    return this.request("/hunt-sessions", input);
  }

  createInvitation(
    sessionId: string,
    input: { readonly invitationId: string; readonly expiresAt: string },
  ): Promise<unknown> {
    return this.request(`/hunt-sessions/${encodeURIComponent(sessionId)}/invitations`, input);
  }

  revoke(sessionId: string, participantId: string, operationId: string): Promise<unknown> {
    return this.request(
      `/hunt-sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/revoke`,
      { operationId },
    );
  }
}
