import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../src/server.js";
import { SharedSessionOperatorClient } from "../src/operator-client.js";

const RELEASE_ID = `sha256:${"a".repeat(64)}` as const;
const servers: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function start(service: Parameters<typeof createApiServer>[0]): Promise<string> {
  const server = createApiServer(service, { operatorToken: "operator" });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("address-invalid");
  return `http://127.0.0.1:${address.port}`;
}

function service() {
  return {
    registerRelease: vi.fn().mockResolvedValue({ releaseId: RELEASE_ID, mechanicId: "mechanic" }),
    createSession: vi.fn().mockResolvedValue({
      sessionId: "session-1",
      teamId: "team-1",
      releaseId: RELEASE_ID,
      disposition: "created",
    }),
    createInvitation: vi.fn().mockResolvedValue({
      invitationId: "invitation-1",
      invitation: "invitation-secret",
      expiresAt: "2031-01-01T00:00:00.000Z",
    }),
    join: vi.fn().mockResolvedValue({ participantId: "participant-1" }),
    revoke: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({ commandId: "command-1" }),
    pull: vi.fn().mockResolvedValue({ kind: "snapshot" }),
  };
}

function operatorHeaders(): Record<string, string> {
  return { authorization: "Bearer operator", "content-type": "application/json" };
}

describe("generic shared-session HTTP boundary", () => {
  it("uses /v1 as the sole version boundary and rejects superseded routes/body versions", async () => {
    const fake = service();
    const origin = await start(fake);
    const denied = await fetch(`${origin}/v1/shared-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creationId: "create-1", releaseId: RELEASE_ID, teamLabel: "Team" }),
    });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ code: "operator-not-authorized" });

    const versionedBody = await fetch(`${origin}/v1/shared-sessions`, {
      method: "POST",
      headers: operatorHeaders(),
      body: JSON.stringify({
        version: 1,
        creationId: "create-1",
        releaseId: RELEASE_ID,
        teamLabel: "Team",
      }),
    });
    expect(versionedBody.status).toBe(400);
    expect(await versionedBody.json()).toMatchObject({ code: "session-request-invalid" });
    expect(fake.createSession).not.toHaveBeenCalled();

    for (const path of ["/shared-sessions", "/hunt-sessions", "/v1/hunt-sessions"]) {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: operatorHeaders(),
        body: JSON.stringify({ creationId: "create-1", releaseId: RELEASE_ID, teamLabel: "Team" }),
      });
      expect(response.status).toBe(404);
    }
  });

  it("uses only version-prefixed generic operator paths", async () => {
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ disposition: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new SharedSessionOperatorClient({
      origin: "https://api.example.test/",
      token: "operator",
      fetcher,
    });
    await client.registerRelease(Uint8Array.of(1), RELEASE_ID);
    await client.createSession({
      creationId: "create-1",
      releaseId: RELEASE_ID,
      teamLabel: "Team",
    });
    await client.createInvitation("session-1", {
      invitationId: "invitation-1",
      expiresAt: "2031-01-01T00:00:00.000Z",
    });
    await client.revoke("session-1", "participant-1", "revoke-1");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/releases",
      "https://api.example.test/v1/shared-sessions",
      "https://api.example.test/v1/shared-sessions/session-1/invitations",
      "https://api.example.test/v1/shared-sessions/session-1/participants/participant-1/revoke",
    ]);
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/hunt-sessions|"version"/);
  });

  it("exposes the complete release and shared-session route set", async () => {
    const fake = service();
    const origin = await start(fake);

    const release = await fetch(`${origin}/v1/releases`, {
      method: "POST",
      headers: {
        authorization: "Bearer operator",
        "content-type": "application/vnd.plotpoint.release",
        "x-plotpoint-expected-release-id": RELEASE_ID,
      },
      body: Uint8Array.of(1, 2, 3),
    });
    expect(release.status).toBe(200);

    const created = await fetch(`${origin}/v1/shared-sessions`, {
      method: "POST",
      headers: operatorHeaders(),
      body: JSON.stringify({ creationId: "create-1", releaseId: RELEASE_ID, teamLabel: "Team" }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).not.toHaveProperty("version");

    const invitation = await fetch(`${origin}/v1/shared-sessions/session-1/invitations`, {
      method: "POST",
      headers: operatorHeaders(),
      body: JSON.stringify({
        invitationId: "invitation-1",
        expiresAt: "2031-01-01T00:00:00.000Z",
      }),
    });
    expect(invitation.status).toBe(200);

    const joined = await fetch(`${origin}/v1/shared-sessions/session-1/participants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        joinRequestId: "join-1",
        invitation: "invitation-secret-with-enough-entropy",
        participantCredential: "participant-secret-with-enough-entropy",
      }),
    });
    expect(joined.status).toBe(200);
    expect(fake.join).toHaveBeenCalledWith("session-1", {
      joinRequestId: "join-1",
      invitation: "invitation-secret-with-enough-entropy",
      participantCredential: "participant-secret-with-enough-entropy",
    });

    const revoked = await fetch(
      `${origin}/v1/shared-sessions/session-1/participants/participant-1/revoke`,
      {
        method: "POST",
        headers: operatorHeaders(),
        body: JSON.stringify({ operationId: "revoke-1" }),
      },
    );
    expect(revoked.status).toBe(200);

    const command = {
      commandId: "command-1",
      target: {
        aggregateKind: "team",
        aggregateId: "team-1",
        schemaId: "team-state",
        schemaVersion: 1,
      },
      expectedStateVersion: 0,
      type: "trusted.command",
      payload: {},
      observations: [],
    };
    const submitted = await fetch(`${origin}/v1/shared-sessions/session-1/commands`, {
      method: "POST",
      headers: {
        authorization: "Bearer participant-secret-with-enough-entropy",
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });
    expect(submitted.status).toBe(200);
    expect(fake.submit).toHaveBeenCalledWith(
      "session-1",
      "participant-secret-with-enough-entropy",
      command,
    );

    const pulled = await fetch(`${origin}/v1/shared-sessions/session-1/sync?after=cursor`, {
      headers: { authorization: "Bearer participant-secret-with-enough-entropy" },
    });
    expect(pulled.status).toBe(200);
    expect(fake.pull).toHaveBeenCalledWith(
      "session-1",
      "participant-secret-with-enough-entropy",
      "cursor",
    );
  });

  it("rejects unknown request fields before dispatch and returns stable safe errors", async () => {
    const fake = service();
    const origin = await start(fake);
    const response = await fetch(`${origin}/v1/shared-sessions`, {
      method: "POST",
      headers: operatorHeaders(),
      body: JSON.stringify({
        creationId: "create-1",
        releaseId: RELEASE_ID,
        teamLabel: "Team",
        targetId: "host-leak",
      }),
    });
    const value = await response.json();
    expect(response.status).toBe(400);
    expect(value).toEqual({
      code: "session-request-invalid",
      requestId: expect.any(String),
    });
    expect(JSON.stringify(value)).not.toContain("targetId");
    expect(fake.createSession).not.toHaveBeenCalled();
  });
});
