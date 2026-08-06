import { describe, expect, it } from "vitest";

import { computeReleaseId, inspectRelease, type ReleaseManifest } from "@plotpoint/protocol";
import * as protocol from "@plotpoint/protocol";

import { encodeCanonicalJson } from "../src/release/canonical-json.js";
import { sha256Digest } from "../src/release/identity.js";
import { writeStoredZip, type StoredZipEntry } from "../src/release/zip-profile.js";

const utf8 = new TextEncoder();
const payloads: Readonly<Record<string, Uint8Array>> = {
  "assets/map.webp": Uint8Array.from([1, 2, 3]),
  "bundles/logic.js": utf8.encode("globalThis.__inspectionExecuted = true;"),
  "bundles/presentation.js": utf8.encode("throw new Error('must not execute');"),
  "schemas/player.json": utf8.encode("{}"),
};

const gameComposition = {
  application: { components: ["field-view"] },
  aggregateModels: [
    {
      id: "puzzle.player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "puzzle.player" },
      initializationSchema: { id: "puzzle.player" },
      events: [],
      effects: [],
    },
  ],
  commands: [],
  progressions: [],
  components: [
    {
      id: "field-view",
      commands: [],
      content: [],
      assets: ["field-map"],
      capabilities: [{ id: "plotpoint.media.playback", major: 1, minimumMinor: 0 }],
    },
  ],
  resources: [
    { id: "field-map", role: "asset", path: "assets/map.webp" },
    {
      id: "field-view",
      role: "component-descriptor",
      path: "composition/components/field-view.json",
    },
    { id: "puzzle.player", role: "schema", path: "schemas/player.json" },
  ],
} as const;

function jsonBytes(value: unknown): Uint8Array {
  const encoded = encodeCanonicalJson(value);
  if (encoded.kind === "invalid") throw new Error("fixture JSON must encode");
  return encoded.document.bytes;
}

function gamePayloads(
  composition: unknown = gameComposition,
): Readonly<Record<string, Uint8Array>> {
  return {
    ...payloads,
    "composition/components/field-view.json": jsonBytes({ id: "field-view" }),
    "composition/game.json": jsonBytes(composition),
  };
}

function manifest(): ReleaseManifest {
  return {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 2 },
    aggregateSchemas: [{ id: "puzzle.player", kind: "player", path: "schemas/player.json" }],
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

function gameManifest(entries = gamePayloads()): ReleaseManifest {
  return {
    ...manifest(),
    hostApi: { major: 1, minimumMinor: 1 },
    inventory: Object.entries(entries)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, bytes]) => ({
        path,
        kind:
          path === "bundles/logic.js"
            ? ("logic-bundle" as const)
            : path === "bundles/presentation.js"
              ? ("presentation-bundle" as const)
              : path === "schemas/player.json"
                ? ("aggregate-schema" as const)
                : path === "composition/components/field-view.json"
                  ? ("component-data" as const)
                  : path === "composition/game.json"
                    ? ("content" as const)
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
    await expect(inspectRelease(bytes)).resolves.not.toHaveProperty("gameComposition");
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

describe("mandatory composition-aware game inspection", () => {
  function inspectGame(bytes: Uint8Array): Promise<unknown> {
    const inspector = (
      protocol as unknown as {
        readonly inspectGameRelease?: (artifact: Uint8Array) => Promise<unknown>;
      }
    ).inspectGameRelease;
    expect(inspector, "composition-aware inspector export").toBeTypeOf("function");
    if (inspector === undefined) throw new Error("game-composition-inspector-missing");
    return inspector(bytes);
  }

  it("returns one mandatory plain Game Composition beside low-level release inspection", async () => {
    const entries = gamePayloads();
    const value = gameManifest(entries);
    const bytes = archive(value, entries);

    await expect(inspectGame(bytes)).resolves.toEqual({
      release: {
        kind: "inspected",
        releaseId: computeReleaseId(bytes),
        manifest: value,
      },
      gameComposition,
    });
  });

  it("rejects missing, superseded versioned, and inventory-inconsistent catalogs", async () => {
    const versionedEntries = gamePayloads({ version: 1, ...gameComposition });
    const inconsistentEntries = gamePayloads({
      ...gameComposition,
      resources: [
        ...gameComposition.resources,
        { id: "missing", role: "content", path: "content/missing.json" },
      ],
    });

    for (const bytes of [
      archive(),
      archive(gameManifest(versionedEntries), versionedEntries),
      archive(gameManifest(inconsistentEntries), inconsistentEntries),
    ]) {
      await expect(inspectGame(bytes)).resolves.toMatchObject({ kind: "invalid" });
    }
  });
});
