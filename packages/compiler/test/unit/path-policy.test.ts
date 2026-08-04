import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findCaseEquivalentPaths,
  isPathContained,
  ProjectPathPolicyError,
  resolveProjectFile,
  resolveProjectRoot,
  siblingTemporaryPath,
  validateProjectPath,
  validateReleaseDestinationPath,
  validateReleaseOutputPath,
} from "../../src/project/path-policy.js";

const temporaryRoots: string[] = [];

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-path-policy-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("project path policy", () => {
  it("accepts canonical project and release paths", () => {
    expect(validateProjectPath("src/logic.ts")).toBe("src/logic.ts");
    expect(validateReleaseDestinationPath("assets/clue-1.png")).toBe("assets/clue-1.png");
  });

  it.each(["", "/absolute.ts", "../outside.ts", "src\\logic.ts", "https:module.ts"])(
    "rejects non-canonical project path %j",
    (path) => {
      expect(() => validateProjectPath(path)).toThrow(ProjectPathPolicyError);
    },
  );

  it.each(["Assets/clue.png", "assets//clue.png", "assets/%63lue.png", "assets/clue?.png"])(
    "rejects non-canonical release destination %j",
    (path) => {
      expect(() => validateReleaseDestinationPath(path)).toThrow(ProjectPathPolicyError);
    },
  );

  it("resolves a regular file without permitting symlink aliases", async () => {
    const rootPath = await projectRoot();
    await mkdir(join(rootPath, "src"));
    await writeFile(join(rootPath, "src", "logic.ts"), "export const logic = true;\n");
    await symlink(join(rootPath, "src", "logic.ts"), join(rootPath, "src", "alias.ts"));
    const root = await resolveProjectRoot(rootPath);

    await expect(resolveProjectFile(root, "src/logic.ts")).resolves.toMatchObject({
      projectPath: "src/logic.ts",
      absolutePath: join(rootPath, "src", "logic.ts"),
    });
    await expect(resolveProjectFile(root, "src/alias.ts")).rejects.toMatchObject({
      reason: "symlink",
    });
  });

  it("rejects case aliases using directory identities", async () => {
    const rootPath = await projectRoot();
    await mkdir(join(rootPath, "Source"));
    await writeFile(join(rootPath, "Source", "Logic.ts"), "export {};\n");
    const root = await resolveProjectRoot(rootPath);

    await expect(resolveProjectFile(root, "source/Logic.ts")).rejects.toMatchObject({
      reason: "case-alias",
    });
  });

  it("detects portable case-equivalent registration paths", () => {
    expect(findCaseEquivalentPaths(["assets/a.png", "Assets/A.png", "assets/b.png"])).toEqual([
      ["Assets/A.png", "assets/a.png"],
    ]);
  });

  it("keeps output and temporary files on the destination filesystem", () => {
    const output = validateReleaseOutputPath("/tmp/releases/game.pprelease");
    expect(output).toBe("/tmp/releases/game.pprelease");
    expect(siblingTemporaryPath(output, "abc-123")).toBe(
      "/tmp/releases/.game.pprelease.abc-123.tmp",
    );
    expect(isPathContained("/tmp/releases", output)).toBe(true);
    expect(() => validateReleaseOutputPath("/tmp/releases/game.zip")).toThrow(
      ProjectPathPolicyError,
    );
  });
});
