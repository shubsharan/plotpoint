import type { Diagnostic } from "./diagnostics.js";

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface CanonicalLimits {
  readonly maxCanonicalDepth: number;
  readonly maxCanonicalNodes: number;
}

export interface CanonicalValue {
  readonly value: JsonValue;
  readonly text: string;
}

export type CanonicalizeResult =
  | { readonly kind: "valid"; readonly canonical: CanonicalValue }
  | { readonly kind: "invalid"; readonly diagnostic: Diagnostic };

export const DEFAULT_CANONICAL_LIMITS: CanonicalLimits = Object.freeze({
  maxCanonicalDepth: 128,
  maxCanonicalNodes: 100_000,
});

interface WorkItem {
  readonly source: unknown;
  readonly path: string;
  readonly depth: number;
  readonly assign: (value: JsonValue) => void;
}

interface ExitItem {
  readonly source: object;
  readonly value: JsonObject | JsonValue[];
}

type StackItem = WorkItem | ExitItem;

function isExitItem(item: StackItem): item is ExitItem {
  return "value" in item;
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function containsLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function invalid(path: string, reason: string, limit?: number): CanonicalizeResult {
  const details: Record<string, JsonValue> = { path, reason };
  if (limit !== undefined) details.limit = limit;
  const code = limit === undefined ? "canonical-value-invalid" : "canonical-limit-exceeded";
  return Object.freeze({
    kind: "invalid",
    diagnostic: Object.freeze({
      code,
      details: Object.freeze(details),
    }),
  });
}

function validateLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function canonicalText(root: JsonValue): string {
  const output: string[] = [];
  type TextItem =
    | { readonly kind: "token"; readonly value: string }
    | { readonly kind: "value"; readonly value: JsonValue };
  const stack: TextItem[] = [{ kind: "value", value: root }];

  while (stack.length > 0) {
    const item = stack.pop() as TextItem;
    if (item.kind === "token") {
      output.push(item.value);
      continue;
    }
    const value = item.value;
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      output.push(JSON.stringify(value));
      continue;
    }
    if (Array.isArray(value)) {
      output.push("[");
      stack.push({ kind: "token", value: "]" });
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: "value", value: value[index] as JsonValue });
        if (index > 0) stack.push({ kind: "token", value: "," });
      }
      continue;
    }

    output.push("{");
    const objectValue = value as JsonObject;
    const keys = Object.keys(objectValue).sort();
    stack.push({ kind: "token", value: "}" });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index] as string;
      stack.push({ kind: "value", value: objectValue[key] as JsonValue });
      stack.push({ kind: "token", value: ":" });
      stack.push({ kind: "token", value: JSON.stringify(key) });
      if (index > 0) stack.push({ kind: "token", value: "," });
    }
  }

  return output.join("");
}

export function canonicalizeValue(
  source: unknown,
  limits: CanonicalLimits = DEFAULT_CANONICAL_LIMITS,
): CanonicalizeResult {
  if (!validateLimit(limits.maxCanonicalDepth) || !validateLimit(limits.maxCanonicalNodes)) {
    return invalid("", "invalid-canonical-limits");
  }

  let root: JsonValue = null;
  let visited = 0;
  const active = new WeakSet<object>();
  const stack: StackItem[] = [
    {
      source,
      path: "",
      depth: 0,
      assign(value) {
        root = value;
      },
    },
  ];

  while (stack.length > 0) {
    const item = stack.pop() as StackItem;
    if (isExitItem(item)) {
      Object.freeze(item.value);
      active.delete(item.source);
      continue;
    }

    visited += 1;
    if (visited > limits.maxCanonicalNodes) {
      return invalid(
        item.path,
        "node-limit-exceeded",
        limits.maxCanonicalNodes,
      );
    }
    if (item.depth > limits.maxCanonicalDepth) {
      return invalid(
        item.path,
        "depth-limit-exceeded",
        limits.maxCanonicalDepth,
      );
    }

    const value = item.source;
    if (value === null || typeof value === "boolean") {
      item.assign(value);
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        return invalid(item.path, "non-finite-number");
      item.assign(Object.is(value, -0) ? 0 : value);
      continue;
    }
    if (typeof value === "string") {
      if (containsLoneSurrogate(value))
        return invalid(item.path, "lone-surrogate");
      item.assign(value);
      continue;
    }
    if (typeof value !== "object") {
      return invalid(item.path, `unsupported-${typeof value}`);
    }
    if (active.has(value))
      return invalid(item.path, "cyclic-reference");

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return invalid(item.path, "invalid-array-prototype");
      }
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (typeof key === "symbol")
          return invalid(item.path, "symbol-key");
        if (key === "length") continue;
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          index >= value.length
        ) {
          return invalid(
            `${item.path}/${pointerSegment(key)}`,
            "extended-array",
          );
        }
      }
      const clone: JsonValue[] = Array.from({ length: value.length }, () => null);
      item.assign(clone);
      active.add(value);
      stack.push({ source: value, value: clone });
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        const path = `${item.path}/${index}`;
        if (descriptor === undefined)
          return invalid(path, "sparse-array");
        if (!("value" in descriptor) || !descriptor.enumerable) {
          return invalid(path, "invalid-property-descriptor");
        }
        stack.push({
          source: descriptor.value,
          path,
          depth: item.depth + 1,
          assign(child) {
            clone[index] = child;
          },
        });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid(item.path, "invalid-object-prototype");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === "symbol")) {
      return invalid(item.path, "symbol-key");
    }
    const stringKeys = (keys as string[]).sort();
    const clone: Record<string, JsonValue> = {};
    item.assign(clone);
    active.add(value);
    stack.push({ source: value, value: clone });
    for (let index = stringKeys.length - 1; index >= 0; index -= 1) {
      const key = stringKeys[index] as string;
      const descriptor = descriptors[key];
      const path = `${item.path}/${pointerSegment(key)}`;
      if (containsLoneSurrogate(key))
        return invalid(path, "lone-surrogate-key");
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return invalid(path, "invalid-property-descriptor");
      }
      stack.push({
        source: descriptor.value,
        path,
        depth: item.depth + 1,
        assign(child) {
          Object.defineProperty(clone, key, {
            configurable: false,
            enumerable: true,
            value: child,
            writable: false,
          });
        },
      });
    }
  }

  return Object.freeze({
    kind: "valid",
    canonical: Object.freeze({
      value: root,
      text: canonicalText(root),
    }),
  });
}

export function canonicalEquals(left: JsonValue, right: JsonValue): boolean {
  return canonicalText(left) === canonicalText(right);
}
