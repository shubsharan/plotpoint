import { crc32 } from "./identity.js";
import { compareOrdinal, isCanonicalArchivePath } from "./paths.js";
import type { CanonicalJsonObject, InvalidRelease, ReleaseDiagnostic } from "./types.js";

export interface StoredZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ParsedStoredZipEntry extends StoredZipEntry {
  readonly crc32: number;
}

export interface StoredZipLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxArtifactBytes: number;
}

export type ZipWriteResult =
  | { readonly kind: "written"; readonly bytes: Uint8Array }
  | InvalidRelease;

export type ZipParseResult =
  | { readonly kind: "parsed"; readonly entries: readonly ParsedStoredZipEntry[] }
  | InvalidRelease;

export const DEFAULT_STORED_ZIP_LIMITS: StoredZipLimits = Object.freeze({
  maxEntries: 4_096,
  maxEntryBytes: 64 * 1024 * 1024,
  maxArtifactBytes: 256 * 1024 * 1024,
});

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 0x0314;
const UTF8_FLAG = 0x0800;
const DOS_EPOCH_DATE = 0x0021;
const REGULAR_FILE_MODE = 0x81a40000;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function diagnostic(
  code: string,
  reason: string,
  path?: string,
  details: CanonicalJsonObject = {},
): ReleaseDiagnostic {
  return Object.freeze({
    category: "format",
    code,
    ...(path === undefined ? {} : { path }),
    details: Object.freeze({ ...details, reason }),
  });
}

function invalid(
  code: string,
  reason: string,
  path?: string,
  details?: CanonicalJsonObject,
): InvalidRelease {
  return { kind: "invalid", diagnostics: [diagnostic(code, reason, path, details)] };
}

function validLimits(limits: StoredZipLimits): boolean {
  return (
    Number.isSafeInteger(limits.maxEntries) &&
    limits.maxEntries >= 0 &&
    limits.maxEntries <= MAX_UINT16 &&
    Number.isSafeInteger(limits.maxEntryBytes) &&
    limits.maxEntryBytes >= 0 &&
    limits.maxEntryBytes <= MAX_UINT32 &&
    Number.isSafeInteger(limits.maxArtifactBytes) &&
    limits.maxArtifactBytes >= 22 &&
    limits.maxArtifactBytes <= MAX_UINT32
  );
}

