import { decodeCanonicalJson, DEFAULT_CANONICAL_JSON_LIMITS } from "./canonical-json.js";
import { computeReleaseId, sha256Digest } from "./identity.js";
import { validateReleaseManifest } from "./manifest.js";
import { compareOrdinal } from "./paths.js";
import { DEFAULT_STORED_ZIP_LIMITS, parseStoredZip, type StoredZipLimits } from "./zip-profile.js";
import type { CanonicalJsonObject, InspectedRelease, InvalidRelease } from "./types.js";

export interface ReleaseInspectionLimits extends StoredZipLimits {
  readonly maxManifestBytes: number;
}

export const DEFAULT_RELEASE_INSPECTION_LIMITS: ReleaseInspectionLimits = Object.freeze({
  ...DEFAULT_STORED_ZIP_LIMITS,
  maxManifestBytes: 1024 * 1024,
});

function invalid(
  code: string,
  reason: string,
  path?: string,
  details: CanonicalJsonObject = {},
): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: code.startsWith("manifest") ? "manifest" : "inventory",
        code,
        ...(path === undefined ? {} : { path }),
        details: Object.freeze({ ...details, reason }),
      }),
    ],
  };
}

function limitsFrom(partial: Partial<ReleaseInspectionLimits>): ReleaseInspectionLimits | null {
  const limits = { ...DEFAULT_RELEASE_INSPECTION_LIMITS, ...partial };
  if (!Number.isSafeInteger(limits.maxManifestBytes) || limits.maxManifestBytes < 0) return null;
  return limits;
}

export async function inspectRelease(
  bytes: Uint8Array,
  partialLimits: Partial<ReleaseInspectionLimits> = {},
): Promise<InspectedRelease | InvalidRelease> {
  const limits = limitsFrom(partialLimits);
  if (limits === null) return invalid("inspection-limits-invalid", "invalid-limits");
  const parsed = parseStoredZip(bytes, limits);
  if (parsed.kind === "invalid") return parsed;
  const byPath = new Map(parsed.entries.map((entry) => [entry.path, entry]));
  const manifestEntry = byPath.get("manifest.json");
  if (manifestEntry === undefined)
    return invalid("manifest-missing", "missing-manifest", "manifest.json");
  if (manifestEntry.bytes.byteLength > limits.maxManifestBytes) {
    return invalid("manifest-limit-exceeded", "manifest-size", "manifest.json");
  }
  const decoded = decodeCanonicalJson(manifestEntry.bytes, {
    ...DEFAULT_CANONICAL_JSON_LIMITS,
    maxBytes: limits.maxManifestBytes,
  });
  if (decoded.kind === "invalid") {
    return invalid("manifest-encoding-invalid", "non-canonical-manifest", "manifest.json", {
      cause: decoded.diagnostic.details,
    });
  }
  const validated = validateReleaseManifest(decoded.document.value);
  if (validated.kind === "invalid") return validated;
  const manifest = validated.manifest;

  const actualPaths = parsed.entries.map((entry) => entry.path);
  const expectedPaths = ["manifest.json", ...manifest.inventory.map((entry) => entry.path)].sort(
    compareOrdinal,
  );
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    return invalid("inventory-set-mismatch", "missing-or-unexpected-entry");
  }
  for (const expected of manifest.inventory) {
    const actual = byPath.get(expected.path);
    if (actual === undefined)
      return invalid("inventory-entry-missing", "missing-entry", expected.path);
    if (actual.bytes.byteLength !== expected.byteLength) {
      return invalid("inventory-length-mismatch", "byte-length-mismatch", expected.path, {
        actual: actual.bytes.byteLength,
        expected: expected.byteLength,
      });
    }
    const digest = sha256Digest(actual.bytes);
    if (digest !== expected.digest) {
      return invalid("inventory-digest-mismatch", "sha256-mismatch", expected.path, {
        actual: digest,
        expected: expected.digest,
      });
    }
  }
  return Object.freeze({ kind: "inspected", releaseId: computeReleaseId(bytes), manifest });
}
