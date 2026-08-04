import { describe, expect, it } from "vitest";

import {
  computeReleaseId,
  encodeCanonicalJson,
  inspectRelease,
  sha256Digest,
  writeStoredZip,
  type ReleaseManifestV1,
  type StoredZipEntry,
} from "@plotpoint/protocol";

const utf8 = new TextEncoder();
const payloads: Readonly<Record<string, Uint8Array>> = {
  "assets/map.webp": Uint8Array.from([1, 2, 3]),
  "bundles/logic.js": utf8.encode("globalThis.__inspectionExecuted = true;"),
  "bundles/presentation.js": utf8.encode("throw new Error('must not execute');"),
  "schemas/player.json": utf8.encode("{}"),
};

function manifest(): ReleaseManifestV1 {
  return {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 2 },
    aggregateSchemas: [
      { id: "puzzle.player", kind: "player", version: 3, path: "schemas/player.json" },
    ],
    capabilities: [{ id: "plotpoint.media.playback", major: 1, minimumMinor: 0 }],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: Object.entries(payloads).map(([path, bytes]) => ({
      path,
      kind:
        path === "bundles/logic.js"
          ? ("logic-bundle" as const)
          : path === "bundles/presentation.js"
            ? ("presentation-bundle" as const)
            : path === "schemas/player.json"
              ? ("aggregate-schema" as const)
              : ("asset" as const),
      byteLength: bytes.byteLength,
      digest: sha256Digest(bytes),
    })),
  };
}

function archive(value: unknown = manifest(), entries = payloads): Uint8Array {
  const encoded = encodeCanonicalJson(value);
  if (encoded.kind === "invalid") throw new Error("fixture manifest must encode");
  const releaseEntries: StoredZipEntry[] = [
    { path: "manifest.json", bytes: encoded.document.bytes },
    ...Object.entries(entries).map(([path, bytes]) => ({ path, bytes })),
  ];
  const written = writeStoredZip(releaseEntries);
  if (written.kind === "invalid") throw new Error("fixture release must write");
  return written.bytes;
}

describe("bounded non-executing release inspection", () => {
  it("returns complete compatibility and inventory metadata plus computed byte identity", async () => {
    delete (globalThis as { __inspectionExecuted?: boolean }).__inspectionExecuted;
    const bytes = archive();

    await expect(inspectRelease(bytes)).resolves.toEqual({
      kind: "inspected",
      releaseId: computeReleaseId(bytes),
      manifest: manifest(),
    });
    expect((globalThis as { __inspectionExecuted?: boolean }).__inspectionExecuted).toBeUndefined();
  });

  it.each([
    ["root", { ...manifest(), label: "latest" }],
    ["host API", { ...manifest(), hostApi: { ...manifest().hostApi, channel: "stable" } }],
    [
      "inventory entry",
      {
        ...manifest(),
        inventory: [
          { ...manifest().inventory[0], role: "primary" },
          ...manifest().inventory.slice(1),
        ],
      },
    ],
  ])("rejects unknown fields in the closed %s manifest shape", async (_name, value) => {
    await expect(inspectRelease(archive(value))).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "manifest-invalid" }],
    });
  });

  it("rejects undeclared inventory role entries and role-swapped entrypoints", async () => {
    const value = manifest();
    const extraSchema = utf8.encode("{}");
    const extraPath = "schemas/team.json";
    const withUndeclaredRole = {
      ...value,
      inventory: [
        ...value.inventory,
        {
          path: extraPath,
          kind: "aggregate-schema" as const,
          byteLength: extraSchema.byteLength,
          digest: sha256Digest(extraSchema),
        },
      ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
    };

    await expect(
      inspectRelease(archive(withUndeclaredRole, { ...payloads, [extraPath]: extraSchema })),
    ).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "manifest-invalid", details: { reason: "undeclared-role-entry" } }],
    });
    await expect(
      inspectRelease(
        archive({
          ...value,
          entrypoints: {
            logic: value.entrypoints.presentation,
            presentation: value.entrypoints.logic,
          },
        }),
      ),
    ).resolves.toMatchObject({ kind: "invalid", diagnostics: [{ code: "manifest-invalid" }] });
  });

  it("enforces manifest and artifact bounds without reading or executing payload code", async () => {
    const bytes = archive();

    await expect(inspectRelease(bytes, { maxManifestBytes: 1 })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "manifest-limit-exceeded" }],
    });
    await expect(inspectRelease(bytes, { maxEntries: 1 })).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-limit-exceeded" }],
    });
  });
});
