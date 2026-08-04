import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  AtomicOutputInterruptionError,
  OutputCollisionError,
  publishReleaseAtomically,
} from "../../src/release/atomic-output.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-atomic-output-"));
  temporaryRoots.push(root);
  return root;
}

describe("atomic release publication", () => {
  it("publishes complete bytes and removes its temporary file", async () => {
    const root = await createRoot();
    const outputFile = join(root, "game.pprelease");
    const bytes = Uint8Array.from([1, 2, 3, 4]);

    await expect(publishReleaseAtomically({ outputFile, bytes, token: "first" })).resolves.toEqual({
      status: "published",
      outputFile,
    });
    await expect(readFile(outputFile)).resolves.toEqual(Buffer.from(bytes));
    await expect(readdir(root)).resolves.toEqual(["game.pprelease"]);
  });

  it("reuses an exact existing artifact without overwriting it", async () => {
    const root = await createRoot();
    const outputFile = join(root, "game.pprelease");
    const bytes = Uint8Array.from([9, 8, 7]);
    await publishReleaseAtomically({ outputFile, bytes, token: "first" });

    await expect(publishReleaseAtomically({ outputFile, bytes, token: "second" })).resolves.toEqual(
      { status: "reused", outputFile },
    );
    await expect(readdir(root)).resolves.toEqual(["game.pprelease"]);
  });

  it("preserves an unrelated existing destination", async () => {
    const root = await createRoot();
    const outputFile = join(root, "game.pprelease");
    await publishReleaseAtomically({
      outputFile,
      bytes: Uint8Array.from([1]),
      token: "first",
    });

    await expect(
      publishReleaseAtomically({
        outputFile,
        bytes: Uint8Array.from([2]),
        token: "second",
      }),
    ).rejects.toBeInstanceOf(OutputCollisionError);
    await expect(readFile(outputFile)).resolves.toEqual(Buffer.from([1]));
    await expect(readdir(root)).resolves.toEqual(["game.pprelease"]);
  });

  it.each(["after-write", "before-publish"] as const)(
    "leaves no final or temporary artifact when interrupted %s",
    async (failureInjection) => {
      const root = await createRoot();
      const outputFile = join(root, "game.pprelease");

      await expect(
        publishReleaseAtomically({
          outputFile,
          bytes: Uint8Array.from([1, 2, 3]),
          token: "interrupted",
          failureInjection,
        }),
      ).rejects.toBeInstanceOf(AtomicOutputInterruptionError);
      await expect(readdir(root)).resolves.toEqual([]);
    },
  );
});
