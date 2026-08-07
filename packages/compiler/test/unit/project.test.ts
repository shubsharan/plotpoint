import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProject } from "../../src/project/load-project.js";

const roots: string[] = [];

function validConfiguration(): Record<string, unknown> {
  return {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 1 },
    application: {
      definition: { source: "src/application.ts", export: "application" },
      components: ["puzzle.card"],
    },
    aggregateModels: [
      {
        id: "shared.targets",
        authority: "server",
        kind: "team",
        stateSchema: "shared.targets-state",
        initializationSchema: "shared.targets-configuration",
        events: [],
        effects: [],
      },
      {
        id: "puzzle.player",
        authority: "local",
        kind: "player",
        stateSchema: "puzzle.player-state",
        initializationSchema: "puzzle.initialization",
        initializer: { source: "src/initial-state.ts", export: "initializePlayer" },
        initializationContent: "puzzle.initialization-content",
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "shared.locate",
        type: "locate",
        execution: "trusted-mechanic",
        aggregateModel: "shared.targets",
        payloadSchema: "shared.locate-payload",
        outcomeSchema: "shared.locate-outcome",
      },
      {
        id: "puzzle.solve",
        type: "solve",
        execution: "local",
        definition: { source: "src/solve.ts", export: "solve" },
        aggregateModel: "puzzle.player",
        payloadSchema: "puzzle.solve-payload",
        outcomeSchema: "puzzle.solve-outcome",
      },
    ],
    schemas: [
      { id: "shared.locate-outcome", path: "schemas/shared-locate-outcome.json" },
      { id: "shared.locate-payload", path: "schemas/shared-locate-payload.json" },
      { id: "shared.projection", path: "schemas/shared-projection.json" },
      { id: "shared.targets-configuration", path: "schemas/shared-configuration.json" },
      { id: "shared.targets-state", path: "schemas/shared-targets-state.json" },
      { id: "puzzle.initialization", path: "schemas/puzzle-initialization.json" },
      { id: "puzzle.player-state", path: "schemas/puzzle-player-state.json" },
      { id: "puzzle.solve-outcome", path: "schemas/puzzle-solve-outcome.json" },
      { id: "puzzle.solve-payload", path: "schemas/puzzle-solve-payload.json" },
    ],
    progressions: [
      {
        id: "puzzle.route",
        aggregateModel: "puzzle.player",
        definition: { source: "src/route.ts", export: "route" },
      },
    ],
    components: [
      {
        id: "puzzle.card",
        implementation: { source: "src/puzzle-card.ts", export: "PuzzleCard" },
        commands: ["puzzle.solve"],
        content: ["puzzle.initialization-content"],
        assets: [],
        capabilities: [],
      },
    ],
    content: [
      {
        id: "puzzle.initialization-content",
        path: "content/puzzle-initialization.json",
        schema: { id: "puzzle.initialization" },
      },
      {
        id: "shared.configuration",
        path: "content/shared-configuration.json",
        schema: { id: "shared.targets-configuration" },
      },
    ],
    assets: [],
    trustedMechanic: {
      id: "target-discovery",
      aggregateModel: "shared.targets",
      commands: ["shared.locate"],
      configuration: "shared.configuration",
      projectionSchema: { id: "shared.projection" },
      capabilities: [],
    },
  };
}

