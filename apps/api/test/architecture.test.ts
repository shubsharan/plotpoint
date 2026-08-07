import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("shared-play architecture boundaries", () => {
  it("does not execute release entrypoints on the server", async () => {
    const service = await readFile(
      resolve(import.meta.dirname, "../src/shared-session-service.ts"),
      "utf8",
    );
    expect(service).not.toMatch(
      /\beval\s*\(|new\s+Function|node:vm|entrypoints\.(logic|presentation)/,
    );
  });

  it("never imports release-authored executable code into the server", async () => {
    const root = resolve(import.meta.dirname, "../src");
    const files = await sourceFiles(root);
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const combined = sources.join("\n");
    const importSpecifiers = [...combined.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)/g)].map(
      ([, specifier]) => specifier,
    );

    expect(importSpecifiers).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/(?:^|\/)(?:examples\/releases|bundles)(?:\/|$)/),
      ]),
    );
    expect(combined).not.toMatch(
      /\b(?:eval\s*\(|new\s+Function|node:vm|entrypoints\.(?:logic|presentation)|import\s*\()/,
    );
  });

  it("keeps game-specific names out of code-facing API services and routes", async () => {
    const root = resolve(import.meta.dirname, "../src");
    const sources = await Promise.all(
      ["index.ts", "operator-client.ts", "server.ts"].map((file) =>
        readFile(resolve(root, file), "utf8"),
      ),
    );
    expect(sources.join("\n")).not.toMatch(/HuntService|HuntOperatorClient|\/hunt-sessions/);
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
