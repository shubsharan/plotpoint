import { describe, expect, it, vi } from "vitest";

import { openRelease, type OpenedRelease } from "@plotpoint/protocol";

import { compileProject, validateProject } from "../../../packages/compiler/dist/index.js";
import {
  installReleaseFromDescriptor,
  type InstallationPublisher,
} from "../src/install/install-release";
import { deriveHostSupportFromManifest } from "../src/runtime/host-support";

const installedGames = ["field-puzzle", "co-op-game"] as const;
const descriptorUrl = "http://127.0.0.1:4000/install.json";
const releaseUrl = "http://127.0.0.1:4000/game.pprelease";

interface GameCompositionFixture {
  readonly application: { readonly components: readonly string[] };
  readonly aggregateModels: readonly {
    readonly id: string;
    readonly authority: "local" | "server";
  }[];
  readonly components: readonly { readonly id: string }[];
}

interface TestElement {
  readonly componentId: string;
  readonly removed: boolean;
  remove(): void;
}

interface TestApplicationRoot {
  readonly children: readonly TestElement[];
  replaceChildren(...children: TestElement[]): void;
}

interface GeneratedApplication {
  mount(context: {
    readonly root: TestApplicationRoot;
    readonly components: Readonly<Record<string, () => TestElement>>;
  }): unknown;
}

interface GeneratedApplicationHandle {
  unmount(): unknown;
}

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGameComposition(value: unknown): value is GameCompositionFixture {
  if (!isRecord(value) || !isRecord(value.application)) return false;
  if (!isStringArray(value.application.components)) return false;
  if (
    !Array.isArray(value.aggregateModels) ||
    !value.aggregateModels.every(
      (model) =>
        isRecord(model) &&
        typeof model.id === "string" &&
        (model.authority === "local" || model.authority === "server"),
    )
  ) {
    return false;
  }
  return (
    Array.isArray(value.components) &&
    value.components.every((component) => isRecord(component) && typeof component.id === "string")
  );
}

function isGeneratedApplication(value: unknown): value is GeneratedApplication {
  return isRecord(value) && typeof value.mount === "function";
}

function isGeneratedApplicationHandle(value: unknown): value is GeneratedApplicationHandle {
  return isRecord(value) && typeof value.unmount === "function";
}

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function expectExactKeys(
  registry: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  diagnostic: string,
): void {
  if (
    JSON.stringify(Object.keys(registry).sort(ordinal)) !==
    JSON.stringify([...expected].sort(ordinal))
  ) {
    throw new Error(diagnostic);
  }
}

async function importBundle(bytes: Uint8Array): Promise<Readonly<Record<string, unknown>>> {
  const url = `data:text/javascript,${encodeURIComponent(new TextDecoder().decode(bytes))}`;
  const imported: unknown = await import(url);
  if (!isRecord(imported)) throw new Error("generated-bundle-invalid");
  return imported;
}

function requireGameComposition(release: OpenedRelease) {
  const entry = release.entries.find(({ path }) => path === "composition/game.json");
  if (entry === undefined) throw new Error("game-composition-missing");
  return entry;
}

function requireBundleEntry(release: OpenedRelease, path: string) {
  const entry = release.entries.find((candidate) => candidate.path === path);
  if (entry === undefined) throw new Error("generated-entrypoint-missing");
  return entry;
}

function requireRecordExport(
  module: Readonly<Record<string, unknown>>,
  name: string,
  diagnostic: string,
): Readonly<Record<string, unknown>> {
  const value = module[name];
  if (!isRecord(value)) throw new Error(diagnostic);
  return value;
}

function requireApplicationExport(module: Readonly<Record<string, unknown>>): GeneratedApplication {
  const application = module.application;
  if (!isGeneratedApplication(application)) throw new Error("generated-application-missing");
  return application;
}

function requireApplicationHandle(value: unknown): GeneratedApplicationHandle {
  if (!isGeneratedApplicationHandle(value)) throw new Error("generated-application-handle-invalid");
  return value;
}

function createMountFixture(componentIds: readonly string[]) {
  let children: TestElement[] = [];
  const elements: TestElement[] = [];
  const mountedComponentIds: string[] = [];
  const root: TestApplicationRoot = {
    get children() {
      return children;
    },
    replaceChildren(...nextChildren) {
      for (const child of children) child.remove();
      children = [...nextChildren];
    },
  };
  const components = Object.fromEntries(
    componentIds.map((componentId) => [
      componentId,
      () => {
        mountedComponentIds.push(componentId);
        let removed = false;
        const element: TestElement = {
          componentId,
          get removed() {
            return removed;
          },
          remove() {
            removed = true;
            children = children.filter((child) => child !== element);
          },
        };
        elements.push(element);
        return element;
      },
    ]),
  );
  return { root, components, elements, mountedComponentIds };
}

