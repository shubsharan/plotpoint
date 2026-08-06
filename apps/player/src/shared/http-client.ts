import {
  isSyncCommandResult,
  isSyncPull,
  type SyncCommandResult,
  type SyncCommand,
  type SyncPull,
} from "@plotpoint/protocol";

export class SharedHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export interface JoinResult {
  readonly participantId: string;
  readonly teamId: string;
  readonly releaseId: `sha256:${string}`;
  readonly disposition: "joined" | "duplicate";
  readonly sync: SyncPull;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetcher: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const value: unknown = await response.json();
    if (!response.ok) {
      const code =
        object(value) && typeof value.code === "string" ? value.code : "shared-http-failed";
      throw new SharedHttpError(code, response.status);
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

export class SharedHttpClient {
  private readonly baseUrl: string;

  constructor(
    serviceUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {
    this.baseUrl = serviceUrl.replace(/\/$/, "");
  }

  async join(input: {
    readonly sessionId: string;
    readonly joinRequestId: string;
    readonly invitation: string;
    readonly participantCredential: string;
  }): Promise<JoinResult> {
    const value = await requestJson(
      `${this.baseUrl}/v1/shared-sessions/${encodeURIComponent(input.sessionId)}/participants`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          joinRequestId: input.joinRequestId,
          invitation: input.invitation,
          participantCredential: input.participantCredential,
        }),
      },
      this.timeoutMs,
      this.fetcher,
    );
    if (
      !object(value) ||
      Object.keys(value).some(
        (key) => !["participantId", "teamId", "releaseId", "disposition", "sync"].includes(key),
      ) ||
      typeof value.participantId !== "string" ||
      typeof value.teamId !== "string" ||
      typeof value.releaseId !== "string" ||
      !["joined", "duplicate"].includes(value.disposition as string) ||
      !isSyncPull(value.sync)
    )
      throw new Error("shared-join-response-invalid");
    return value as unknown as JoinResult;
  }

  async submit(
    sessionId: string,
    credential: string,
    command: SyncCommand,
  ): Promise<SyncCommandResult> {
    const value = await requestJson(
      `${this.baseUrl}/v1/shared-sessions/${encodeURIComponent(sessionId)}/commands`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${credential}` },
        body: JSON.stringify(command),
      },
      this.timeoutMs,
      this.fetcher,
    );
    if (!isSyncCommandResult(value)) throw new Error("shared-command-response-invalid");
    return value;
  }

  async pull(sessionId: string, credential: string, cursor: string): Promise<SyncPull> {
    const value = await requestJson(
      `${this.baseUrl}/v1/shared-sessions/${encodeURIComponent(sessionId)}/sync?after=${encodeURIComponent(cursor)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${credential}` },
      },
      this.timeoutMs,
      this.fetcher,
    );
    if (!isSyncPull(value)) throw new Error("shared-pull-response-invalid");
    return value;
  }
}
