import { cp, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { MAX_RELEASE_BYTES } from "@plotpoint/protocol";

import { compileProject, privateIpv4Addresses, serveRelease } from "../../src/index.js";
import { releaseExampleProjects, type ReleaseExampleProject } from "../helpers/external-project.js";

function fixtureRoot(project: ReleaseExampleProject): string {
  return fileURLToPath(new URL(`../../../../examples/releases/${project}/`, import.meta.url));
}
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("release development server", () => {
  it.each(releaseExampleProjects)(
    "serves one captured %s artifact byte-for-byte",
    async (project) => {
      const root = await mkdtemp(join(tmpdir(), `plotpoint-serve-${project}-`));
      roots.push(root);
      await cp(fixtureRoot(project), root, { recursive: true });
      const releaseFile = join(root, `${project}.pprelease`);
      const compiled = await compileProject({ projectRoot: root, outputFile: releaseFile });
      if (compiled.kind !== "compiled") {
        throw new Error(`${project} compile failed: ${JSON.stringify(compiled.diagnostics)}`);
      }
      const expectedBytes = await readFile(releaseFile);

      const server = await serveRelease({ releaseFile, host: "127.0.0.1", port: 0 });
      try {
        await writeFile(releaseFile, "changed after server startup");
        const descriptorResponse = await fetch(server.descriptorUrl);
        const descriptorBody = await descriptorResponse.text();
        const descriptor = JSON.parse(descriptorBody) as Record<string, unknown>;
        expect(descriptor).toEqual({
          releaseUrl: `http://127.0.0.1:${server.port}/release.pprelease`,
          expectedReleaseId: server.releaseId,
        });
        expect(descriptorBody).toBe(JSON.stringify(descriptor));
        expect(descriptorResponse.headers.get("cache-control")).toBe("no-store");

        const firstRelease = await fetch(descriptor.releaseUrl as string);
        const secondRelease = await fetch(descriptor.releaseUrl as string);
        expect(firstRelease.headers.get("content-type")).toBe("application/vnd.plotpoint.release");
        expect(firstRelease.headers.get("content-length")).toBe(String(expectedBytes.byteLength));
        expect(Buffer.from(await firstRelease.arrayBuffer())).toEqual(expectedBytes);
        expect(Buffer.from(await secondRelease.arrayBuffer())).toEqual(expectedBytes);
      } finally {
        await server.close();
      }
    },
  );

  it("returns a byte-stable closed descriptor across requests", async () => {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-serve-descriptor-"));
    roots.push(root);
    await cp(fixtureRoot("minimal-local-puzzle"), root, { recursive: true });
    const releaseFile = join(root, "field.pprelease");
    const compiled = await compileProject({ projectRoot: root, outputFile: releaseFile });
    if (compiled.kind !== "compiled") {
      throw new Error(
        `minimal-local-puzzle compile failed: ${JSON.stringify(compiled.diagnostics)}`,
      );
    }

    const server = await serveRelease({ releaseFile, host: "127.0.0.1", port: 0 });
    try {
      const first = await (await fetch(server.descriptorUrl)).text();
      const second = await (await fetch(server.descriptorUrl)).text();
      expect(second).toBe(first);
      expect(Object.keys(JSON.parse(first) as object)).toEqual(["releaseUrl", "expectedReleaseId"]);
    } finally {
      await server.close();
    }
  });

  it("selects only sorted unique eligible private IPv4 interfaces", () => {
    expect(
      privateIpv4Addresses({
        wifi: [
          { address: "192.168.1.20", family: "IPv4", internal: false },
          { address: "8.8.8.8", family: "IPv4", internal: false },
          { address: "fd00::1", family: "IPv6", internal: false },
        ],
        ethernet: [
          { address: "10.0.0.5", family: "IPv4", internal: false },
          { address: "192.168.1.20", family: "IPv4", internal: false },
        ],
        loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      }),
    ).toEqual(["10.0.0.5", "192.168.1.20"]);
  });

  it("rejects invalid artifacts, excessive files, and ineligible advertised hosts", async () => {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-serve-host-"));
    roots.push(root);
    await cp(fixtureRoot("minimal-local-puzzle"), root, { recursive: true });
    const releaseFile = join(root, "field.pprelease");
    const compiled = await compileProject({ projectRoot: root, outputFile: releaseFile });
    if (compiled.kind !== "compiled") {
      throw new Error(
        `minimal-local-puzzle compile failed: ${JSON.stringify(compiled.diagnostics)}`,
      );
    }

    await expect(serveRelease({ releaseFile, host: "0.0.0.0" })).rejects.toThrow("private IPv4");
    await expect(serveRelease({ releaseFile, host: "8.8.8.8" })).rejects.toThrow("private IPv4");
    await expect(serveRelease({ releaseFile, host: "127.0.0.1:4000" })).rejects.toThrow(
      "private IPv4",
    );
    await expect(serveRelease({ releaseFile: "", host: "127.0.0.1" })).rejects.toThrow(
      "must not be empty",
    );
    await expect(serveRelease({ releaseFile, host: "127.0.0.1", port: -1 })).rejects.toThrow(
      "port must be an integer",
    );
    await expect(serveRelease({ releaseFile, host: "127.0.0.1", port: 1.5 })).rejects.toThrow(
      "port must be an integer",
    );

    const invalidFile = join(root, "invalid.pprelease");
    await writeFile(invalidFile, "not a release");
    await expect(serveRelease({ releaseFile: invalidFile, host: "127.0.0.1" })).rejects.toThrow(
      "invalid release",
    );

    const excessiveFile = join(root, "excessive.pprelease");
    await writeFile(excessiveFile, "");
    await truncate(excessiveFile, MAX_RELEASE_BYTES + 1);
    await expect(serveRelease({ releaseFile: excessiveFile, host: "127.0.0.1" })).rejects.toThrow(
      `exceeds ${MAX_RELEASE_BYTES}`,
    );
  });
});
