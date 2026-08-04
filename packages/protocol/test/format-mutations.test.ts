import { describe, expect, it } from "vitest";

import { inspectRelease, type ReleaseManifestV1 } from "@plotpoint/protocol";

import { encodeCanonicalJson } from "../src/release/canonical-json.js";
import { sha256Digest } from "../src/release/identity.js";
import { parseStoredZip, writeStoredZip, type StoredZipEntry } from "../src/release/zip-profile.js";

const utf8 = new TextEncoder();
const a = utf8.encode("export const a = 1;");
const b = utf8.encode("export const b = 2;");

function manifest(): ReleaseManifestV1 {
  return {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [],
    capabilities: [],
    entrypoints: { logic: "a.js", presentation: "b.js" },
    inventory: [
      { path: "a.js", kind: "logic-bundle", byteLength: a.byteLength, digest: sha256Digest(a) },
      {
        path: "b.js",
        kind: "presentation-bundle",
        byteLength: b.byteLength,
        digest: sha256Digest(b),
      },
    ],
  };
}

function releaseEntries(manifestBytes?: Uint8Array): StoredZipEntry[] {
  let encoded = manifestBytes;
  if (encoded === undefined) {
    const result = encodeCanonicalJson(manifest());
    if (result.kind === "invalid") throw new Error("fixture manifest must encode");
    encoded = result.document.bytes;
  }
  return [
    { path: "manifest.json", bytes: encoded },
    { path: "a.js", bytes: a },
    { path: "b.js", bytes: b },
  ];
}

function archive(entries = releaseEntries()): Uint8Array {
  const result = writeStoredZip(entries);
  if (result.kind === "invalid") throw new Error("fixture archive must write");
  return result.bytes;
}

interface CentralRecord {
  readonly offset: number;
  readonly length: number;
  readonly localOffset: number;
  readonly nameLength: number;
}

function layout(bytes: Uint8Array): {
  readonly centralOffset: number;
  readonly endOffset: number;
  readonly records: readonly CentralRecord[];
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.byteLength - 22;
  const count = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const records: CentralRecord[] = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(offset + 28, true);
    const length =
      46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    records.push({
      offset,
      length,
      localOffset: view.getUint32(offset + 42, true),
      nameLength,
    });
    offset += length;
  }
  return { centralOffset, endOffset, records };
}

function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("strict release container mutations", () => {
  it("rejects duplicate and reordered central-directory paths", () => {
    const original = archive();
    const { centralOffset, endOffset, records } = layout(original);
    const duplicate = copy(original);
    duplicate.set(
      duplicate.subarray(records[0]!.offset + 46, records[0]!.offset + 46 + records[0]!.nameLength),
      records[1]!.offset + 46,
    );

    expect(parseStoredZip(duplicate)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-entry-order-invalid" }],
    });

    const reordered = copy(original);
    const central = original.subarray(centralOffset, endOffset);
    const first = records[0]!;
    const second = records[1]!;
    reordered.set(central.subarray(first.length, first.length + second.length), centralOffset);
    reordered.set(central.subarray(0, first.length), centralOffset + second.length);
    expect(parseStoredZip(reordered)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-entry-order-invalid" }],
    });
  });

  it("rejects duplicate or reordered local names despite an ordinal central directory", () => {
    const original = archive();
    const { records } = layout(original);
    const duplicateLocal = copy(original);
    const first = records[0]!;
    const second = records[1]!;
    duplicateLocal.set(
      duplicateLocal.subarray(first.localOffset + 30, first.localOffset + 30 + first.nameLength),
      second.localOffset + 30,
    );
    expect(parseStoredZip(duplicateLocal)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-entry-invalid" }],
    });

    const reorderedLocal = copy(original);
    view(reorderedLocal).setUint32(first.offset + 42, second.localOffset, true);
    view(reorderedLocal).setUint32(second.offset + 42, first.localOffset, true);
    expect(parseStoredZip(reorderedLocal)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-structure-invalid" }],
    });
  });

  it("rejects manifest inventory entries that are missing or have unexpected archive peers", async () => {
    await expect(
      inspectRelease(archive(releaseEntries().filter(({ path }) => path !== "b.js"))),
    ).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "inventory-set-mismatch" }],
    });
    await expect(
      inspectRelease(
        archive([...releaseEntries(), { path: "extra.bin", bytes: Uint8Array.from([1]) }]),
      ),
    ).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "inventory-set-mismatch" }],
    });
  });

  it("rejects truncated, overlapping, and trailing archive regions", () => {
    const original = archive();
    const { records } = layout(original);
    expect(parseStoredZip(original.subarray(0, original.byteLength - 1)).kind).toBe("invalid");

    const overlapping = copy(original);
    view(overlapping).setUint32(records[1]!.offset + 42, records[0]!.localOffset + 1, true);
    expect(parseStoredZip(overlapping)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-structure-invalid" }],
    });

    const trailing = new Uint8Array(original.byteLength + 1);
    trailing.set(original);
    expect(parseStoredZip(trailing)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-structure-invalid" }],
    });
  });

  it("rejects unsupported header fields and forbidden archive paths", () => {
    const original = archive();
    const { records } = layout(original);
    const unsupported = copy(original);
    view(unsupported).setUint16(records[0]!.offset + 10, 8, true);
    expect(parseStoredZip(unsupported)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-profile-unsupported" }],
    });

    const mismatchedNameLength = copy(original);
    view(mismatchedNameLength).setUint16(
      records[0]!.localOffset + 26,
      records[0]!.nameLength + 1,
      true,
    );
    expect(parseStoredZip(mismatchedNameLength)).toMatchObject({
      kind: "invalid",
      diagnostics: [
        {
          code: "zip-profile-unsupported",
          details: { reason: "local-central-header-mismatch" },
        },
      ],
    });

    const forbiddenPath = copy(original);
    forbiddenPath.set(utf8.encode("/a.j"), records[0]!.offset + 46);
    expect(parseStoredZip(forbiddenPath)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-entry-invalid" }],
    });
  });

  it("rejects altered payload bytes through CRC-32", () => {
    const mutated = archive();
    const first = layout(mutated).records[0]!;
    const payloadOffset = first.localOffset + 30 + first.nameLength;
    mutated[payloadOffset] = (mutated[payloadOffset] ?? 0) ^ 0xff;

    expect(parseStoredZip(mutated)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-crc-mismatch", path: "a.js" }],
    });
  });

  it("rejects non-canonical manifest bytes even when the ZIP profile and CRC are valid", async () => {
    const noncanonical = utf8.encode(JSON.stringify(manifest(), null, 2));

    await expect(inspectRelease(archive(releaseEntries(noncanonical)))).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "manifest-encoding-invalid", path: "manifest.json" }],
    });
  });
});
