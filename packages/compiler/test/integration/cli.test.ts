import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli.js";
import {
  releaseExampleProjects,
  releaseExampleRoot,
  type ReleaseExampleProject,
} from "../helpers/external-project.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function externalProject(
  project: ReleaseExampleProject = "minimal-local-puzzle",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-cli-test-"));
  temporaryRoots.push(root);
  await cp(releaseExampleRoot(project), root, { recursive: true });
  return root;
}

describe("compiler CLI", () => {
  it.each(releaseExampleProjects)(
    "returns machine-readable %s validation without ANSI output",
    async (project) => {
      const projectRoot = await externalProject(project);
      const writes: string[] = [];
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        writes.push(String(chunk));
        return true;
      });

      await expect(runCli(["validate", "--project", projectRoot, "--json"])).resolves.toBe(0);
      expect(JSON.parse(writes.join(""))).toMatchObject({ kind: "valid" });
      expect(writes.join("")).not.toContain("\u001b");
    },
  );

  it("returns stable invalid diagnostics and no release output", async () => {
    const projectRoot = await externalProject();
    const configPath = join(projectRoot, "plotpoint.project.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    config.releaseLabel = "invalid";
    await writeFile(configPath, JSON.stringify(config));
    const outputFile = join(projectRoot, "invalid.pprelease");
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await expect(
      runCli(["compile", "--project", projectRoot, "--out", outputFile, "--json"]),
    ).resolves.toBe(2);
    expect(JSON.parse(writes.join(""))).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "configuration-unknown-field" }],
    });
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(releaseExampleProjects)(
    "inspects compiled %s composition without loading game code",
    async (project) => {
      const projectRoot = await externalProject(project);
      const outputFile = join(projectRoot, "compiled.pprelease");
      const writes: string[] = [];
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        writes.push(String(chunk));
        return true;
      });
      await expect(
        runCli(["compile", "--project", projectRoot, "--out", outputFile, "--json"]),
      ).resolves.toBe(0);
      const compiled = JSON.parse(writes.join("")) as { releaseId: string };
      writes.length = 0;

      await expect(runCli(["inspect", outputFile, "--json"])).resolves.toBe(0);
      expect(JSON.parse(writes.join(""))).toMatchObject({
        release: {
          kind: "inspected",
          releaseId: compiled.releaseId,
          manifest: { releaseFormatVersion: 1 },
        },
        gameComposition: {
          application: { components: expect.any(Array) },
          aggregateModels: expect.any(Array),
        },
      });
    },
  );

  it.each(releaseExampleProjects)(
    "verifies %s structurally and against its known identity",
    async (project) => {
      const projectRoot = await externalProject(project);
      const outputFile = join(projectRoot, "verified.pprelease");
      const writes: string[] = [];
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        writes.push(String(chunk));
        return true;
      });
      await expect(
        runCli(["compile", "--project", projectRoot, "--out", outputFile, "--json"]),
      ).resolves.toBe(0);
      const compiled = JSON.parse(writes.join("")) as { releaseId: string };
      writes.length = 0;

      await expect(runCli(["verify", outputFile, "--json"])).resolves.toBe(0);
      expect(JSON.parse(writes.join(""))).toMatchObject({
        kind: "verified",
        trust: "structurally-valid",
        releaseId: compiled.releaseId,
      });
      writes.length = 0;

      await expect(
        runCli(["verify", outputFile, "--expect", compiled.releaseId, "--json"]),
      ).resolves.toBe(0);
      expect(JSON.parse(writes.join(""))).toMatchObject({
        kind: "verified",
        trust: "known-release-match",
        expectedReleaseId: compiled.releaseId,
      });
    },
  );

  it("rejects a mismatched expected identity and malformed verify arguments", async () => {
    const projectRoot = await externalProject();
    const outputFile = join(projectRoot, "mismatch.pprelease");
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    await expect(
      runCli(["compile", "--project", projectRoot, "--out", outputFile, "--json"]),
    ).resolves.toBe(0);
    stdout.length = 0;

    await expect(
      runCli([
        "verify",
        outputFile,
        "--expect",
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        "--json",
      ]),
    ).resolves.toBe(2);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "release-id-mismatch" }],
    });

    await expect(runCli(["verify", outputFile, "--expect", "not-a-release-id"])).resolves.toBe(2);
    expect(stderr.join("")).toContain("plotpoint verify");
  });

  it("rejects malformed serve ports before opening a server", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    await expect(runCli(["serve", "release.pprelease", "--port", "not-a-port"])).resolves.toBe(2);
    expect(stderr.join("")).toContain("plotpoint serve");
  });
});
