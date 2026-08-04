import type { CanonicalJsonObject, CanonicalJsonValue, ReleaseDiagnostic } from "./types.js";

export interface CanonicalJsonLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxBytes: number;
}

export interface CanonicalJsonDocument {
  readonly value: CanonicalJsonValue;
  readonly text: string;
  readonly bytes: Uint8Array;
}

export type CanonicalJsonResult =
  | { readonly kind: "valid"; readonly document: CanonicalJsonDocument }
  | { readonly kind: "invalid"; readonly diagnostic: ReleaseDiagnostic };

export const DEFAULT_CANONICAL_JSON_LIMITS: CanonicalJsonLimits = Object.freeze({
  maxDepth: 128,
  maxNodes: 100_000,
  maxBytes: 16 * 1024 * 1024,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function invalid(reason: string, path = ""): CanonicalJsonResult {
  return {
    kind: "invalid",
    diagnostic: Object.freeze({
      category: "format",
      code: "canonical-json-invalid",
      path,
      details: Object.freeze({ path, reason }),
    }),
  };
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function validLimits(limits: CanonicalJsonLimits): boolean {
  return (
    Number.isSafeInteger(limits.maxDepth) &&
    limits.maxDepth >= 0 &&
    Number.isSafeInteger(limits.maxNodes) &&
    limits.maxNodes >= 1 &&
    Number.isSafeInteger(limits.maxBytes) &&
    limits.maxBytes >= 0
  );
}

interface CloneState {
  nodes: number;
  readonly active: WeakSet<object>;
  readonly limits: CanonicalJsonLimits;
}

type CloneResult =
  | { readonly kind: "value"; readonly value: CanonicalJsonValue }
  | { readonly kind: "invalid"; readonly result: CanonicalJsonResult };

function cloneCanonical(
  source: unknown,
  path: string,
  depth: number,
  state: CloneState,
): CloneResult {
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    return { kind: "invalid", result: invalid("node-limit-exceeded", path) };
  }
  if (depth > state.limits.maxDepth) {
    return { kind: "invalid", result: invalid("depth-limit-exceeded", path) };
  }

  if (source === null || typeof source === "boolean") return { kind: "value", value: source };
  if (typeof source === "number") {
    if (!Number.isFinite(source)) {
      return { kind: "invalid", result: invalid("non-finite-number", path) };
    }
    return { kind: "value", value: Object.is(source, -0) ? 0 : source };
  }
  if (typeof source === "string") {
    return hasLoneSurrogate(source)
      ? { kind: "invalid", result: invalid("lone-surrogate", path) }
      : { kind: "value", value: source };
  }
  if (typeof source !== "object") {
    return { kind: "invalid", result: invalid(`unsupported-${typeof source}`, path) };
  }
  if (state.active.has(source)) {
    return { kind: "invalid", result: invalid("cyclic-reference", path) };
  }

  state.active.add(source);
  try {
    if (Array.isArray(source)) {
      if (Object.getPrototypeOf(source) !== Array.prototype) {
        return { kind: "invalid", result: invalid("invalid-array-prototype", path) };
      }
      const ownKeys = Reflect.ownKeys(source);
      if (
        ownKeys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= source.length)),
        )
      ) {
        return { kind: "invalid", result: invalid("extended-array", path) };
      }
      const result: CanonicalJsonValue[] = [];
      for (let index = 0; index < source.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
        const childPath = `${path}/${index}`;
        if (descriptor === undefined) {
          return { kind: "invalid", result: invalid("sparse-array", childPath) };
        }
        if (!("value" in descriptor) || !descriptor.enumerable) {
          return {
            kind: "invalid",
            result: invalid("invalid-property-descriptor", childPath),
          };
        }
        const child = cloneCanonical(descriptor.value, childPath, depth + 1, state);
        if (child.kind === "invalid") return child;
        result.push(child.value);
      }
      return { kind: "value", value: Object.freeze(result) };
    }

    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) {
      return { kind: "invalid", result: invalid("invalid-object-prototype", path) };
    }
    const descriptors = Object.getOwnPropertyDescriptors(source);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      return { kind: "invalid", result: invalid("symbol-key", path) };
    }
    const result: Record<string, CanonicalJsonValue> = {};
    for (const key of (keys as string[]).sort()) {
      const childPath = `${path}/${pointerSegment(key)}`;
      if (hasLoneSurrogate(key)) {
        return { kind: "invalid", result: invalid("lone-surrogate-key", childPath) };
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return {
          kind: "invalid",
          result: invalid("invalid-property-descriptor", childPath),
        };
      }
      const child = cloneCanonical(descriptor.value, childPath, depth + 1, state);
      if (child.kind === "invalid") return child;
      Object.defineProperty(result, key, {
        configurable: false,
        enumerable: true,
        value: child.value,
        writable: false,
      });
    }
    return { kind: "value", value: Object.freeze(result) as CanonicalJsonObject };
  } finally {
    state.active.delete(source);
  }
}

export function encodeCanonicalJson(
  source: unknown,
  limits: CanonicalJsonLimits = DEFAULT_CANONICAL_JSON_LIMITS,
): CanonicalJsonResult {
  if (!validLimits(limits)) return invalid("invalid-limits");
  const cloned = cloneCanonical(source, "", 0, { nodes: 0, active: new WeakSet(), limits });
  if (cloned.kind === "invalid") return cloned.result;
  const value = cloned.value;

  const text = JSON.stringify(value);
  const bytes = encoder.encode(text);
  if (bytes.byteLength > limits.maxBytes) return invalid("byte-limit-exceeded");
  return {
    kind: "valid",
    document: Object.freeze({ value, text, bytes }),
  };
}

export function decodeCanonicalJson(
  bytes: Uint8Array,
  limits: CanonicalJsonLimits = DEFAULT_CANONICAL_JSON_LIMITS,
): CanonicalJsonResult {
  if (!validLimits(limits)) return invalid("invalid-limits");
  if (!(bytes instanceof Uint8Array)) return invalid("invalid-byte-sequence");
  if (bytes.byteLength > limits.maxBytes) return invalid("byte-limit-exceeded");

  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return invalid("invalid-utf8");
  }
  if (text.charCodeAt(0) === 0xfeff) return invalid("byte-order-mark");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid("invalid-json");
  }
  const encoded = encodeCanonicalJson(parsed, limits);
  if (encoded.kind === "invalid") return encoded;
  if (encoded.document.text !== text) return invalid("non-canonical-encoding");
  return encoded;
}
