import { describe, expect, it } from "vitest";

import { computeReleaseId, isReleaseId } from "@plotpoint/protocol";

import { decodeCanonicalJson, encodeCanonicalJson } from "../src/release/canonical-json.js";
import { crc32, sha256Digest } from "../src/release/identity.js";
import {
  compareOrdinal,
  isCanonicalArchivePath,
  validateArchivePath,
} from "../src/release/paths.js";

const utf8 = new TextEncoder();

describe("RFC 8785 canonical JSON", () => {
  it("uses ECMAScript number encoding, UTF-16 key ordering, and no formatting bytes", () => {
    const result = encodeCanonicalJson({ z: -0, a: 1e30, "\r": '\b\t\n\f\r"\\' });

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.document.text).toBe('{"\\r":"\\b\\t\\n\\f\\r\\\"\\\\","a":1e+30,"z":0}');
      expect(new TextDecoder().decode(result.document.bytes)).toBe(result.document.text);
    }
  });

  it("round-trips only exact canonical UTF-8", () => {
    const canonical = utf8.encode('{"a":[1,true,null],"b":"text"}');
    const result = decodeCanonicalJson(canonical);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.document.value).toEqual({ a: [1, true, null], b: "text" });
      expect(Object.isFrozen(result.document.value)).toBe(true);
      expect(Object.isFrozen((result.document.value as { a: unknown }).a)).toBe(true);
    }
  });

  it.each([
    ["whitespace", utf8.encode('{ "a":1}')],
    ["key order", utf8.encode('{"b":2,"a":1}')],
    ["number spelling", utf8.encode('{"a":1.0}')],
    ["trailing newline", utf8.encode('{"a":1}\n')],
    ["BOM", Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])],
    ["invalid UTF-8", Uint8Array.from([0xc3, 0x28])],
  ])("rejects non-canonical or invalid %s bytes", (_name, bytes) => {
    expect(decodeCanonicalJson(bytes).kind).toBe("invalid");
  });

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["bigint", 1n],
    ["Date", new Date()],
    ["lone surrogate", "\ud800"],
  ])("rejects unsupported or invalid $0 values", (_name, value) => {
    expect(encodeCanonicalJson(value).kind).toBe("invalid");
  });

  it("rejects accessors without invoking them and detects cycles", () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        invoked = true;
        return 1;
      },
    });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(encodeCanonicalJson(accessor).kind).toBe("invalid");
    expect(invoked).toBe(false);
    expect(encodeCanonicalJson(cyclic).kind).toBe("invalid");
  });

  it("does not confuse ordinary objects with internal result values", () => {
    const source = { kind: "invalid", diagnostic: { category: "format" } };
    const result = encodeCanonicalJson(source);

    expect(result.kind).toBe("valid");
  });
});

describe("canonical archive paths", () => {
  it.each(["manifest.json", "bundles/logic.js", "content/chapter-1.json", "assets/image_2.webp"])(
    "accepts %s",
    (path) => {
      expect(isCanonicalArchivePath(path)).toBe(true);
      expect(validateArchivePath(path)).toEqual({ kind: "valid", path });
    },
  );

  it.each([
    "",
    "/absolute",
    "trailing/",
    "empty//segment",
    "dot/./segment",
    "parent/../segment",
    "Uppercase",
    "back\\slash",
    "percent%2falias",
    "drive:c/file",
    "https://example.test/file",
    "nul\0byte",
  ])("rejects %s", (path) => {
    expect(isCanonicalArchivePath(path)).toBe(false);
  });

  it("compares paths by ordinal code-unit order", () => {
    expect(["z", "a/2", "a-1", "a/1"].sort(compareOrdinal)).toEqual(["a-1", "a/1", "a/2", "z"]);
  });
});

describe("release digests", () => {
  it("matches standard CRC-32 vectors", () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(utf8.encode("123456789"))).toBe(0xcbf43926);
  });

  it("returns algorithm-qualified lowercase SHA-256 identities", () => {
    const expected = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    expect(sha256Digest(new Uint8Array())).toBe(expected);
    expect(computeReleaseId(new Uint8Array())).toBe(expected);
    expect(isReleaseId(expected)).toBe(true);
    expect(isReleaseId("sha256:ABC")).toBe(false);
  });
});
