import { describe, expect, it } from "vitest";

import { canonicalizeValue } from "@plotpoint/runtime";

const sparseArray: unknown[] = [];
sparseArray.length = 2;
sparseArray[1] = 1;

describe("canonicalizeValue", () => {
  it("sorts object keys, preserves array order, and normalizes negative zero", () => {
    const result = canonicalizeValue({ z: -0, a: [3, 2, 1] });

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.canonical.text).toBe('{"a":[3,2,1],"z":0}');
      expect(Object.is((result.canonical.value as { z: number }).z, -0)).toBe(false);
    }
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    new Date(),
    new Map(),
    Object.assign([1], { extra: true }),
    sparseArray,
    "\ud800",
  ])("rejects unsupported durable values", (value) => {
    expect(canonicalizeValue(value).kind).toBe("invalid");
  });

  it("rejects accessors without invoking them", () => {
    let invoked = false;
    const value = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        invoked = true;
        return 1;
      },
    });

    const result = canonicalizeValue(value);

    expect(result.kind).toBe("invalid");
    expect(invoked).toBe(false);
  });

  it("rejects cycles with the offending path", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    const result = canonicalizeValue(value);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic.details.path).toBe("/self");
    }
  });

  it("enforces depth and node limits", () => {
    expect(
      canonicalizeValue({ a: { b: 1 } }, { maxCanonicalDepth: 1, maxCanonicalNodes: 10 }).kind,
    ).toBe("invalid");
    expect(canonicalizeValue([1, 2], { maxCanonicalDepth: 2, maxCanonicalNodes: 2 }).kind).toBe(
      "invalid",
    );
  });

  it("returns a detached recursively frozen clone", () => {
    const nested = { value: 1 };
    const source = { nested };
    const result = canonicalizeValue(source);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.canonical.value).not.toBe(source);
      expect((result.canonical.value as { nested: unknown }).nested).not.toBe(nested);
      expect(Object.isFrozen(result.canonical.value)).toBe(true);
      expect(Object.isFrozen((result.canonical.value as { nested: object }).nested)).toBe(true);
    }
  });

  it("preserves reserved object keys without changing the clone prototype", () => {
    const source = Object.create(null) as Record<string, unknown>;
    source.__proto__ = { polluted: true };

    const result = canonicalizeValue(source);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.canonical.text).toBe('{"__proto__":{"polluted":true}}');
      expect(Object.getPrototypeOf(result.canonical.value)).toBeNull();
      expect(Object.hasOwn(result.canonical.value as object, "__proto__")).toBe(true);
    }
  });
});
