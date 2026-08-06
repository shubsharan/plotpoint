import { readFile } from "node:fs/promises";

import { createReleaseArtifact, type GameComposition } from "@plotpoint/protocol";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { SharedSessionService, SharedSessionServiceError } from "../src/shared-session-service.js";

const schemaPaths = {
  "co-op.initialization": "schemas/general/636f2d6f702e696e697469616c697a6174696f6e.json",
  "co-op.player-state": "schemas/aggregate/636f2d6f702e706c617965722d7374617465.json",
  "plotpoint.location.target-config":
    "schemas/general/706c6f74706f696e742e6c6f636174696f6e2e7461726765742d636f6e666967.json",
  "plotpoint.location.target-discovery-outcome":
    "schemas/general/706c6f74706f696e742e6c6f636174696f6e2e7461726765742d646973636f766572792d6f7574636f6d65.json",
  "plotpoint.location.target-discovery-payload":
    "schemas/general/706c6f74706f696e742e6c6f636174696f6e2e7461726765742d646973636f766572792d7061796c6f6164.json",
  "plotpoint.location.team-projection":
    "schemas/general/706c6f74706f696e742e6c6f636174696f6e2e7465616d2d70726f6a656374696f6e.json",
  "plotpoint.location.team-state":
    "schemas/aggregate/706c6f74706f696e742e6c6f636174696f6e2e7465616d2d7374617465.json",
} as const;

const sourcePaths = {
  "co-op.initialization": "schemas/initialization.schema.json",
  "co-op.player-state": "schemas/player-shell.schema.json",
  "plotpoint.location.target-config": "schemas/target-config.schema.json",
  "plotpoint.location.target-discovery-outcome": "schemas/target-discovery-outcome.schema.json",
  "plotpoint.location.target-discovery-payload": "schemas/target-discovery-payload.schema.json",
  "plotpoint.location.team-projection": "schemas/team-projection.schema.json",
  "plotpoint.location.team-state": "schemas/team-state.schema.json",
} as const;

async function jsonFile(path: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL(`../../../examples/releases/co-op-game/${path}`, import.meta.url),
      "utf8",
    ),
  );
}

function composition(mechanicId = "plotpoint.location.target-discovery"): GameComposition {
  return {
    application: { components: [] },
    aggregateModels: [
      {
        id: "co-op.player",
        authority: "local",
        kind: "player",
        stateSchema: { id: "co-op.player-state" },
        initializationSchema: { id: "co-op.initialization" },
        events: [],
        effects: [],
      },
      {
        id: "plotpoint.location.team",
        authority: "server",
        kind: "team",
        stateSchema: { id: "plotpoint.location.team-state" },
        initializationSchema: { id: "plotpoint.location.target-config" },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "plotpoint.location.target-discovery",
        type: "plotpoint.location.target-discovery",
        aggregateModel: "plotpoint.location.team",
        payloadSchema: { id: "plotpoint.location.target-discovery-payload" },
        outcomeSchema: { id: "plotpoint.location.target-discovery-outcome" },
        execution: "trusted-mechanic",
      },
    ],
    progressions: [],
    components: [],
    resources: [
      {
        id: "co-op.initialization",
        role: "schema",
        path: schemaPaths["co-op.initialization"],
      },
      {
        id: "co-op.player-state",
        role: "schema",
        path: schemaPaths["co-op.player-state"],
      },
      {
        id: "co-op.targets",
        role: "content",
        path: "content/636f2d6f702e74617267657473.json",
        schema: { id: "plotpoint.location.target-config" },
      },
      ...Object.entries(schemaPaths)
        .filter(([id]) => !id.startsWith("co-op."))
        .map(([id, path]) => ({ id, role: "schema" as const, path })),
    ],
    trustedMechanic: {
      id: mechanicId,
      aggregateModel: "plotpoint.location.team",
      commands: ["plotpoint.location.target-discovery"],
      configuration: "co-op.targets",
      projectionSchema: { id: "plotpoint.location.team-projection" },
      capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
    },
  };
}