function uint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function uint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function concat(parts: readonly Uint8Array[], byteLength: number): Uint8Array {
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

interface PreparedEntry extends StoredZipEntry {
  readonly name: Uint8Array;
  readonly crc: number;
  readonly localOffset: number;
}

export function writeStoredZip(
  sourceEntries: readonly StoredZipEntry[],
  limits: StoredZipLimits = DEFAULT_STORED_ZIP_LIMITS,
): ZipWriteResult {
  if (!validLimits(limits)) return invalid("zip-limits-invalid", "invalid-limits");
  if (!Array.isArray(sourceEntries)) return invalid("zip-input-invalid", "entries-not-array");
  if (sourceEntries.length > limits.maxEntries) return invalid("zip-limit-exceeded", "entry-count");

  for (const candidate of sourceEntries as readonly unknown[]) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      !("path" in candidate) ||
      typeof candidate.path !== "string" ||
      !("bytes" in candidate) ||
      !(candidate.bytes instanceof Uint8Array)
    ) {
      return invalid("zip-entry-invalid", "invalid-entry");
    }
  }
  const entries = [...sourceEntries].sort((left, right) => compareOrdinal(left.path, right.path));
  const prepared: PreparedEntry[] = [];
  let localOffset = 0;
  let previousPath: string | undefined;
  for (const entry of entries) {
    if (!isCanonicalArchivePath(entry.path) || !(entry.bytes instanceof Uint8Array)) {
      return invalid("zip-entry-invalid", "invalid-entry", entry.path);
    }
    if (entry.path === previousPath)
      return invalid("zip-entry-duplicate", "duplicate-path", entry.path);
    if (entry.bytes.byteLength > limits.maxEntryBytes || entry.bytes.byteLength > MAX_UINT32) {
      return invalid("zip-limit-exceeded", "entry-size", entry.path);
    }
    const name = textEncoder.encode(entry.path);
    if (name.byteLength > MAX_UINT16) return invalid("zip-limit-exceeded", "path-size", entry.path);
    const localLength = 30 + name.byteLength + entry.bytes.byteLength;
    if (localOffset + localLength > MAX_UINT32)
      return invalid("zip-limit-exceeded", "local-offset", entry.path);
    prepared.push({ ...entry, name, crc: crc32(entry.bytes), localOffset });
    localOffset += localLength;
    previousPath = entry.path;
  }

  const centralParts: Uint8Array[] = [];
  let centralSize = 0;
  const localParts: Uint8Array[] = [];
  for (const entry of prepared) {
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    uint32(localView, 0, LOCAL_SIGNATURE);
    uint16(localView, 4, VERSION_NEEDED);
    uint16(localView, 6, UTF8_FLAG);
    uint16(localView, 8, 0);
    uint16(localView, 10, 0);
    uint16(localView, 12, DOS_EPOCH_DATE);
    uint32(localView, 14, entry.crc);
    uint32(localView, 18, entry.bytes.byteLength);
    uint32(localView, 22, entry.bytes.byteLength);
    uint16(localView, 26, entry.name.byteLength);
    uint16(localView, 28, 0);
    localParts.push(localHeader, entry.name, entry.bytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    uint32(centralView, 0, CENTRAL_SIGNATURE);
    uint16(centralView, 4, VERSION_MADE_BY);
    uint16(centralView, 6, VERSION_NEEDED);
    uint16(centralView, 8, UTF8_FLAG);
    uint16(centralView, 10, 0);
    uint16(centralView, 12, 0);
    uint16(centralView, 14, DOS_EPOCH_DATE);
    uint32(centralView, 16, entry.crc);
    uint32(centralView, 20, entry.bytes.byteLength);
    uint32(centralView, 24, entry.bytes.byteLength);
    uint16(centralView, 28, entry.name.byteLength);
    uint16(centralView, 30, 0);
    uint16(centralView, 32, 0);
    uint16(centralView, 34, 0);
    uint16(centralView, 36, 0);
    uint32(centralView, 38, REGULAR_FILE_MODE);
    uint32(centralView, 42, entry.localOffset);
    centralParts.push(centralHeader, entry.name);
    centralSize += centralHeader.byteLength + entry.name.byteLength;
  }

  const totalLength = localOffset + centralSize + 22;
  if (totalLength > limits.maxArtifactBytes || totalLength > MAX_UINT32) {
    return invalid("zip-limit-exceeded", "artifact-size");
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  uint32(endView, 0, END_SIGNATURE);
  uint16(endView, 4, 0);
  uint16(endView, 6, 0);
  uint16(endView, 8, prepared.length);
  uint16(endView, 10, prepared.length);
  uint32(endView, 12, centralSize);
  uint32(endView, 16, localOffset);
  uint16(endView, 20, 0);
  return { kind: "written", bytes: concat([...localParts, ...centralParts, end], totalLength) };
}

function canRead(bytes: Uint8Array, offset: number, length: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    length >= 0 &&
    offset + length <= bytes.byteLength
  );
}

function read16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function read32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

interface CentralEntry {
  readonly path: string;
  readonly crc: number;
  readonly size: number;
  readonly localOffset: number;
  readonly nameLength: number;
}

