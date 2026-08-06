import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { isSyncCommand, type SyncCommand } from "@plotpoint/protocol";

import { SharedSessionService, SharedSessionServiceError } from "./shared-session-service.js";

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
    if (length > limit) throw new SharedSessionServiceError("request-too-large", 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new SharedSessionServiceError("media-type-invalid", 415);
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(await body(request, JSON_LIMIT)));
    if (!object(value)) throw new Error("not-object");
    return value;
  } catch (error) {
    if (error instanceof SharedSessionServiceError) throw error;
    throw new SharedSessionServiceError("json-invalid", 400);
  }
}

function bearer(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function operator(request: IncomingMessage, config: ApiServerConfig): void {
  if (bearer(request) !== config.operatorToken) {
    throw new SharedSessionServiceError("operator-not-authorized", 401);
  }
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function routeId(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new SharedSessionServiceError("route-parameter-invalid", 400);
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.length === 0 || decoded.includes("/")) throw new Error("route-id-invalid");
    return decoded;
  } catch {
    throw new SharedSessionServiceError("route-parameter-invalid", 400);
  }
}

type SharedSessionApi = Pick<
  SharedSessionService,
  "registerRelease" | "createSession" | "createInvitation" | "join" | "revoke" | "submit" | "pull"
>;

export function createApiServer(service: SharedSessionApi, config: ApiServerConfig) {
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      if (request.url === undefined || request.method === undefined) {
        throw new SharedSessionServiceError("request-invalid", 400);
      }
      const url = new URL(request.url, "http://localhost");

      if (request.method === "POST" && url.pathname === "/v1/releases") {
        operator(request, config);
        if (request.headers["content-type"] !== "application/vnd.plotpoint.release") {
          throw new SharedSessionServiceError("media-type-invalid", 415);
        }
        const expected = request.headers["x-plotpoint-expected-release-id"];
        if (typeof expected !== "string") {
          throw new SharedSessionServiceError("expected-release-id-invalid", 400);
        }
        send(
          response,
          200,
          await service.registerRelease(await body(request, RELEASE_LIMIT), expected),
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/shared-sessions") {
        operator(request, config);
        const value = await json(request);
        if (
          !exact(value, ["creationId", "releaseId", "teamLabel"]) ||
          typeof value.creationId !== "string" ||
          typeof value.releaseId !== "string" ||
          typeof value.teamLabel !== "string"
        ) {
          throw new SharedSessionServiceError("session-request-invalid", 400);
        }
        send(
          response,
          200,
          await service.createSession({
            creationId: value.creationId,
            releaseId: value.releaseId,
            teamLabel: value.teamLabel,
          }),
        );
        return;
      }

      const invitation = url.pathname.match(/^\/v1\/shared-sessions\/([^/]+)\/invitations$/);
      if (request.method === "POST" && invitation !== null) {
        operator(request, config);
        const value = await json(request);
        if (
          !exact(value, ["invitationId", "expiresAt"]) ||
          typeof value.invitationId !== "string" ||
          typeof value.expiresAt !== "string"
        ) {
          throw new SharedSessionServiceError("invitation-request-invalid", 400);
        }
        send(
          response,
          200,
          await service.createInvitation(
            routeId(invitation[1]),
            value.invitationId,
            value.expiresAt,
          ),
        );
        return;
      }

      const participants = url.pathname.match(/^\/v1\/shared-sessions\/([^/]+)\/participants$/);
      if (request.method === "POST" && participants !== null) {
        const value = await json(request);
        if (
          !exact(value, ["joinRequestId", "invitation", "participantCredential"]) ||
          typeof value.joinRequestId !== "string" ||
          typeof value.invitation !== "string" ||
          typeof value.participantCredential !== "string"
        ) {
          throw new SharedSessionServiceError("join-request-invalid", 400);
        }
        send(
          response,
          200,
          await service.join(routeId(participants[1]), {
            joinRequestId: value.joinRequestId,
            invitation: value.invitation,
            participantCredential: value.participantCredential,
          }),
        );
        return;
      }

      const revoke = url.pathname.match(
        /^\/v1\/shared-sessions\/([^/]+)\/participants\/([^/]+)\/revoke$/,
      );
      if (request.method === "POST" && revoke !== null) {
        operator(request, config);
        const value = await json(request);
        if (!exact(value, ["operationId"]) || typeof value.operationId !== "string") {
          throw new SharedSessionServiceError("revoke-request-invalid", 400);
        }
        await service.revoke(routeId(revoke[1]), routeId(revoke[2]), value.operationId);
        send(response, 200, { disposition: "revoked" });
        return;
      }

      const commands = url.pathname.match(/^\/v1\/shared-sessions\/([^/]+)\/commands$/);
      if (request.method === "POST" && commands !== null) {
        const credential = bearer(request);
        if (credential === null) {
          throw new SharedSessionServiceError("participant-not-authorized", 401);
        }
        const value = await json(request);
        if (!isSyncCommand(value)) {
          throw new SharedSessionServiceError("command-invalid", 400);
        }
        const command: SyncCommand = value;
        send(response, 200, await service.submit(routeId(commands[1]), credential, command));
        return;
      }

      const sync = url.pathname.match(/^\/v1\/shared-sessions\/([^/]+)\/sync$/);
      if (request.method === "GET" && sync !== null) {
        const credential = bearer(request);
        if (credential === null) {
          throw new SharedSessionServiceError("participant-not-authorized", 401);
        }
        send(
          response,
          200,
          await service.pull(
            routeId(sync[1]),
            credential,
            url.searchParams.get("after") ?? undefined,
          ),
        );
        return;
      }

      throw new SharedSessionServiceError("route-not-found", 404);
    } catch (error) {
      if (error instanceof SharedSessionServiceError) {
        send(response, error.status, { code: error.code, requestId });
        return;
      }
      send(response, 500, { code: "internal-error", requestId });
    }
  });
}
