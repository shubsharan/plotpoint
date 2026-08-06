interface OperatorClientOptions {
  readonly origin: string;
  readonly token: string;
  readonly fetcher?: typeof fetch;
}

export class SharedSessionOperatorClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OperatorClientOptions) {
    this.origin = options.origin.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  private async parse(response: Response): Promise<unknown> {
    const value: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof value === "object" &&
          value !== null &&
          "code" in value &&
          typeof value.code === "string"
          ? value.code
          : "operator-request-failed",
      );
    }
    return value;
  }

  private request(path: string, input: object): Promise<unknown> {
    return this.fetcher(`${this.origin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }).then((response) => this.parse(response));
  }

  async registerRelease(bytes: Uint8Array, expectedReleaseId: string): Promise<unknown> {
    const response = await this.fetcher(`${this.origin}/v1/releases`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/vnd.plotpoint.release",
        "x-plotpoint-expected-release-id": expectedReleaseId,
      },
      body: bytes as BodyInit,
    });
    return this.parse(response);
  }

  createSession(input: {
    readonly creationId: string;
    readonly releaseId: string;
    readonly teamLabel: string;
  }): Promise<unknown> {
    return this.request("/v1/shared-sessions", input);
  }

  createInvitation(
    sessionId: string,
    input: { readonly invitationId: string; readonly expiresAt: string },
  ): Promise<unknown> {
    return this.request(`/v1/shared-sessions/${encodeURIComponent(sessionId)}/invitations`, input);
  }

  revoke(sessionId: string, participantId: string, operationId: string): Promise<unknown> {
    return this.request(
      `/v1/shared-sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/revoke`,
      { operationId },
    );
  }
}
