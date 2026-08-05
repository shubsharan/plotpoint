import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiServer } from "../src/server.js";

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
    registerRelease: vi.fn(),
    createSession: vi
      .fn()
      .mockResolvedValue({ sessionId: "session-1", teamId: "team-1", disposition: "created" }),
    createInvitation: vi.fn(),
    join: vi.fn(),
    revoke: vi.fn(),
    submit: vi.fn(),
    pull: vi.fn(),
  };
}

describe("cooperative hunt HTTP boundary", () => {
  it("requires operator authority", async () => {
    const fake = service();
    const origin = await start(fake);
    const denied = await fetch(`${origin}/hunt-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1 }),
    });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ code: "operator-not-authorized" });
    const allowed = await fetch(`${origin}/hunt-sessions`, {
      method: "POST",
      headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({
        version: 1,
        creationId: "create-1",
        releaseId: `sha256:${"a".repeat(64)}`,
        teamLabel: "Team",
      }),
    });
    expect(allowed.status).toBe(200);
    expect(fake.createSession).toHaveBeenCalledOnce();
  });

  it("keeps participant credentials in the Authorization header", async () => {
    const fake = service();
    fake.pull.mockResolvedValue({
      version: 1,
      kind: "snapshot",
      reset: false,
      nextCursor: "0",
      snapshot: {},
      commandResults: [],
    });
    const origin = await start(fake);
    const response = await fetch(`${origin}/hunt-sessions/session-1/sync?after=0`, {
      headers: { authorization: "Bearer participant-secret" },
    });
    expect(response.status).toBe(200);
    expect(fake.pull).toHaveBeenCalledWith("session-1", "participant-secret", "0");
    expect(JSON.stringify(await response.json())).not.toContain("participant-secret");
  });

  it("rejects unknown request fields before service dispatch", async () => {
    const fake = service();
    const origin = await start(fake);
    const response = await fetch(`${origin}/hunt-sessions`, {
      method: "POST",
      headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({
        version: 1,
        creationId: "create-1",
        releaseId: `sha256:${"a".repeat(64)}`,
        teamLabel: "Team",
        targetId: "host-leak",
      }),
    });
    expect(response.status).toBe(400);
    expect(fake.createSession).not.toHaveBeenCalled();
  });
});
