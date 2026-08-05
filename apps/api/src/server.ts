import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { CONTRACT_VERSIONS, type SyncCommand } from "@plotpoint/protocol";
import { HuntService, HuntServiceError } from "./hunt-service.js";

const JSON_LIMIT = 256 * 1024;
const RELEASE_LIMIT = 64 * 1024 * 1024;

export interface ApiServerConfig {
  readonly operatorToken: string;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.byteLength;
    if (length > limit) throw new HuntServiceError("request-too-large", 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new HuntServiceError("media-type-invalid", 415);
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(await body(request, JSON_LIMIT)));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("not-object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HuntServiceError) throw error;
    throw new HuntServiceError("json-invalid", 400);
  }
}

function bearer(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function operator(request: IncomingMessage, config: ApiServerConfig): void {
  if (bearer(request) !== config.operatorToken)
    throw new HuntServiceError("operator-not-authorized", 401);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

type HuntApi = Pick<
  HuntService,
  "registerRelease" | "createSession" | "createInvitation" | "join" | "revoke" | "submit" | "pull"
>;

export function createApiServer(service: HuntApi, config: ApiServerConfig) {
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      if (request.url === undefined || request.method === undefined)
        throw new HuntServiceError("request-invalid", 400);
      const url = new URL(request.url, "http://localhost");
      if (request.method === "POST" && url.pathname === "/releases") {
        operator(request, config);
        if (request.headers["content-type"] !== "application/vnd.plotpoint.release")
          throw new HuntServiceError("media-type-invalid", 415);
        const expected = request.headers["x-plotpoint-expected-release-id"];
        if (typeof expected !== "string")
          throw new HuntServiceError("expected-release-id-invalid", 400);
        send(response, 200, {
          version: CONTRACT_VERSIONS.sharedApi,
          ...(await service.registerRelease(await body(request, RELEASE_LIMIT), expected)),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/hunt-sessions") {
        operator(request, config);
        const value = await json(request);
        if (
          !exact(value, ["version", "creationId", "releaseId", "teamLabel"]) ||
          value.version !== CONTRACT_VERSIONS.sharedApi ||
          typeof value.creationId !== "string" ||
          typeof value.releaseId !== "string" ||
          typeof value.teamLabel !== "string"
        )
          throw new HuntServiceError("session-request-invalid", 400);
        send(response, 200, {
          version: CONTRACT_VERSIONS.sharedApi,
          releaseId: value.releaseId,
          ...(await service.createSession({
            creationId: value.creationId,
            releaseId: value.releaseId,
            teamLabel: value.teamLabel,
          })),
        });
        return;
      }
      const invitation = url.pathname.match(/^\/hunt-sessions\/([^/]+)\/invitations$/);
      if (request.method === "POST" && invitation !== null) {
        operator(request, config);
        const value = await json(request);
        if (
          !exact(value, ["version", "invitationId", "expiresAt"]) ||
          value.version !== CONTRACT_VERSIONS.sharedApi ||
          typeof value.invitationId !== "string" ||
          typeof value.expiresAt !== "string"
        )
          throw new HuntServiceError("invitation-request-invalid", 400);
        send(response, 200, {
          version: CONTRACT_VERSIONS.sharedApi,
          ...(await service.createInvitation(
            decodeURIComponent(invitation[1] ?? ""),
            value.invitationId,
            value.expiresAt,
          )),
        });
        return;
      }
      const participants = url.pathname.match(/^\/hunt-sessions\/([^/]+)\/participants$/);
      if (request.method === "POST" && participants !== null) {
        const value = await json(request);
        if (
          !exact(value, ["version", "joinRequestId", "invitation", "participantCredential"]) ||
          value.version !== CONTRACT_VERSIONS.sharedApi ||
          typeof value.joinRequestId !== "string" ||
          typeof value.invitation !== "string" ||
          typeof value.participantCredential !== "string"
        )
          throw new HuntServiceError("join-request-invalid", 400);
        send(response, 200, {
          version: CONTRACT_VERSIONS.sharedApi,
          ...(await service.join(decodeURIComponent(participants[1] ?? ""), {
            joinRequestId: value.joinRequestId,
            invitation: value.invitation,
            participantCredential: value.participantCredential,
          })),
        });
        return;
      }
      const revoke = url.pathname.match(
        /^\/hunt-sessions\/([^/]+)\/participants\/([^/]+)\/revoke$/,
      );
      if (request.method === "POST" && revoke !== null) {
        operator(request, config);
        const value = await json(request);
        if (
          !exact(value, ["version", "operationId"]) ||
          value.version !== CONTRACT_VERSIONS.sharedApi ||
          typeof value.operationId !== "string"
        )
          throw new HuntServiceError("revoke-request-invalid", 400);
        await service.revoke(
          decodeURIComponent(revoke[1] ?? ""),
          decodeURIComponent(revoke[2] ?? ""),
          value.operationId,
        );
        send(response, 200, { version: CONTRACT_VERSIONS.sharedApi, disposition: "revoked" });
        return;
      }
      const commands = url.pathname.match(/^\/hunt-sessions\/([^/]+)\/commands$/);
      if (request.method === "POST" && commands !== null) {
        const credential = bearer(request);
        if (credential === null) throw new HuntServiceError("participant-not-authorized", 401);
        send(
          response,
          200,
          await service.submit(
            decodeURIComponent(commands[1] ?? ""),
            credential,
            (await json(request)) as unknown as SyncCommand,
          ),
        );
        return;
      }
      const sync = url.pathname.match(/^\/hunt-sessions\/([^/]+)\/sync$/);
      if (request.method === "GET" && sync !== null) {
        const credential = bearer(request);
        if (credential === null) throw new HuntServiceError("participant-not-authorized", 401);
        send(
          response,
          200,
          await service.pull(
            decodeURIComponent(sync[1] ?? ""),
            credential,
            url.searchParams.get("after") ?? undefined,
          ),
        );
        return;
      }
      throw new HuntServiceError("route-not-found", 404);
    } catch (error) {
      if (error instanceof HuntServiceError) {
        send(response, error.status, {
          version: CONTRACT_VERSIONS.sharedApi,
          code: error.code,
          requestId,
        });
        return;
      }
      send(response, 500, {
        version: CONTRACT_VERSIONS.sharedApi,
        code: "internal-error",
        requestId,
      });
    }
  });
}