async function createProject(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-project-"));
  roots.push(root);
  await writeFile(join(root, "plotpoint.project.json"), config);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("loadProject", () => {
  it("loads the corrected closed shape and ordinalizes registries", async () => {
    const root = await createProject(JSON.stringify(validConfiguration()));
    const result = await loadProject({ projectRoot: root });

    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") return;
    expect(result.config.projectFormatVersion).toBe(1);
    expect(result.registries.commands.map(({ id }) => id)).toEqual([
      "puzzle.solve",
      "shared.locate",
    ]);
    expect(result.registries.schemas.map(({ id }) => id)).toEqual([
      "puzzle.initialization",
      "puzzle.player-state",
      "puzzle.solve-outcome",
      "puzzle.solve-payload",
      "shared.locate-outcome",
      "shared.locate-payload",
      "shared.projection",
      "shared.targets-configuration",
      "shared.targets-state",
    ]);
    expect(Object.isFrozen(result.config)).toBe(true);
    expect(Object.isFrozen(result.registries.commands)).toBe(true);
  });

  it("rejects duplicate JSON object keys before shape validation", async () => {
    const text = JSON.stringify(validConfiguration()).replace(
      '"projectFormatVersion":1',
      '"projectFormatVersion":1,"projectFormatVersion":1',
    );
    const root = await createProject(text);

    await expect(loadProject({ projectRoot: root })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "configuration-duplicate-key" }],
    });
  });

  it("rejects unknown fields at nested boundaries", async () => {
    const config = validConfiguration();
    config.hostApi = { major: 1, minimumMinor: 0, range: "latest" };
    const root = await createProject(JSON.stringify(config));

    await expect(loadProject({ projectRoot: root })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [
        {
          code: "configuration-unknown-field",
          location: { pointer: "/hostApi/range" },
        },
      ],
    });
  });

  it("rejects duplicate logical identities", async () => {
    const config = validConfiguration();
    config.schemas = [
      { id: "same", path: "schemas/a.json" },
      { id: "same", path: "schemas/b.json" },
    ];
    const root = await createProject(JSON.stringify(config));

    const result = await loadProject({ projectRoot: root });
    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "configuration-identity-duplicate" }],
    });
  });

  it("loads plain corrected identities with relationships owned in one direction", async () => {
    const root = await createProject(JSON.stringify(validConfiguration()));

    const result = await loadProject({ projectRoot: root });

    expect(result).toMatchObject({
      kind: "loaded",
      config: {
        aggregateModels: [
          { id: "shared.targets", authority: "server", kind: "team" },
          { id: "puzzle.player", authority: "local", kind: "player" },
        ],
        progressions: [{ id: "puzzle.route", aggregateModel: "puzzle.player" }],
        trustedMechanic: { id: "target-discovery", aggregateModel: "shared.targets" },
      },
      registries: {
        aggregateModels: [{ id: "puzzle.player" }, { id: "shared.targets" }],
        commands: [{ id: "puzzle.solve" }, { id: "shared.locate" }],
      },
    });
    if (result.kind !== "loaded") return;
    expect(result.config.schemas).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "puzzle.player-state" })]),
    );
    expect(result.config).not.toHaveProperty("entries");
    expect(result.config).not.toHaveProperty("aggregateSchemas");
    expect(result.config).not.toHaveProperty("trustedMechanic.version");
    expect(result.config).not.toHaveProperty("aggregateModels.0.commands");
    expect(result.config).not.toHaveProperty("aggregateModels.0.progression");
    expect(result.config).not.toHaveProperty("aggregateModels.0.trustedMechanic");
    expect(result.config).not.toHaveProperty("aggregateModels.0.version");
    expect(result.config).not.toHaveProperty("progressions.0.version");
    expect(result.config).not.toHaveProperty("schemas.0.version");
  });

  it("rejects reverse model relationships at their deterministic pointers", async () => {
    const config = validConfiguration();
    const models = config.aggregateModels as Record<string, unknown>[];
    const localModel = models[1];
    if (localModel === undefined) throw new Error("corrected local model fixture missing");
    localModel.commands = ["puzzle.solve"];
    localModel.progression = "puzzle.route";
    localModel.trustedMechanic = "target-discovery";
    const root = await createProject(JSON.stringify(config));

    const result = await loadProject({ projectRoot: root });

    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind !== "invalid") return;
    expect(result.diagnostics.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/aggregateModels/1/commands" }),
      },
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/aggregateModels/1/progression" }),
      },
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/aggregateModels/1/trustedMechanic" }),
      },
    ]);
  });

  it("rejects per-entry version fields instead of treating them as generations", async () => {
    const config = validConfiguration();
    const models = config.aggregateModels as Record<string, unknown>[];
    const progressions = config.progressions as Record<string, unknown>[];
    const schemas = config.schemas as Record<string, unknown>[];
    const trustedMechanic = config.trustedMechanic as Record<string, unknown>;
    if (models[0] === undefined || progressions[0] === undefined || schemas[0] === undefined) {
      throw new Error("corrected generation fixture missing");
    }
    models[0].version = 1;
    progressions[0].version = 1;
    schemas[0].version = 1;
    trustedMechanic.version = 1;
    const root = await createProject(JSON.stringify(config));

    const result = await loadProject({ projectRoot: root });

    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind !== "invalid") return;
    expect(result.diagnostics.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/aggregateModels/0/version" }),
      },
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/progressions/0/version" }),
      },
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/schemas/0/version" }),
      },
      {
        code: "configuration-unknown-field",
        location: expect.objectContaining({ pointer: "/trustedMechanic/version" }),
      },
    ]);
  });
});
