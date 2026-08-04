import { describe, expect, it } from "vitest";

import { encodeReleaseEntryId, generatedReleaseEntryPath } from "../../src/release/entry-paths.js";

describe("generated release entry paths", () => {
  it.each(["Card.V1", "chapter/one", "schema!?", "space id"])(
    "encodes printable ID %j into lowercase archive-safe bytes",
    (id) => {
      const encoded = encodeReleaseEntryId(id);
      expect(encoded).toMatch(/^[0-9a-f]+$/);
      expect(
        new TextDecoder().decode(
          Uint8Array.from(encoded.match(/../g)!.map((byte) => +`0x${byte}`)),
        ),
      ).toBe(id);
    },
  );

  it("uses role-specific generated destinations without exposing logical IDs", () => {
    const id = "Card.V1/chapter!?";
    const paths = [
      generatedReleaseEntryPath("aggregate-schema", id),
      generatedReleaseEntryPath("schema", id),
      generatedReleaseEntryPath("progression", id),
      generatedReleaseEntryPath("component", id),
      generatedReleaseEntryPath("content", id),
    ];

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => /^[a-z0-9._/-]+$/.test(path))).toBe(true);
    expect(paths.every((path) => !path.includes(id))).toBe(true);
  });
});
