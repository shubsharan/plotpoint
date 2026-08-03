import { canonicalizeValue, type JsonValue, type Observation } from "@plotpoint/runtime";

export function observation<Value extends JsonValue>(
  kind: string,
  key: string,
  value: Value,
): Observation<Value> {
  if (kind.length === 0 || key.length === 0) {
    throw new TypeError("Observation kind and key must be non-empty");
  }
  const canonical = canonicalizeValue({ kind, key, value });
  if (canonical.kind === "invalid") {
    throw new TypeError(`Invalid observation script: ${canonical.diagnostic.code}`);
  }
  return canonical.canonical.value as unknown as Observation<Value>;
}

export function clock(value: string | number): Observation<string | number> {
  return observation("clock", "now", value);
}

export function identifier(value: string): Observation<string> {
  return observation("identifier", "next", value);
}

export function random(value: number): Observation<number> {
  return observation("random", "next", value);
}

export function capability<Value extends JsonValue>(key: string, value: Value): Observation<Value> {
  return observation("capability", key, value);
}
