import { describe, expect, it } from "vitest";

import { encodeCanonicalJson } from "../src/release/canonical-json.js";
import { computeReleaseId, sha256Digest } from "../src/release/identity.js";
import type { ReleaseEntryKind, ReleaseId, ReleaseManifest } from "../src/release/types.js";
import { verifyRelease } from "../src/release/verify.js";
import { writeStoredZip, type StoredZipEntry } from "../src/release/zip-profile.js";

const utf8 = new TextEncoder();
const payloads = [
  ["assets/map.svg", "asset", "<svg/>"] as const,
  ["bundles/logic.js", "logic-bundle", "export const logic = {};"] as const,
  ["bundles/presentation.js", "presentation-bundle", "export const view = {};"] as const,
  ["components/map.json", "component-data", '{"id":"map"}'] as const,
  ["content/clue.json", "content", '{"clue":"north"}'] as const,
  ["progressions/main.json", "progression", '{"id":"main"}'] as const,
  ["schemas/command.json", "command-schema", '{"type":"object"}'] as const,
  ["schemas/player.json", "aggregate-schema", '{"type":"object"}'] as const,
] satisfies readonly (readonly [string, ReleaseEntryKind, string])[];

function fixture(overrides: Readonly<Record<string, Uint8Array>> = {}): {
  readonly bytes: Uint8Array;
  readonly manifest: ReleaseManifest;
} {
  const entries = payloads.map(([path, kind, text]) => {
    const bytes = overrides[path] ?? utf8.encode(text);
    return { path, kind, bytes };
  });
  const manifest: ReleaseManifest = {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [
      { id: "fixture.player", kind: "player", version: 1, path: "schemas/player.json" },
    ],
    capabilities: [],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: entries.map(({ path, kind, bytes }) => ({
      path,
      kind,
      byteLength: bytes.byteLength,
      digest: sha256Digest(bytes),
    })),
  };
  const encoded = encodeCanonicalJson(manifest);
  if (encoded.kind === "invalid") throw new Error("fixture manifest must encode");
  const written = writeStoredZip([
    { path: "manifest.json", bytes: encoded.document.bytes },
    ...entries.map(({ path, bytes }) => ({ path, bytes })),
  ]);
  if (written.kind === "invalid") throw new Error("fixture archive must write");
  return { bytes: written.bytes, manifest };
}

function archiveWithOriginalManifest(
  manifest: ReleaseManifest,
  overrides: Readonly<Record<string, Uint8Array>>,
): Uint8Array {
  const encoded = encodeCanonicalJson(manifest);
  if (encoded.kind === "invalid") throw new Error("fixture manifest must encode");
  const entries: StoredZipEntry[] = [
    { path: "manifest.json", bytes: encoded.document.bytes },
    ...payloads.map(([path, , text]) => ({ path, bytes: overrides[path] ?? utf8.encode(text) })),
  ];
  const written = writeStoredZip(entries);
  if (written.kind === "invalid") throw new Error("fixture archive must write");
  return written.bytes;
}

function mutateStoredPayload(bytes: Uint8Array, targetPath: string): Uint8Array {
  const mutated = new Uint8Array(bytes);
  const view = new DataView(mutated.buffer, mutated.byteOffset, mutated.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const payloadOffset = offset + 30 + nameLength + extraLength;
    const path = decoder.decode(mutated.subarray(offset + 30, offset + 30 + nameLength));
    if (path === targetPath) {
      if (size === 0) throw new Error("tamper fixture entries must be non-empty");
      mutated[payloadOffset + Math.floor(size / 2)]! ^= 0x01;
      return mutated;
    }
    offset = payloadOffset + size;
  }
  throw new Error(`missing fixture path ${targetPath}`);
}

describe("release entry tampering", () => {
  it.each(payloads)("rejects a one-byte %s (%s) mutation at the affected path", async (path) => {
    const original = fixture();
    const result = await verifyRelease({ bytes: mutateStoredPayload(original.bytes, path) });

    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-crc-mismatch", path }],
    });
  });

  it.each(payloads)(
    "rejects recomputed container checks for altered %s bytes via SHA-256",
    async (path, _kind, text) => {
      const original = fixture();
      const altered = utf8.encode(text);
      altered[Math.floor(altered.byteLength / 2)]! ^= 0x01;
      const result = await verifyRelease({
        bytes: archiveWithOriginalManifest(original.manifest, { [path]: altered }),
      });

      expect(result).toMatchObject({
        kind: "invalid",
        diagnostics: [{ code: "inventory-digest-mismatch", path }],
      });
    },
  );

  it("rejects an entry whose recomputed container length disagrees with inventory", async () => {
    const original = fixture();
    const path = "content/clue.json";
    const result = await verifyRelease({
      bytes: archiveWithOriginalManifest(original.manifest, {
        [path]: utf8.encode('{"clue":"north!"}'),
      }),
    });
    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "inventory-length-mismatch", path }],
    });
  });

  it("distinguishes structural verification from an exact known identity", async () => {
    const release = fixture();
    await expect(verifyRelease({ bytes: release.bytes })).resolves.toMatchObject({
      kind: "verified",
      trust: "structurally-valid",
      releaseId: computeReleaseId(release.bytes),
    });
    await expect(
      verifyRelease({ bytes: release.bytes, expectedReleaseId: computeReleaseId(release.bytes) }),
    ).resolves.toMatchObject({
      kind: "verified",
      trust: "known-release-match",
    });
    await expect(
      verifyRelease({
        bytes: release.bytes,
        expectedReleaseId:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000" as ReleaseId,
      }),
    ).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ category: "identity", code: "release-id-mismatch" }],
    });
  });
});
