import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadProject } from "../../src/project/load-project.js";
import { captureProjectSnapshot, verifySnapshotUnchanged } from "../../src/project/snapshot.js";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/projects/invalid/configuration/", import.meta.url),
);
const roots: string[] = [];

async function fixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `plotpoint-invalid-${name}-`));
  roots.push(root);
  await cp(join(fixtureRoot, name), root, { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("invalid project configuration fixtures", () => {
  it.each([
    ["malformed", "configuration-invalid-json"],
    ["duplicate-identity", "configuration-identity-duplicate"],
    ["path-escape", "project-path-invalid"],
  ])("rejects %s with %s", async (name, code) => {
    const root = await fixture(name);

    await expect(loadProject({ projectRoot: root })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code }],
    });
  });

  it("normalizes a missing configuration file", async () => {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-missing-config-"));
    roots.push(root);

    await expect(loadProject({ projectRoot: root })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "project-file-missing", location: { path: "plotpoint.project.json" } }],
    });
  });

  it("rejects a selected symlink with its configuration location", async () => {
    const root = await fixture("symlink");
    await symlink(join(root, "src", "logic.ts"), join(root, "src", "alias.ts"));
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded") throw new Error("symlink fixture configuration did not load");

    await expect(captureProjectSnapshot(loaded)).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "project-path-symlink", location: { path: "src/alias.ts" } }],
    });
  });

  it("rejects a case alias instead of resolving a case-equivalent path", async () => {
    const root = await fixture("case-alias");
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded") throw new Error("case fixture configuration did not load");

    await expect(captureProjectSnapshot(loaded)).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "project-path-case-alias", location: { path: "source/Logic.ts" } }],
    });
  });

  it("normalizes a missing selected file", async () => {
    const root = await fixture("missing-file");
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded")
      throw new Error("missing-file fixture configuration did not load");

    await expect(captureProjectSnapshot(loaded)).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "project-file-missing", location: { path: "src/logic.ts" } }],
    });
  });

  it("detects a tracked input mutation with stable location and no host metadata", async () => {
    const root = await fixture("input-mutation");
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded") throw new Error("mutation fixture configuration did not load");
    const captured = await captureProjectSnapshot(loaded);
    if (captured.kind !== "captured") throw new Error("mutation fixture did not capture");
    const logicPath = join(root, "src", "logic.ts");
    await writeFile(
      logicPath,
      `${await readFile(logicPath, "utf8")}\nexport const changed = true;\n`,
    );

    await expect(verifySnapshotUnchanged(captured.snapshot)).resolves.toMatchObject([
      {
        code: "project-input-changed",
        location: { kind: "configuration", path: "src/logic.ts", pointer: "" },
        details: { path: "src/logic.ts" },
      },
    ]);
  });
});