export function parseStoredZip(
  bytes: Uint8Array,
  limits: StoredZipLimits = DEFAULT_STORED_ZIP_LIMITS,
): ZipParseResult {
  if (!validLimits(limits)) return invalid("zip-limits-invalid", "invalid-limits");
  if (!(bytes instanceof Uint8Array)) return invalid("zip-input-invalid", "invalid-byte-sequence");
  if (bytes.byteLength > limits.maxArtifactBytes)
    return invalid("zip-limit-exceeded", "artifact-size");
  if (bytes.byteLength < 22) return invalid("zip-structure-invalid", "missing-end-record");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.byteLength - 22;
  if (read32(view, endOffset) !== END_SIGNATURE)
    return invalid("zip-structure-invalid", "invalid-end-record");
  if (
    read16(view, endOffset + 4) !== 0 ||
    read16(view, endOffset + 6) !== 0 ||
    read16(view, endOffset + 8) !== read16(view, endOffset + 10) ||
    read16(view, endOffset + 20) !== 0
  ) {
    return invalid("zip-profile-unsupported", "unsupported-end-record");
  }
  const entryCount = read16(view, endOffset + 10);
  const centralSize = read32(view, endOffset + 12);
  const centralOffset = read32(view, endOffset + 16);
  if (entryCount > limits.maxEntries) return invalid("zip-limit-exceeded", "entry-count");
  if (!canRead(bytes, centralOffset, centralSize) || centralOffset + centralSize !== endOffset)
    return invalid("zip-structure-invalid", "central-directory-bounds");

  const centralEntries: CentralEntry[] = [];
  let cursor = centralOffset;
  let previousPath: string | undefined;
  let previousLocalOffset: number | undefined;
  for (let index = 0; index < entryCount; index += 1) {
    if (!canRead(bytes, cursor, 46) || read32(view, cursor) !== CENTRAL_SIGNATURE) {
      return invalid("zip-structure-invalid", "invalid-central-header");
    }
    const nameLength = read16(view, cursor + 28);
    const extraLength = read16(view, cursor + 30);
    const commentLength = read16(view, cursor + 32);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (!canRead(bytes, cursor, recordLength))
      return invalid("zip-structure-invalid", "truncated-central-header");
    if (
      read16(view, cursor + 4) !== VERSION_MADE_BY ||
      read16(view, cursor + 6) !== VERSION_NEEDED ||
      read16(view, cursor + 8) !== UTF8_FLAG ||
      read16(view, cursor + 10) !== 0 ||
      read16(view, cursor + 12) !== 0 ||
      read16(view, cursor + 14) !== DOS_EPOCH_DATE ||
      extraLength !== 0 ||
      commentLength !== 0 ||
      read16(view, cursor + 34) !== 0 ||
      read16(view, cursor + 36) !== 0 ||
      read32(view, cursor + 38) !== REGULAR_FILE_MODE
    ) {
      return invalid("zip-profile-unsupported", "unsupported-central-header");
    }
    const compressedSize = read32(view, cursor + 20);
    const size = read32(view, cursor + 24);
    if (compressedSize !== size || size > limits.maxEntryBytes)
      return invalid("zip-profile-unsupported", "invalid-entry-size");
    let path: string;
    try {
      path = textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      return invalid("zip-entry-invalid", "invalid-path-encoding");
    }
    if (!isCanonicalArchivePath(path)) return invalid("zip-entry-invalid", "invalid-path", path);
    if (previousPath !== undefined && compareOrdinal(previousPath, path) >= 0) {
      return invalid("zip-entry-order-invalid", "non-ordinal-or-duplicate-path", path);
    }
    const localOffset = read32(view, cursor + 42);
    if (
      localOffset >= centralOffset ||
      (previousLocalOffset !== undefined && localOffset <= previousLocalOffset)
    ) {
      return invalid("zip-structure-invalid", "invalid-local-offset", path);
    }
    centralEntries.push({
      path,
      crc: read32(view, cursor + 16),
      size,
      localOffset,
      nameLength,
    });
    previousPath = path;
    previousLocalOffset = localOffset;
    cursor += recordLength;
  }
  if (cursor !== endOffset)
    return invalid("zip-structure-invalid", "central-directory-size-mismatch");

  const parsed: ParsedStoredZipEntry[] = [];
  cursor = 0;
  for (const entry of centralEntries) {
    if (
      cursor !== entry.localOffset ||
      !canRead(bytes, cursor, 30) ||
      read32(view, cursor) !== LOCAL_SIGNATURE
    ) {
      return invalid("zip-structure-invalid", "invalid-local-offset", entry.path);
    }
    const nameLength = read16(view, cursor + 26);
    const extraLength = read16(view, cursor + 28);
    const headerLength = 30 + nameLength + extraLength;
    if (
      !canRead(bytes, cursor, headerLength + entry.size) ||
      cursor + headerLength + entry.size > centralOffset
    ) {
      return invalid("zip-structure-invalid", "truncated-or-overlapping-entry", entry.path);
    }
    if (
      read16(view, cursor + 4) !== VERSION_NEEDED ||
      read16(view, cursor + 6) !== UTF8_FLAG ||
      read16(view, cursor + 8) !== 0 ||
      read16(view, cursor + 10) !== 0 ||
      read16(view, cursor + 12) !== DOS_EPOCH_DATE ||
      nameLength !== entry.nameLength ||
      extraLength !== 0 ||
      read32(view, cursor + 14) !== entry.crc ||
      read32(view, cursor + 18) !== entry.size ||
      read32(view, cursor + 22) !== entry.size
    ) {
      return invalid("zip-profile-unsupported", "local-central-header-mismatch", entry.path);
    }
    const nameBytes = bytes.subarray(cursor + 30, cursor + 30 + nameLength);
    let localPath: string;
    try {
      localPath = textDecoder.decode(nameBytes);
    } catch {
      return invalid("zip-entry-invalid", "invalid-local-path-encoding", entry.path);
    }
    if (localPath !== entry.path)
      return invalid("zip-entry-invalid", "local-path-mismatch", entry.path);
    const payload = bytes.subarray(cursor + headerLength, cursor + headerLength + entry.size);
    if (crc32(payload) !== entry.crc)
      return invalid("zip-crc-mismatch", "crc-mismatch", entry.path);
    parsed.push(Object.freeze({ path: entry.path, bytes: payload, crc32: entry.crc }));
    cursor += headerLength + entry.size;
  }
  if (cursor !== centralOffset)
    return invalid("zip-structure-invalid", "local-region-size-mismatch");
  return { kind: "parsed", entries: Object.freeze(parsed) };
}
