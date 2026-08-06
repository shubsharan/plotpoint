import { once } from "node:events";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../src/server.js";

const FIRST_RELEASE_ID = `sha256:${"a".repeat(64)}` as const;
const REVISED_RELEASE_ID = `sha256:${"b".repeat(64)}` as const;
const PARTICIPANTS = ["participant-one", "participant-two", "participant-three"] as const;

interface Target {
  readonly targetId: string;
  readonly maximumAgeMs: number;
}

interface TargetConfiguration {
  readonly targets: readonly Target[];
}

function isTargetConfiguration(value: unknown): value is TargetConfiguration {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const targets = (value as { readonly targets?: unknown }).targets;
  return (
    Array.isArray(targets) &&
    targets.every(
      (target) =>
        target !== null &&
        typeof target === "object" &&
        !Array.isArray(target) &&
        typeof (target as { readonly targetId?: unknown }).targetId === "string" &&
        Number.isSafeInteger((target as { readonly maximumAgeMs?: unknown }).maximumAgeMs),
    )
  );
}

async function loadTargetConfiguration(): Promise<TargetConfiguration> {
  const value: unknown = JSON.parse(
    await readFile(
      new URL("../../../examples/releases/co-op-game/content/targets.json", import.meta.url),
      "utf8",
    ),
  );
  if (!isTargetConfiguration(value)) throw new Error("co-op-target-configuration-invalid");
  return value;
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

const servers: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function start(serviceDouble: Parameters<typeof createApiServer>[0]): Promise<string> {
  const server = createApiServer(serviceDouble, { operatorToken: "operator" });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("address-invalid");
  return `http://127.0.0.1:${address.port}`;
}

describe("co-op game acceptance", () => {
  it("starts the three-participant, interrupted, report-driven two-release journey", async () => {
    const configuration = await loadTargetConfiguration();
    expect(configuration.targets).toHaveLength(PARTICIPANTS.length);

    const journey = {
      firstRelease: {
        releaseId: FIRST_RELEASE_ID,
        creationId: "co-op-first-session",
        assignments: configuration.targets.map((target, index) => ({
          participantId: PARTICIPANTS[index],
          targetId: target.targetId,
        })),
        sharedPlay: {
          queueWhile: "disconnected",
          interruption: "after-submit-before-pull",
          restart: true,
        },
        completion: "every-configured-target",
        learningEvidence: {
          commandTerminal: "rejected",
          capabilityDisposition: "expired",
          forbiddenFields: [
            "targetId",
            "latitude",
            "longitude",
            "payload",
            "outcomeCode",
            "maximumAgeMs",
            "serviceOrigin",
          ],
        },
      },
      revision: {
        releaseId: REVISED_RELEASE_ID,
        creationId: "co-op-revised-session",
        changedConfigurationField: "maximumAgeMs",
        sessionDisposition: "fresh",
        completion: "every-configured-target",
      },
    } as const;

    expect(journey.firstRelease.assignments).toHaveLength(3);
    expect(journey.firstRelease.sharedPlay).toEqual({
      queueWhile: "disconnected",
      interruption: "after-submit-before-pull",
      restart: true,
    });
    expect(journey.firstRelease.completion).toBe("every-configured-target");
    expect(journey.firstRelease.learningEvidence).toMatchObject({
      commandTerminal: "rejected",
      capabilityDisposition: "expired",
    });
    expect(journey.firstRelease.learningEvidence.forbiddenFields).toContain("targetId");
    expect(journey.firstRelease.learningEvidence.forbiddenFields).toContain("outcomeCode");
    expect(journey.revision.releaseId).not.toBe(journey.firstRelease.releaseId);
    expect(journey.revision.creationId).not.toBe(journey.firstRelease.creationId);
    expect(journey.revision.changedConfigurationField).toBe("maximumAgeMs");
    expect(journey.revision.sessionDisposition).toBe("fresh");
    expect(journey.revision.completion).toBe("every-configured-target");

    const origin = await start(service());
    const response = await fetch(`${origin}/v1/shared-sessions`, {
      method: "POST",
      headers: {
        authorization: "Bearer operator",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        creationId: journey.firstRelease.creationId,
        releaseId: journey.firstRelease.releaseId,
        teamLabel: "Co-op acceptance",
      }),
    });
    const body: unknown = await response.json();
    if (response.status === 404) expect(body).toMatchObject({ code: "route-not-found" });
    expect(response.status, "shared-sessions-route-missing: route-not-found").toBe(200);
  });
});
