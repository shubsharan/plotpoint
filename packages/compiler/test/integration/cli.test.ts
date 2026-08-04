import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../examples/releases/minimal-local-puzzle/", import.meta.url),
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function externalProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-cli-test-"));
  temporaryRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

describe("compiler CLI", () => {
  it("returns machine-readable validation results without ANSI output", async () => {
    const projectRoot = await externalProject();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await expect(runCli(["validate", "--project", projectRoot, "--json"])).resolves.toBe(0);
    expect(JSON.parse(writes.join(""))).toMatchObject({ kind: "valid" });
    expect(writes.join("")).not.toContain("\u001b");
  });

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

  it("inspects a compiled release without loading game code", async () => {
    const projectRoot = await externalProject();
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
      kind: "inspected",
      releaseId: compiled.releaseId,
      manifest: { releaseFormatVersion: 1 },
    });
  });

  it("verifies structural validity without claiming a known identity", async () => {
    const projectRoot = await externalProject();
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
  });

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
});
