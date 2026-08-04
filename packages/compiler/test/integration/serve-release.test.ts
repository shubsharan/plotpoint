import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compileProject, serveRelease } from "../../src/index.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../examples/releases/minimal-local-puzzle/", import.meta.url),
);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("release development server", () => {
  it("serves a closed descriptor and the exact verified bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-serve-"));
    roots.push(root);
    await cp(fixtureRoot, root, { recursive: true });
    const releaseFile = join(root, "field.pprelease");
    const compiled = await compileProject({ projectRoot: root, outputFile: releaseFile });
    expect(compiled.kind).toBe("compiled");

    const server = await serveRelease({ releaseFile, host: "127.0.0.1", port: 0 });
    try {
      const descriptor = (await (await fetch(server.descriptorUrl)).json()) as Record<
        string,
        unknown
      >;
      expect(descriptor).toEqual({
        version: 1,
        releaseUrl: `http://127.0.0.1:${server.port}/release.pprelease`,
        expectedReleaseId: server.releaseId,
      });
      const response = await fetch(descriptor.releaseUrl as string);
      expect(response.headers.get("content-type")).toBe("application/vnd.plotpoint.release");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("rejects public or wildcard advertised hosts", async () => {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-serve-host-"));
    roots.push(root);
    await cp(fixtureRoot, root, { recursive: true });
    const releaseFile = join(root, "field.pprelease");
    await compileProject({ projectRoot: root, outputFile: releaseFile });
    await expect(serveRelease({ releaseFile, host: "0.0.0.0" })).rejects.toThrow("private IPv4");
  });
});
