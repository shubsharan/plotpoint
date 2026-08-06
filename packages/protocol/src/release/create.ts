import { encodeCanonicalJson } from "./canonical-json.js";
import { sha256Digest } from "./identity.js";
import { openRelease } from "./open.js";
import { compareOrdinal } from "./paths.js";
import { writeStoredZip } from "./zip-profile.js";
import type {
  InvalidRelease,
  ReleaseArtifact,
  ReleaseConstructionInput,
  ReleaseEntryKind,
  ReleaseManifest,
} from "./types.js";
import { RELEASE_FORMAT_VERSION } from "./types.js";

interface PreparedMaterialEntry {
  readonly path: string;
  readonly kind: ReleaseEntryKind;
  readonly bytes: Uint8Array;
}

function aggregateKey(schema: ReleaseConstructionInput["aggregateSchemas"][number]): string {
  return `${schema.id}\0${schema.kind}\0${String(schema.version).padStart(16, "0")}\0${schema.path}`;
}

function invalid(code: string, reason: string, path?: string): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "format",
        code,
        ...(path === undefined ? {} : { path }),
        details: Object.freeze({ reason }),
      }),
    ],
  };
}

export async function createReleaseArtifact(
  input: ReleaseConstructionInput,
): Promise<ReleaseArtifact | InvalidRelease> {
  const entries: PreparedMaterialEntry[] = [];
  for (const entry of input.entries) {
    let bytes: Uint8Array;
    if (entry.bytes !== undefined) {
      bytes = new Uint8Array(entry.bytes);
    } else {
      const encoded = encodeCanonicalJson(entry.value);
      if (encoded.kind === "invalid") {
        return invalid("release-material-encoding-invalid", "non-canonical-value", entry.path);
      }
      bytes = encoded.document.bytes;
    }
    entries.push(Object.freeze({ path: entry.path, kind: entry.kind, bytes }));
  }
  entries.sort((left, right) => compareOrdinal(left.path, right.path));

  const manifest: ReleaseManifest = {
    releaseFormatVersion: RELEASE_FORMAT_VERSION,
    hostApi: input.hostApi,
    aggregateSchemas: Object.freeze(
      [...input.aggregateSchemas].sort((left, right) =>
        compareOrdinal(aggregateKey(left), aggregateKey(right)),
      ),
    ),
    capabilities: Object.freeze(
      [...input.capabilities].sort((left, right) => compareOrdinal(left.id, right.id)),
    ),
    entrypoints: Object.freeze({ ...input.entrypoints }),
    inventory: Object.freeze(
      entries.map((entry) =>
        Object.freeze({
          path: entry.path,
          kind: entry.kind,
          byteLength: entry.bytes.byteLength,
          digest: sha256Digest(entry.bytes),
        }),
      ),
    ),
  };
  const encodedManifest = encodeCanonicalJson(manifest);
  if (encodedManifest.kind === "invalid") {
    return invalid("release-manifest-encoding-invalid", "non-canonical-manifest", "manifest.json");
  }
  const written = writeStoredZip([
    ...entries.map(({ path, bytes }) => ({ path, bytes })),
    { path: "manifest.json", bytes: encodedManifest.document.bytes },
  ]);
  if (written.kind === "invalid") return written;

  const opened = await openRelease(written.bytes);
  if (opened.kind === "invalid") return opened;
  return Object.freeze({
    bytes: written.bytes,
    manifest: opened.manifest,
    releaseId: opened.releaseId,
  });
}
