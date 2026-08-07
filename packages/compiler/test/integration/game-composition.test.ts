import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileProject, validateProject } from "@plotpoint/compiler";
import { openRelease, type OpenedRelease } from "@plotpoint/protocol";

import { createExternalProject } from "../helpers/external-project.js";

const installedGames = ["field-puzzle", "co-op-game"] as const;

interface GameCompositionFixture {
  readonly application: { readonly components: readonly string[] };
  readonly aggregateModels: readonly {
    readonly id: string;
    readonly authority: "local" | "server";
  }[];
  readonly commands: readonly unknown[];
  readonly components: readonly { readonly id: string }[];
  readonly resources: readonly unknown[];
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
  if (
    !Array.isArray(value.components) ||
    !value.components.every((component) => isRecord(component) && typeof component.id === "string")
  ) {
    return false;
  }
  return Array.isArray(value.commands) && Array.isArray(value.resources);
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

function requireApplicationExport(
  module: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const application = module.application;
  if (!isRecord(application) || typeof application.mount !== "function") {
    throw new Error("generated-application-missing");
  }
  return application;
}

describe.each(installedGames)("%s Game Composition", (fixture) => {
  it("validates and compiles one mandatory composition catalog", async () => {
    const externalProject = await createExternalProject(fixture);
    const outputFile = join(externalProject.sandbox, `${fixture}.pprelease`);

    try {
      const validation = await validateProject({ projectRoot: externalProject.root });
      expect(validation.kind).toBe("valid");
      if (validation.kind !== "valid") {
        throw new Error(`fixture-validation-failed:${JSON.stringify(validation.diagnostics)}`);
      }

      const compilation = await compileProject({
        projectRoot: externalProject.root,
        outputFile,
      });
      expect(compilation.kind).toBe("compiled");
      if (compilation.kind !== "compiled") {
        throw new Error(`fixture-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
      }

      const opened = await openRelease(await readFile(outputFile));
      expect(opened.kind).toBe("opened");
      if (opened.kind !== "opened") {
        throw new Error(`fixture-open-failed:${JSON.stringify(opened.diagnostics)}`);
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
      const components = requireRecordExport(
        presentationModule,
        "components",
        "generated-components-missing",
      );
      requireApplicationExport(presentationModule);

      expectExactKeys(
        aggregateModels,
        decoded.aggregateModels
          .filter(({ authority }) => authority === "local")
          .map(({ id }) => id),
        "generated-aggregate-model-keys-mismatch",
      );
      expectExactKeys(
        components,
        decoded.components.map(({ id }) => id),
        "generated-component-keys-mismatch",
      );
    } finally {
      await externalProject.cleanup();
    }
  });
});
