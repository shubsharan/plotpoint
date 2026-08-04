import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  parseStoredZip,
  writeStoredZip,
  type StoredZipEntry,
  type StoredZipLimits,
} from "../src/release/zip-profile.js";

const BOUNDS_SEED = 0x0670_0001;
const MALFORMED_SEED = 0x0670_0002;
const utf8 = new TextEncoder();

const entrySetArbitrary = fc.uniqueArray(
  fc.record({
    id: fc.integer({ min: 0, max: 10_000 }),
    bytes: fc.uint8Array({ maxLength: 64 }),
  }),
  { minLength: 1, maxLength: 16, selector: ({ id }) => id },
);

function entriesFrom(
  records: readonly { readonly id: number; readonly bytes: Uint8Array }[],
): StoredZipEntry[] {
  return records.map(({ id, bytes }) => ({
    path: `entries/${id.toString().padStart(5, "0")}.bin`,
    bytes,
  }));
}

function writtenBytes(entries: readonly StoredZipEntry[]): Uint8Array {
  const written = writeStoredZip(entries);
  if (written.kind !== "written") throw new Error("generated archive must write");
  return written.bytes;
}

describe("stored ZIP bounds properties", () => {
  it("enforces exact artifact-size and entry-count boundaries with a replayable seed", () => {
    fc.assert(
      fc.property(entrySetArbitrary, (records) => {
        const entries = entriesFrom(records);
        const bytes = writtenBytes(entries);
        const maxEntryBytes = Math.max(...entries.map((entry) => entry.bytes.byteLength));
        const exactLimits: StoredZipLimits = {
          maxEntries: entries.length,
          maxEntryBytes,
          maxArtifactBytes: bytes.byteLength,
        };

        expect(writeStoredZip(entries, exactLimits).kind).toBe("written");
        expect(parseStoredZip(bytes, exactLimits).kind).toBe("parsed");
        expect(
          writeStoredZip(entries, { ...exactLimits, maxEntries: entries.length - 1 }),
        ).toMatchObject({
          kind: "invalid",
          diagnostics: [{ code: "zip-limit-exceeded", details: { reason: "entry-count" } }],
        });
        expect(
          parseStoredZip(bytes, { ...exactLimits, maxEntries: entries.length - 1 }),
        ).toMatchObject({
          kind: "invalid",
          diagnostics: [{ code: "zip-limit-exceeded", details: { reason: "entry-count" } }],
        });
        expect(
          parseStoredZip(bytes, { ...exactLimits, maxArtifactBytes: bytes.byteLength - 1 }),
        ).toMatchObject({
          kind: "invalid",
          diagnostics: [{ code: "zip-limit-exceeded", details: { reason: "artifact-size" } }],
        });
      }),
      { seed: BOUNDS_SEED, numRuns: 150 },
    );
  });

  it("accepts the largest representable path and rejects the next byte", () => {
    const maximumPath = "a".repeat(0xffff);
    expect(writeStoredZip([{ path: maximumPath, bytes: new Uint8Array() }]).kind).toBe("written");
    expect(writeStoredZip([{ path: `${maximumPath}a`, bytes: new Uint8Array() }])).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "zip-limit-exceeded", details: { reason: "path-size" } }],
    });
  });

  it("rejects generated forbidden archive paths with a replayable seed", () => {
    const leaf = fc
      .array(fc.constantFrom("a", "b", "0", "1", "-", "_"), {
        minLength: 1,
        maxLength: 12,
      })
      .map((parts) => parts.join(""));
    const malformedPath = fc.oneof(
      leaf.map((value) => `/${value}`),
      leaf.map((value) => `${value}/`),
      leaf.map((value) => `${value}//child`),
      leaf.map((value) => `${value}/../child`),
      leaf.map((value) => `${value}\\child`),
    );

    fc.assert(
      fc.property(malformedPath, (path) => {
        expect(writeStoredZip([{ path, bytes: utf8.encode("payload") }])).toMatchObject({
          kind: "invalid",
          diagnostics: [{ code: "zip-entry-invalid", path }],
        });
      }),
      { seed: BOUNDS_SEED, numRuns: 100 },
    );
  });

  it("rejects generated truncations and signature corruptions with a replayable seed", () => {
    const archiveArbitrary = entrySetArbitrary.map((records) => writtenBytes(entriesFrom(records)));
    const truncationArbitrary = archiveArbitrary.chain((bytes) =>
      fc.integer({ min: 0, max: bytes.byteLength - 1 }).map((length) => bytes.subarray(0, length)),
    );

    fc.assert(
      fc.property(truncationArbitrary, (truncated) => {
        expect(parseStoredZip(truncated).kind).toBe("invalid");
      }),
      { seed: MALFORMED_SEED, numRuns: 150 },
    );

    fc.assert(
      fc.property(archiveArbitrary, fc.constantFrom("local", "central", "end"), (bytes, region) => {
        const malformed = new Uint8Array(bytes);
        const view = new DataView(malformed.buffer);
        const endOffset = malformed.byteLength - 22;
        const centralOffset = view.getUint32(endOffset + 16, true);
        const offset = region === "local" ? 0 : region === "central" ? centralOffset : endOffset;
        malformed[offset]! ^= 0xff;
        expect(parseStoredZip(malformed).kind).toBe("invalid");
      }),
      { seed: MALFORMED_SEED, numRuns: 150 },
    );
  });
});
