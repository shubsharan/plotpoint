import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProject } from "../../src/project/load-project.js";
import { captureProjectSnapshot } from "../../src/project/snapshot.js";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-snapshot-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "src")),
    mkdir(join(root, "schemas")),
    mkdir(join(root, "content")),
    mkdir(join(root, "assets")),
  ]);
  const config = {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 0 },
    application: {
      definition: { source: "src/presentation.ts", export: "presentation" },
      components: [],
    },
    aggregateModels: [
      {
        id: "player",
        authority: "local",
        kind: "player",
        stateSchema: "player-state",
        initializationSchema: "player-initialization",
        initializer: { source: "src/logic.ts", export: "logic" },
        events: [],
        effects: [],
      },
    ],
    commands: [],
    schemas: [
      { id: "player-state", path: "schemas/player.json" },
      { id: "player-initialization", path: "schemas/initialization.json" },
    ],
    progressions: [],
    components: [],
    content: [{ id: "story", path: "content/story.json" }],
    assets: [{ id: "image", path: "assets/image.bin", releasePath: "assets/image.bin" }],
  };
  await Promise.all([
    writeFile(join(root, "plotpoint.project.json"), JSON.stringify(config)),
    writeFile(join(root, "src/logic.ts"), 'export { helper as logic } from "./helper.js";\n'),
    writeFile(join(root, "src/helper.ts"), "export const helper = {};\n"),
    writeFile(join(root, "src/presentation.ts"), "export const presentation = {};\n"),
    writeFile(join(root, "schemas/player.json"), "{}"),
    writeFile(join(root, "schemas/initialization.json"), "{}"),
    writeFile(join(root, "content/story.json"), '{"title":"Frozen"}'),
    writeFile(join(root, "assets/image.bin"), new Uint8Array([0, 1, 2])),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("project snapshot", () => {
  it("captures explicit material and the reachable local source graph once", async () => {
    const root = await fixture();
    const loaded = await loadProject({ projectRoot: root });
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind !== "loaded") return;

    const result = await captureProjectSnapshot(loaded);
    expect(result.kind).toBe("captured");
    if (result.kind !== "captured") return;
    expect([...result.snapshot.files.keys()]).toEqual([
      "assets/image.bin",
      "content/story.json",
      "plotpoint.project.json",
      "schemas/initialization.json",
      "schemas/player.json",
      "src/helper.ts",
      "src/logic.ts",
      "src/presentation.ts",
    ]);
    expect(new TextDecoder().decode(result.snapshot.files.get("src/helper.ts")?.bytes)).toBe(
      "export const helper = {};\n",
    );
    const exposed = result.snapshot.files.get("src/helper.ts")?.bytes;
    if (exposed !== undefined) exposed[0] = 0;
    expect(new TextDecoder().decode(result.snapshot.files.get("src/helper.ts")?.bytes)).toBe(
      "export const helper = {};\n",
    );
  });

  it("keeps captured input stable when the source file changes later", async () => {
    const root = await fixture();
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded") throw new Error("fixture did not load");
    const captured = await captureProjectSnapshot(loaded);
    if (captured.kind !== "captured") throw new Error("fixture was not captured");

    const capturedBytes = captured.snapshot.files.get("content/story.json")?.bytes;
    await writeFile(join(root, "content/story.json"), '{"title":"Changed"}');
    expect(captured.snapshot.files.get("content/story.json")?.bytes).toEqual(capturedBytes);
    expect(new TextDecoder().decode(capturedBytes)).toBe('{"title":"Frozen"}');
  });
});
