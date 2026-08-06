import { describe, expect, it } from "vitest";

import type { ReleaseManifest } from "@plotpoint/protocol";

import { sha256Digest } from "../src/release/identity.js";
import { validateReleaseManifest } from "../src/release/manifest.js";

const utf8 = new TextEncoder();

function manifest(): ReleaseManifest {
  const logic = utf8.encode("logic");
  const presentation = utf8.encode("presentation");
  const schema = utf8.encode("{}");
  return {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [{ id: "puzzle.player", kind: "player", path: "schemas/player.json" }],
    capabilities: [{ id: "plotpoint.media.playback", major: 1, minimumMinor: 0 }],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: [
      {
        path: "bundles/logic.js",
        kind: "logic-bundle",
        byteLength: logic.byteLength,
        digest: sha256Digest(logic),
      },
      {
        path: "bundles/presentation.js",
        kind: "presentation-bundle",
        byteLength: presentation.byteLength,
        digest: sha256Digest(presentation),
      },
      {
        path: "schemas/player.json",
        kind: "aggregate-schema",
        byteLength: schema.byteLength,
        digest: sha256Digest(schema),
      },
    ],
  };
}

describe("release manifest ", () => {
  it("accepts and freezes a closed, ordinal manifest", () => {
    const result = validateReleaseManifest(manifest());

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.manifest).toEqual(manifest());
      expect(Object.isFrozen(result.manifest)).toBe(true);
      expect(Object.isFrozen(result.manifest.inventory)).toBe(true);
    }
  });

  it.each([
    ["unknown root field", { ...manifest(), label: "latest" }],
    ["unsupported version", { ...manifest(), releaseFormatVersion: 2 }],
    [
      "unsafe host version",
      { ...manifest(), hostApi: { major: Number.MAX_SAFE_INTEGER + 1, minimumMinor: 0 } },
    ],
    [
      "unknown inventory kind",
      { ...manifest(), inventory: [{ ...manifest().inventory[0], kind: "code" }] },
    ],
    [
      "manifest self inventory",
      { ...manifest(), inventory: [{ ...manifest().inventory[0], path: "manifest.json" }] },
    ],
    [
      "noncanonical digest",
      { ...manifest(), inventory: [{ ...manifest().inventory[0], digest: "sha256:ABC" }] },
    ],
  ])("rejects $0", (_name, value) => {
    expect(validateReleaseManifest(value).kind).toBe("invalid");
  });

  it("rejects non-ordinal arrays and duplicate identities", () => {
    const value = manifest();
    expect(
      validateReleaseManifest({ ...value, inventory: [...value.inventory].reverse() }).kind,
    ).toBe("invalid");
    expect(
      validateReleaseManifest({
        ...value,
        capabilities: [value.capabilities[0], value.capabilities[0]],
      }).kind,
    ).toBe("invalid");
  });

  it("rejects aggregate schema generation counters", () => {
    const value = manifest();
    expect(
      validateReleaseManifest({
        ...value,
        aggregateSchemas: [{ ...value.aggregateSchemas[0], version: 1 }],
      }).kind,
    ).toBe("invalid");
  });

  it("requires entrypoints and schema declarations to match inventory roles exactly", () => {
    const value = manifest();
    expect(
      validateReleaseManifest({
        ...value,
        entrypoints: { ...value.entrypoints, logic: "bundles/presentation.js" },
      }).kind,
    ).toBe("invalid");
    expect(
      validateReleaseManifest({
        ...value,
        aggregateSchemas: [{ ...value.aggregateSchemas[0], path: "bundles/logic.js" }],
      }).kind,
    ).toBe("invalid");
  });
});
