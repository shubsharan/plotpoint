import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared-play architecture boundaries", () => {
  it("does not execute release entrypoints on the server", async () => {
    const service = await readFile(resolve(import.meta.dirname, "../src/hunt-service.ts"), "utf8");
    expect(service).not.toMatch(
      /\beval\s*\(|new\s+Function|node:vm|entrypoints\.(logic|presentation)/,
    );
  });

  it("keeps hunt vocabulary out of host-owned shared contracts", async () => {
    const root = resolve(import.meta.dirname, "../../../packages/protocol/src/shared");
    const sources = await Promise.all(
      ["types.ts", "client.ts", "validation.ts"].map((file) =>
        readFile(resolve(root, file), "utf8"),
      ),
    );
    expect(sources.join("\n")).not.toMatch(/\btargetId\b|\bhunt\b/);
  });
});
