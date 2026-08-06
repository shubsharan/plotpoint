import { describe, expect, it, vi } from "vitest";

import { openRelease } from "@plotpoint/protocol";

import { compileProject, validateProject } from "../../../packages/compiler/dist/index.js";
import { installReleaseFromDescriptor } from "../src/install/install-release";
import type { RunRecord } from "../src/model";
import { deriveHostSupportFromManifest } from "../src/runtime/host-support";
import { selectReleaseRun, type RunLifecycleStore } from "../src/runtime/run-lifecycle";

const descriptorUrl = "http://127.0.0.1:4000/install.json";
const releaseUrl = "http://127.0.0.1:4000/field-puzzle.pprelease";

interface TestFileSystem {
  readFile(path: string): Promise<Uint8Array>;
  rm(path: string, options: { readonly force: true }): Promise<void>;
}

function nodeFileSystem(): TestFileSystem {
  const runtime = globalThis as typeof globalThis & {
    readonly process?: {
      getBuiltinModule(name: "fs"): { readonly promises: TestFileSystem };
    };
  };
  const fileSystem = runtime.process?.getBuiltinModule("fs").promises;
  if (fileSystem === undefined) throw new Error("node-filesystem-unavailable");
  return fileSystem;
}

function isModule(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

async function importBundle(bytes: Uint8Array): Promise<Readonly<Record<string, unknown>>> {
  const url = `data:text/javascript,${encodeURIComponent(new TextDecoder().decode(bytes))}`;
  const imported: unknown = await import(url);
  if (!isModule(imported)) throw new Error("compiled-logic-module-invalid");
  return imported;
}

function requireGeneratedRuntimeAdapter(module: Readonly<Record<string, unknown>>) {
  const aggregateModels = module.aggregateModels;
  if (!isModule(aggregateModels)) throw new Error("generated-runtime-adapter-missing");
  return aggregateModels;
}

class MemoryRunStore implements RunLifecycleStore {
  readonly runs: RunRecord[] = [];

  async selectOrCreateActiveRun(candidate: RunRecord) {
    const active = this.runs.find(
      ({ releaseId, status }) => releaseId === candidate.releaseId && status === "active",
    );
    if (active !== undefined) return { created: false, run: active };
    this.runs.push(candidate);
    return { created: true, run: candidate };
  }
}

describe("installed field puzzle vertical journey", () => {
  it("reaches the generated runtime adapter after verified installation and run creation", async () => {
    const fileSystem = nodeFileSystem();
    const projectRoot = new URL("../../../examples/releases/field-puzzle/", import.meta.url)
      .pathname;
    const outputFile = `/tmp/plotpoint-field-puzzle-${globalThis.crypto.randomUUID()}.pprelease`;

    try {
      const validation = await validateProject({ projectRoot });
      expect(validation.kind).toBe("valid");
      if (validation.kind !== "valid") {
        throw new Error(`field-validation-failed:${JSON.stringify(validation.diagnostics)}`);
      }

      const compilation = await compileProject({
        projectRoot,
        outputFile,
      });
      expect(compilation.kind).toBe("compiled");
      if (compilation.kind !== "compiled") {
        throw new Error(`field-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
      }
      const bytes = await fileSystem.readFile(outputFile);
      const publish = vi.fn(async () => undefined);
      await expect(
        installReleaseFromDescriptor({
          descriptorUrl,
          support: deriveHostSupportFromManifest,
          transport: {
            fetchJson: async () => ({
              finalUrl: descriptorUrl,
              value: {
                version: 1,
                releaseUrl,
                expectedReleaseId: compilation.releaseId,
              },
            }),
            fetchBytes: async () => ({ finalUrl: releaseUrl, bytes }),
          },
          publisher: { publish },
        }),
      ).resolves.toMatchObject({ kind: "installed" });
      expect(publish).toHaveBeenCalledOnce();

      const runs = new MemoryRunStore();
      const selected = await selectReleaseRun(runs, compilation.releaseId, {
        createRunId: () => "field-puzzle-acceptance-run",
        now: () => "2030-01-01T00:00:00.000Z",
      });
      expect(selected).toMatchObject({
        kind: "created",
        run: { runId: "field-puzzle-acceptance-run", releaseId: compilation.releaseId },
      });

      const opened = await openRelease(bytes);
      expect(opened.kind).toBe("opened");
      if (opened.kind !== "opened") {
        throw new Error(`field-release-open-failed:${JSON.stringify(opened.diagnostics)}`);
      }
      const logicEntry = opened.entries.find(
        ({ path }) => path === opened.manifest.entrypoints.logic,
      );
      if (logicEntry === undefined) throw new Error("compiled-logic-entry-missing");
      const logicModule = await importBundle(logicEntry.bytes);
      expect(logicModule.default).toBeDefined();

      const aggregateModels = requireGeneratedRuntimeAdapter(logicModule);
      expect(Object.keys(aggregateModels)).toEqual(["field.player"]);
    } finally {
      await fileSystem.rm(outputFile, { force: true });
    }
  });
});
