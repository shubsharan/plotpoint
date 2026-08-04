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
    hostApi: { major: 1, minimumMinor: 0 },
    entries: {
      logic: { source: "src/logic.ts", export: "logic" },
      presentation: { source: "src/presentation.tsx", export: "Presentation" },
    },
    commands: [
      {
        id: "z.command",
        type: "solve",
        definition: { source: "src/command.ts", export: "command" },
        aggregateSchema: "player.v1",
        payloadSchema: "payload.v1",
        outcomeSchema: "outcome.v1",
      },
      {
        id: "a.command",
        type: "start",
        definition: { source: "src/start.ts", export: "command" },
        aggregateSchema: "player.v1",
        payloadSchema: "payload.v1",
        outcomeSchema: "outcome.v1",
      },
    ],
    aggregateSchemas: [
      { id: "player.v1", kind: "player", version: 1, path: "schemas/player.json" },
    ],
    schemas: [
      { id: "outcome.v1", path: "schemas/outcome.json" },
      { id: "payload.v1", path: "schemas/payload.json" },
    ],
    progressions: [],
    components: [],
    content: [],
    assets: [],
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
  it("loads the closed v1 shape and ordinalizes registries", async () => {
    const root = await createProject(JSON.stringify(validConfiguration()));
    const result = await loadProject({ projectRoot: root });

    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") return;
    expect(result.config.projectFormatVersion).toBe(1);
    expect(result.registries.commands.map(({ id }) => id)).toEqual(["a.command", "z.command"]);
    expect(result.registries.schemas.map(({ id }) => id)).toEqual(["outcome.v1", "payload.v1"]);
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
});
