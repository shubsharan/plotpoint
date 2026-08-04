import { encodeCanonicalJson } from "./canonical-json.js";
import { isSha256Digest } from "./identity.js";
import { compareOrdinal, isCanonicalArchivePath } from "./paths.js";
import type {
  AggregateKind,
  CanonicalJsonObject,
  ReleaseDiagnostic,
  ReleaseEntryKind,
  ReleaseManifestV1,
} from "./types.js";

export type ManifestValidationResult =
  | { readonly kind: "valid"; readonly manifest: ReleaseManifestV1 }
  | { readonly kind: "invalid"; readonly diagnostics: readonly ReleaseDiagnostic[] };

const AGGREGATE_KINDS: ReadonlySet<string> = new Set(["player", "team", "session"]);
const ENTRY_KINDS: ReadonlySet<string> = new Set([
  "logic-bundle",
  "presentation-bundle",
  "aggregate-schema",
  "command-schema",
  "progression",
  "component-data",
  "content",
  "asset",
]);
const ROOT_FIELDS = [
  "aggregateSchemas",
  "capabilities",
  "entrypoints",
  "hostApi",
  "inventory",
  "releaseFormatVersion",
] as const;

function invalid(
  reason: string,
  path: string,
  details: CanonicalJsonObject = {},
): ManifestValidationResult {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "manifest",
        code: "manifest-invalid",
        path,
        details: Object.freeze({ ...details, reason }),
      }),
    ],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value).sort(compareOrdinal);
  const expected = [...fields].sort(compareOrdinal);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]+$/.test(value);
}

function validateHostApi(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactFields(value, ["major", "minimumMinor"]) &&
    isPositiveInteger(value.major) &&
    isNonNegativeInteger(value.minimumMinor)
  );
}