async function releaseFixture(
  options: {
    readonly mechanicId?: string;
    readonly projectionSchemaOverride?: unknown;
    readonly hostApi?: { readonly major: number; readonly minimumMinor: number };
  } = {},
) {
  const schemas = await Promise.all(
    Object.entries(sourcePaths).map(async ([id, path]) => [id, await jsonFile(path)] as const),
  );
  const configuration = await jsonFile("content/targets.json");
  const gameComposition = composition(options.mechanicId);
  const artifact = await createReleaseArtifact({
    hostApi: options.hostApi ?? { major: 1, minimumMinor: 1 },
    aggregateSchemas: [
      {
        id: "co-op.player-state",
        kind: "player",
        path: schemaPaths["co-op.player-state"],
      },
      {
        id: "plotpoint.location.team-state",
        kind: "team",
        path: schemaPaths["plotpoint.location.team-state"],
      },
    ],
    capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    entries: [
      {
        path: "bundles/logic.js",
        kind: "logic-bundle",
        bytes: new TextEncoder().encode("export {}"),
      },
      {
        path: "bundles/presentation.js",
        kind: "presentation-bundle",
        bytes: new TextEncoder().encode("export {}"),
      },
      { path: "composition/game.json", kind: "content", value: gameComposition },
      {
        path: "content/636f2d6f702e74617267657473.json",
        kind: "content",
        value: configuration,
      },
      ...schemas.map(([id, value]) => ({
        path: schemaPaths[id as keyof typeof schemaPaths],
        kind:
          id === "plotpoint.location.team-state" || id === "co-op.player-state"
            ? ("aggregate-schema" as const)
            : ("command-schema" as const),
        value:
          id === "plotpoint.location.team-projection" &&
          options.projectionSchemaOverride !== undefined
            ? options.projectionSchemaOverride
            : value,
      })),
    ],
  });
  if ("kind" in artifact) throw new Error("release-fixture-invalid");
  return artifact;
}

function pool() {
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
  return { query, value: { query } as unknown as Pool };
}

describe("trusted release registration", () => {
  it("resolves the closed adapter and persists only validated registration data", async () => {
    const artifact = await releaseFixture();
    const database = pool();
    const service = new SharedSessionService(database.value, "pepper");

    await expect(service.registerRelease(artifact.bytes, artifact.releaseId)).resolves.toEqual({
      releaseId: artifact.releaseId,
      mechanicId: "plotpoint.location.target-discovery",
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO release_registrations"),
      [artifact.releaseId, expect.any(String), expect.any(String)],
    );
    const stored = database.query.mock.calls[0]?.[1] as readonly string[];
    expect(JSON.parse(stored[1] ?? "null")).toMatchObject({
      gameComposition: { trustedMechanic: { id: "plotpoint.location.target-discovery" } },
    });
    expect(JSON.parse(stored[2] ?? "null")).toHaveProperty("targets");
    expect(stored.join("\n")).not.toContain("export {}");
  });

  it("rejects unknown mechanics and schema digest mismatches with safe stable codes", async () => {
    const unknown = await releaseFixture({ mechanicId: "unknown.mechanic" });
    const mismatched = await releaseFixture({
      projectionSchemaOverride: {
        ...((await jsonFile("schemas/team-projection.schema.json")) as Record<string, unknown>),
        description: "digest drift",
      },
    });
    const service = new SharedSessionService(pool().value, "pepper");

    await expect(service.registerRelease(unknown.bytes, unknown.releaseId)).rejects.toEqual(
      new SharedSessionServiceError("unknown-mechanic", 422),
    );
    await expect(service.registerRelease(mismatched.bytes, mismatched.releaseId)).rejects.toEqual(
      new SharedSessionServiceError("schema-contract-mismatch", 422),
    );
  });

  it("rejects expected identity mismatch before persistence", async () => {
    const artifact = await releaseFixture();
    const database = pool();
    const service = new SharedSessionService(database.value, "pepper");
    await expect(
      service.registerRelease(artifact.bytes, `sha256:${"f".repeat(64)}`),
    ).rejects.toMatchObject({ code: "release-invalid", status: 422 });
    expect(database.query).not.toHaveBeenCalled();
  });

  it("rejects releases that require an unsupported Host API", async () => {
    const artifact = await releaseFixture({ hostApi: { major: 1, minimumMinor: 2 } });
    const database = pool();
    const service = new SharedSessionService(database.value, "pepper");
    await expect(service.registerRelease(artifact.bytes, artifact.releaseId)).rejects.toEqual(
      new SharedSessionServiceError("host-api-unsupported", 422),
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it("rejects an incoherent immutable registration reuse", async () => {
    const artifact = await releaseFixture();
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const service = new SharedSessionService({ query } as unknown as Pool, "pepper");
    await expect(service.registerRelease(artifact.bytes, artifact.releaseId)).rejects.toEqual(
      new SharedSessionServiceError("release-registration-conflict", 409),
    );
  });
});
