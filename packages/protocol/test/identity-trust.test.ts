import { describe, expect, it } from "vitest";

import { computeReleaseId, type ReleaseManifestV1 } from "@plotpoint/protocol";

import { encodeCanonicalJson } from "../src/release/canonical-json.js";
import { sha256Digest } from "../src/release/identity.js";
import { verifyRelease } from "../src/release/verify.js";
import { writeStoredZip, type StoredZipEntry } from "../src/release/zip-profile.js";

const encoder = new TextEncoder();

interface ReleaseFixture {
  readonly bytes: Uint8Array;
  readonly manifest: ReleaseManifestV1;
}

function createRelease(content: Uint8Array): ReleaseFixture {
  const payloads = [
    {
      path: "bundles/logic.js",
      kind: "logic-bundle" as const,
      bytes: encoder.encode("export const logic = true;"),
    },
    {
      path: "bundles/presentation.js",
      kind: "presentation-bundle" as const,
      bytes: encoder.encode("export const presentation = true;"),
    },
    { path: "content/puzzle.json", kind: "content" as const, bytes: content },
  ];
  const manifest: ReleaseManifestV1 = {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [],
    capabilities: [],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: payloads.map(({ path, kind, bytes }) => ({
      path,
      kind,
      byteLength: bytes.byteLength,
      digest: sha256Digest(bytes),
    })),
  };
  const encodedManifest = encodeCanonicalJson(manifest);
  if (encodedManifest.kind !== "valid") throw new Error("fixture manifest must encode");
  const entries: StoredZipEntry[] = [
    { path: "manifest.json", bytes: encodedManifest.document.bytes },
    ...payloads.map(({ path, bytes }) => ({ path, bytes })),
  ];
  const written = writeStoredZip(entries);
  if (written.kind !== "written") throw new Error("fixture release must write");
  return { bytes: written.bytes, manifest };
}

describe("release identity trust", () => {
  it("labels verification without an expected identity as structural consistency only", async () => {
    const release = createRelease(encoder.encode('{"answer":"echo"}'));

    const result = await verifyRelease({ bytes: release.bytes });

    expect(result).toEqual({
      kind: "verified",
      trust: "structurally-valid",
      releaseId: computeReleaseId(release.bytes),
      manifest: release.manifest,
    });
    expect(Object.hasOwn(result, "expectedReleaseId")).toBe(false);
  });

  it("labels an exact trusted expected identity as a known release match", async () => {
    const release = createRelease(encoder.encode('{"answer":"echo"}'));
    const expectedReleaseId = computeReleaseId(release.bytes);

    await expect(verifyRelease({ bytes: release.bytes, expectedReleaseId })).resolves.toEqual({
      kind: "verified",
      trust: "known-release-match",
      releaseId: expectedReleaseId,
      expectedReleaseId,
      manifest: release.manifest,
    });
  });

  it("treats a coordinated payload and manifest rewrite as a different consistent release", async () => {
    const original = createRelease(encoder.encode('{"answer":"echo"}'));
    const rewritten = createRelease(encoder.encode('{"answer":"shadow"}'));
    const originalReleaseId = computeReleaseId(original.bytes);
    const rewrittenReleaseId = computeReleaseId(rewritten.bytes);
    expect(rewrittenReleaseId).not.toBe(originalReleaseId);

    await expect(verifyRelease({ bytes: rewritten.bytes })).resolves.toEqual({
      kind: "verified",
      trust: "structurally-valid",
      releaseId: rewrittenReleaseId,
      manifest: rewritten.manifest,
    });
    await expect(
      verifyRelease({ bytes: rewritten.bytes, expectedReleaseId: originalReleaseId }),
    ).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [
        {
          category: "identity",
          code: "release-id-mismatch",
          relationship: "expected-release-id",
          details: { actual: rewrittenReleaseId, expected: originalReleaseId },
        },
      ],
    });
  });
});