describe.each(installedGames)("installed %s", (fixture) => {
  it("installs verified compiler output before mounting its Game Composition", async () => {
    const fileSystem = nodeFileSystem();
    const projectRoot = new URL(`../../../examples/releases/${fixture}/`, import.meta.url).pathname;
    const outputFile = `/tmp/plotpoint-${fixture}-${globalThis.crypto.randomUUID()}.pprelease`;

    try {
      const validation = await validateProject({ projectRoot });
      expect(validation.kind).toBe("valid");
      if (validation.kind !== "valid") {
        throw new Error(`fixture-validation-failed:${JSON.stringify(validation.diagnostics)}`);
      }

      const compilation = await compileProject({
        projectRoot,
        outputFile,
      });
      expect(compilation.kind).toBe("compiled");
      if (compilation.kind !== "compiled") {
        throw new Error(`fixture-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
      }
      const bytes = await fileSystem.readFile(outputFile);
      const publications: Array<Parameters<InstallationPublisher["publish"]>[0]> = [];
      const publish = vi.fn(
        async (publication: Parameters<InstallationPublisher["publish"]>[0]) => {
          publications.push(publication);
        },
      );

      const installation = await installReleaseFromDescriptor({
        descriptorUrl,
        support: deriveHostSupportFromManifest,
        transport: {
          fetchJson: async () => ({
            finalUrl: descriptorUrl,
            value: {
              releaseUrl,
              expectedReleaseId: compilation.releaseId,
            },
          }),
          fetchBytes: async () => ({ finalUrl: releaseUrl, bytes }),
        },
        publisher: { publish },
      });
      expect(installation).toEqual({
        kind: "installed",
        descriptor: {
          releaseUrl,
          expectedReleaseId: compilation.releaseId,
        },
      });
      expect(publish).toHaveBeenCalledOnce();

      const publication = publications[0];
      if (publication === undefined) throw new Error("installed-publication-missing");
      const opened = await openRelease(publication.bytes);
      expect(opened.kind).toBe("opened");
      if (opened.kind !== "opened") {
        throw new Error(`installed-release-open-failed:${JSON.stringify(opened.diagnostics)}`);
      }

      const composition = requireGameComposition(opened);
      expect(composition.kind).toBe("content");
      const decoded: unknown = JSON.parse(new TextDecoder().decode(composition.bytes));
      if (!isGameComposition(decoded)) throw new Error("game-composition-invalid");

      const logicModule = await importBundle(
        requireBundleEntry(opened, opened.manifest.entrypoints.logic).bytes,
      );
      const presentationModule = await importBundle(
        requireBundleEntry(opened, opened.manifest.entrypoints.presentation).bytes,
      );
      const aggregateModels = requireRecordExport(
        logicModule,
        "aggregateModels",
        "generated-aggregate-models-missing",
      );
      const generatedComponents = requireRecordExport(
        presentationModule,
        "components",
        "generated-components-missing",
      );
      const application = requireApplicationExport(presentationModule);
      expectExactKeys(
        aggregateModels,
        decoded.aggregateModels
          .filter(({ authority }) => authority === "local")
          .map(({ id }) => id),
        "generated-aggregate-model-keys-mismatch",
      );
      expectExactKeys(
        generatedComponents,
        decoded.components.map(({ id }) => id),
        "generated-component-keys-mismatch",
      );

      const mount = createMountFixture(decoded.application.components);
      const handle = requireApplicationHandle(
        await application.mount({ root: mount.root, components: mount.components }),
      );
      if (
        JSON.stringify([...mount.mountedComponentIds].sort(ordinal)) !==
        JSON.stringify([...decoded.application.components].sort(ordinal))
      ) {
        throw new Error("generated-application-component-selection-mismatch");
      }
      expect(mount.root.children).toEqual(mount.elements);
      await handle.unmount();
      if (mount.root.children.length !== 0 || mount.elements.some(({ removed }) => !removed)) {
        throw new Error("generated-application-cleanup-incomplete");
      }
    } finally {
      await fileSystem.rm(outputFile, { force: true });
    }
  });
});
