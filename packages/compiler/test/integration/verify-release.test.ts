import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";
import { verifyRelease, type ReleaseManifest } from "@plotpoint/protocol";

import { createExternalProject, releaseExampleProjects } from "../helpers/external-project.js";

function mutateStoredEntry(bytes: Uint8Array, targetPath: string): Uint8Array {
  const mutated = new Uint8Array(bytes);
  const view = new DataView(mutated.buffer, mutated.byteOffset, mutated.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= mutated.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const payloadOffset = offset + 30 + nameLength + extraLength;
    const path = decoder.decode(mutated.subarray(offset + 30, offset + 30 + nameLength));
    if (path === targetPath) {
      if (size === 0) throw new Error(`cannot mutate empty release entry ${targetPath}`);
      mutated[payloadOffset + Math.floor(size / 2)]! ^= 0x01;
      return mutated;
    }
    offset = payloadOffset + size;
  }
  throw new Error(`release entry not found: ${targetPath}`);
}

describe("golden release verification acceptance", () => {
  it.each(releaseExampleProjects)(
    "rejects every mutated entry in %s against structural and known-identity verification",
    async (project) => {
      const external = await createExternalProject(project);
      try {
        const outputFile = join(external.sandbox, `${project}.pprelease`);
        const compiled = await compileProject({ projectRoot: external.root, outputFile });
        if (compiled.kind !== "compiled") {
          throw new Error(`golden compile failed: ${JSON.stringify(compiled.diagnostics)}`);
        }
        const bytes = new Uint8Array(await readFile(outputFile));

        await expect(verifyRelease({ bytes })).resolves.toMatchObject({
          kind: "verified",
          trust: "structurally-valid",
          releaseId: compiled.releaseId,
        });
        await expect(
          verifyRelease({ bytes, expectedReleaseId: compiled.releaseId }),
        ).resolves.toMatchObject({
          kind: "verified",
          trust: "known-release-match",
        });

        const paths = [
          "manifest.json",
          ...(compiled.manifest as ReleaseManifest).inventory.map(({ path }) => path),
        ];
        for (const path of paths) {
          const mutated = mutateStoredEntry(bytes, path);
          const structural = await verifyRelease({ bytes: mutated });
          expect(structural, `${project}: ${path}`).toMatchObject({
            kind: "invalid",
            diagnostics: [{ code: "zip-crc-mismatch", path }],
          });
          const known = await verifyRelease({
            bytes: mutated,
            expectedReleaseId: compiled.releaseId,
          });
          expect(known, `${project}: ${path} against expected identity`).toMatchObject({
            kind: "invalid",
            diagnostics: [{ code: "zip-crc-mismatch", path }],
          });
        }

        await expect(
          verifyRelease({
            bytes,
            expectedReleaseId:
              "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          }),
        ).resolves.toMatchObject({
          kind: "invalid",
          diagnostics: [{ code: "release-id-mismatch" }],
        });
        await expect(
          verifyRelease({ bytes: bytes.subarray(0, bytes.byteLength - 1) }),
        ).resolves.toMatchObject({ kind: "invalid" });
      } finally {
        await external.cleanup();
      }
    },
    120_000,
  );
});
