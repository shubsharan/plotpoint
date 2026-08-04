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
const logic = utf8.encode("globalThis.__plotpointExecuted = true;");
const presentation = utf8.encode("export const view = 'puzzle';");
const content = utf8.encode('{"clue":"alpha"}');

function fixture(): { readonly manifest: ReleaseManifestV1; readonly entries: StoredZipEntry[] } {
  const inventory = [
    { path: "bundles/logic.js", kind: "logic-bundle" as const, bytes: logic },
    { path: "bundles/presentation.js", kind: "presentation-bundle" as const, bytes: presentation },
    { path: "content/clue.json", kind: "content" as const, bytes: content },
  ].map(({ path, kind, bytes }) => ({
    path,
    kind,
    byteLength: bytes.byteLength,
    digest: sha256Digest(bytes),
  }));
  const manifest: ReleaseManifestV1 = {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [],
    capabilities: [],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory,
  };
  const encoded = encodeCanonicalJson(manifest);
  if (encoded.kind === "invalid") throw new Error("test manifest must encode");
  return {
    manifest,
    entries: [
      { path: "manifest.json", bytes: encoded.document.bytes },
      { path: "bundles/logic.js", bytes: logic },
      { path: "bundles/presentation.js", bytes: presentation },
      { path: "content/clue.json", bytes: content },
    ],
  };
}

describe("strict release-format v1 container", () => {
  it("writes byte-identical stored archives in ordinal path order", () => {
    const { entries } = fixture();
    const forward = writeStoredZip(entries);
    const reverse = writeStoredZip([...entries].reverse());

    expect(forward.kind).toBe("written");
    expect(reverse.kind).toBe("written");
    if (forward.kind === "written" && reverse.kind === "written") {
      expect(forward.bytes).toEqual(reverse.bytes);
      const local = new DataView(
        forward.bytes.buffer,
        forward.bytes.byteOffset,
        forward.bytes.byteLength,
      );
      expect(local.getUint32(0, true)).toBe(0x04034b50);
      expect(local.getUint16(4, true)).toBe(20);
      expect(local.getUint16(6, true)).toBe(0x0800); // UTF-8 is the only flag.
      expect(local.getUint16(8, true)).toBe(0); // Stored, never compressed.
      expect(local.getUint16(10, true)).toBe(0);
      expect(local.getUint16(12, true)).toBe(0x0021); // DOS epoch.
      expect(local.getUint16(28, true)).toBe(0); // No extra metadata.
      expect(new TextDecoder().decode(forward.bytes)).not.toContain("latest");
    }
  });

  it("rejects invalid and duplicate entry paths before writing", () => {
    expect(writeStoredZip([{ path: "../escape", bytes: new Uint8Array() }]).kind).toBe("invalid");
    expect(
      writeStoredZip([
        { path: "same.txt", bytes: new Uint8Array() },
        { path: "same.txt", bytes: new Uint8Array() },
      ]).kind,
    ).toBe("invalid");
  });

  it("inspects manifest, exact inventory, and whole-file identity without executing payloads", async () => {
    delete (globalThis as { __plotpointExecuted?: boolean }).__plotpointExecuted;
    const { entries, manifest } = fixture();
    const written = writeStoredZip(entries);
    if (written.kind === "invalid") throw new Error("fixture archive must write");

    const result = await inspectRelease(written.bytes);

    expect(result).toEqual({
      kind: "inspected",
      releaseId: computeReleaseId(written.bytes),
      manifest,
    });
    expect((globalThis as { __plotpointExecuted?: boolean }).__plotpointExecuted).toBeUndefined();
  });

  it("rejects non-release and bounded/truncated inputs without throwing", async () => {
    await expect(inspectRelease(utf8.encode("not a zip"))).resolves.toMatchObject({
      kind: "invalid",
    });
    const written = writeStoredZip(fixture().entries);
    if (written.kind === "invalid") throw new Error("fixture archive must write");
    await expect(
      inspectRelease(written.bytes.subarray(0, written.bytes.length - 1)),
    ).resolves.toMatchObject({
      kind: "invalid",
    });
    await expect(
      inspectRelease(written.bytes, { maxArtifactBytes: written.bytes.length - 1 }),
    ).resolves.toMatchObject({ kind: "invalid" });
  });
});