export function validateReleaseManifest(value: unknown): ManifestValidationResult {
  if (!isObject(value) || !hasExactFields(value, ROOT_FIELDS)) {
    return invalid("invalid-root-shape", "");
  }
  if (value.releaseFormatVersion !== 1)
    return invalid("unsupported-release-format", "/releaseFormatVersion");
  if (!validateHostApi(value.hostApi)) return invalid("invalid-host-api", "/hostApi");
  if (!Array.isArray(value.aggregateSchemas)) return invalid("invalid-array", "/aggregateSchemas");
  if (!Array.isArray(value.capabilities)) return invalid("invalid-array", "/capabilities");
  if (!Array.isArray(value.inventory)) return invalid("invalid-array", "/inventory");
  if (
    !isObject(value.entrypoints) ||
    !hasExactFields(value.entrypoints, ["logic", "presentation"]) ||
    !isCanonicalArchivePath(value.entrypoints.logic as string) ||
    !isCanonicalArchivePath(value.entrypoints.presentation as string) ||
    value.entrypoints.logic === value.entrypoints.presentation
  ) {
    return invalid("invalid-entrypoints", "/entrypoints");
  }

  let previousAggregateKey: string | undefined;
  const aggregatePaths = new Set<string>();
  for (let index = 0; index < value.aggregateSchemas.length; index += 1) {
    const schema = value.aggregateSchemas[index];
    const path = `/aggregateSchemas/${index}`;
    if (
      !isObject(schema) ||
      !hasExactFields(schema, ["id", "kind", "path", "version"]) ||
      !isCanonicalId(schema.id) ||
      typeof schema.kind !== "string" ||
      !AGGREGATE_KINDS.has(schema.kind) ||
      !isPositiveInteger(schema.version) ||
      typeof schema.path !== "string" ||
      !isCanonicalArchivePath(schema.path)
    ) {
      return invalid("invalid-aggregate-schema", path);
    }
    const key = `${schema.id}\0${schema.kind}\0${String(schema.version).padStart(16, "0")}\0${schema.path}`;
    if (previousAggregateKey !== undefined && compareOrdinal(previousAggregateKey, key) >= 0) {
      return invalid("aggregate-schemas-not-ordinal-or-unique", path);
    }
    if (aggregatePaths.has(schema.path))
      return invalid("duplicate-aggregate-schema-path", `${path}/path`);
    previousAggregateKey = key;
    aggregatePaths.add(schema.path);
  }

  let previousCapabilityId: string | undefined;
  for (let index = 0; index < value.capabilities.length; index += 1) {
    const capability = value.capabilities[index];
    const path = `/capabilities/${index}`;
    if (
      !isObject(capability) ||
      !hasExactFields(capability, ["id", "major", "minimumMinor"]) ||
      !isCanonicalId(capability.id) ||
      !(capability.id as string).includes(".") ||
      !isPositiveInteger(capability.major) ||
      !isNonNegativeInteger(capability.minimumMinor)
    ) {
      return invalid("invalid-capability", path);
    }
    if (
      previousCapabilityId !== undefined &&
      compareOrdinal(previousCapabilityId, capability.id as string) >= 0
    ) {
      return invalid("capabilities-not-ordinal-or-unique", path);
    }
    previousCapabilityId = capability.id as string;
  }

  let previousInventoryPath: string | undefined;
  const inventoryByPath = new Map<string, { readonly kind: ReleaseEntryKind }>();
  let logicBundles = 0;
  let presentationBundles = 0;
  for (let index = 0; index < value.inventory.length; index += 1) {
    const entry = value.inventory[index];
    const path = `/inventory/${index}`;
    if (
      !isObject(entry) ||
      !hasExactFields(entry, ["byteLength", "digest", "kind", "path"]) ||
      typeof entry.path !== "string" ||
      !isCanonicalArchivePath(entry.path) ||
      entry.path === "manifest.json" ||
      typeof entry.kind !== "string" ||
      !ENTRY_KINDS.has(entry.kind) ||
      !isNonNegativeInteger(entry.byteLength) ||
      (entry.byteLength as number) > 0xffffffff ||
      typeof entry.digest !== "string" ||
      !isSha256Digest(entry.digest)
    ) {
      return invalid("invalid-inventory-entry", path);
    }
    if (
      previousInventoryPath !== undefined &&
      compareOrdinal(previousInventoryPath, entry.path) >= 0
    ) {
      return invalid("inventory-not-ordinal-or-unique", path);
    }
    previousInventoryPath = entry.path;
    inventoryByPath.set(entry.path, { kind: entry.kind as ReleaseEntryKind });
    if (entry.kind === "logic-bundle") logicBundles += 1;
    if (entry.kind === "presentation-bundle") presentationBundles += 1;
  }

  const entrypoints = value.entrypoints as {
    readonly logic: string;
    readonly presentation: string;
  };
  if (logicBundles !== 1 || inventoryByPath.get(entrypoints.logic)?.kind !== "logic-bundle") {
    return invalid("logic-entrypoint-role-mismatch", "/entrypoints/logic");
  }
  if (
    presentationBundles !== 1 ||
    inventoryByPath.get(entrypoints.presentation)?.kind !== "presentation-bundle"
  ) {
    return invalid("presentation-entrypoint-role-mismatch", "/entrypoints/presentation");
  }
  for (let index = 0; index < value.aggregateSchemas.length; index += 1) {
    const schema = value.aggregateSchemas[index] as {
      readonly path: string;
      readonly kind: AggregateKind;
    };
    if (inventoryByPath.get(schema.path)?.kind !== "aggregate-schema") {
      return invalid("aggregate-schema-role-mismatch", `/aggregateSchemas/${index}/path`);
    }
  }
  for (const [path, entry] of inventoryByPath) {
    if (entry.kind === "aggregate-schema" && !aggregatePaths.has(path)) {
      return invalid("undeclared-role-entry", path, { kind: entry.kind });
    }
  }

  const encoded = encodeCanonicalJson(value);
  if (encoded.kind === "invalid") return invalid("manifest-not-canonicalizable", "");
  return { kind: "valid", manifest: encoded.document.value as unknown as ReleaseManifestV1 };
}
