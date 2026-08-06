import { rolldown, type OutputChunk, type RolldownBuild } from "rolldown";

import {
  generateDefinitionInspectionEntry,
  generateLogicEntry,
  generatePresentationEntry,
  generatedRootContract,
} from "../composition/generated-entries.js";
import {
  buildGameComposition,
  gameCompositionMatchesGeneratedRoots,
} from "../composition/game-composition.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type { ImportGraph } from "../imports/resolve-graph.js";
import type {
  CanonicalProjectRegistries,
  CompilationSnapshot,
  CompilerDiagnostic,
  InvalidProject,
} from "../project/config.js";
import type { ValidatedSchema } from "../validation/schemas.js";
import {
  compilationSnapshotModules,
  createSnapshotRolldownPlugin,
  graphSnapshotPlugin,
  SnapshotBundleResolutionError,
} from "./rolldown-plugin.js";

const encoder = new TextEncoder();

export interface BundledRelease {
  readonly kind: "bundled";
  readonly logic: Uint8Array;
  readonly presentation: Uint8Array;
}

export type BundleReleaseResult = BundledRelease | InvalidProject;

export type BundleDefinitionInspectionResult =
  | { readonly kind: "bundled"; readonly bytes: Uint8Array }
  | InvalidProject;

type BundleName = "logic" | "presentation" | "definition-inspection";

function invalid(
  code: "bundle-failed" | "bundle-output-invalid",
  name: BundleName,
  reason: string,
  details: Record<string, string | readonly string[]> = {},
): InvalidProject {
  return Object.freeze({
    kind: "invalid",
    diagnostics: Object.freeze([
      createCompilerDiagnostic({
        code,
        location: {
          kind: "artifact",
          path: name === "definition-inspection" ? name : `bundles/${name}.js`,
        },
        details: { ...details, environment: name, reason },
      }),
    ]),
  });
}

function isExactChunk(output: unknown, name: BundleName): output is OutputChunk {
  const expectedExports =
    name === "logic"
      ? ["aggregateModels"]
      : name === "presentation"
        ? ["application", "components"]
        : [];
  return (
    output !== null &&
    typeof output === "object" &&
    "type" in output &&
    output.type === "chunk" &&
    "isEntry" in output &&
    output.isEntry === true &&
    "name" in output &&
    output.name === name &&
    "fileName" in output &&
    output.fileName === `${name}.js` &&
    "imports" in output &&
    Array.isArray(output.imports) &&
    output.imports.length === 0 &&
    "dynamicImports" in output &&
    Array.isArray(output.dynamicImports) &&
    output.dynamicImports.length === 0 &&
    "map" in output &&
    output.map === null &&
    "exports" in output &&
    Array.isArray(output.exports) &&
    JSON.stringify([...output.exports].sort()) === JSON.stringify(expectedExports)
  );
}

async function generateBundle(
  name: BundleName,
  platform: "browser" | "neutral",
  plugin: ReturnType<typeof createSnapshotRolldownPlugin>,
  virtualId: string,
): Promise<{ readonly kind: "bundled"; readonly bytes: Uint8Array } | InvalidProject> {
  const warningCodes: string[] = [];
  let bundle: RolldownBuild | undefined;
  let bytes: Uint8Array | undefined;
  let failure: InvalidProject | undefined;
  try {
    bundle = await rolldown({
      input: { [name]: virtualId },
      plugins: [plugin],
      platform,
      cwd: "/",
      external: () => false,
      logLevel: "warn",
      onwarn(warning) {
        warningCodes.push(typeof warning.code === "string" ? warning.code : "unknown-warning");
      },
      transform: { target: "es2022" },
    });
    const generated = await bundle.generate({
      codeSplitting: false,
      comments: false,
      entryFileNames: `${name}.js`,
      exports: "named",
      format: "esm",
      minify: false,
      sourcemap: false,
    });
    if (warningCodes.length > 0) {
      failure = invalid("bundle-failed", name, "rolldown-warning", {
        warningCodes: Object.freeze([...new Set(warningCodes)].sort()),
      });
    } else if (generated.output.length !== 1 || !isExactChunk(generated.output[0], name)) {
      failure = invalid("bundle-output-invalid", name, "unexpected-output-set");
    } else {
      bytes = encoder.encode(generated.output[0].code);
    }
  } catch (error) {
    const nestedErrors =
      error !== null &&
      typeof error === "object" &&
      "errors" in error &&
      Array.isArray(error.errors)
        ? error.errors
        : [];
    const resolutionError = [error, ...nestedErrors].find(
      (candidate): candidate is SnapshotBundleResolutionError =>
        candidate instanceof SnapshotBundleResolutionError,
    );
    failure = invalid(
      "bundle-failed",
      name,
      resolutionError?.reason ?? "rolldown-failure",
      resolutionError === undefined
        ? {}
        : { source: resolutionError.source, importer: resolutionError.importer },
    );
  } finally {
    if (bundle !== undefined) {
      try {
        await bundle.close();
      } catch {
        failure ??= invalid("bundle-failed", name, "bundle-close-failed");
      }
    }
  }
  if (failure !== undefined) return failure;
  if (bytes === undefined) return invalid("bundle-output-invalid", name, "missing-output");
  return { kind: "bundled", bytes };
}

async function bundleGraph(
  graph: ImportGraph,
  virtualSource: string,
): Promise<{ readonly kind: "bundled"; readonly bytes: Uint8Array } | InvalidProject> {
  const name = graph.environment;
  const virtualId = `\0plotpoint:${name}-entry.ts`;
  return generateBundle(
    name,
    "browser",
    graphSnapshotPlugin(graph, virtualId, virtualSource),
    virtualId,
  );
}

function firstInvalid(
  results: readonly ({ readonly kind: "bundled"; readonly bytes: Uint8Array } | InvalidProject)[],
): InvalidProject | undefined {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const result of results) {
    if (result.kind === "invalid") diagnostics.push(...result.diagnostics);
  }
  return diagnostics.length === 0
    ? undefined
    : Object.freeze({ kind: "invalid", diagnostics: Object.freeze(diagnostics) });
}

export async function bundleRelease(input: {
  readonly logic: ImportGraph;
  readonly presentation: ImportGraph;
  readonly registries: CanonicalProjectRegistries;
  readonly schemas: ReadonlyMap<string, ValidatedSchema>;
}): Promise<BundleReleaseResult> {
  const composition = buildGameComposition(input.registries);
  if (!gameCompositionMatchesGeneratedRoots(composition, generatedRootContract(input.registries))) {
    return invalid("bundle-output-invalid", "logic", "generated-registry-catalog-mismatch");
  }
  let logicEntry: string;
  let presentationEntry: string;
  try {
    logicEntry = generateLogicEntry(input.registries, input.schemas);
  } catch {
    return invalid("bundle-failed", "logic", "schema-validator-generation-failed");
  }
  try {
    presentationEntry = generatePresentationEntry(input.registries);
  } catch {
    return invalid("bundle-failed", "presentation", "generated-entry-invalid");
  }
  const results = await Promise.all([
    bundleGraph(input.logic, logicEntry),
    bundleGraph(input.presentation, presentationEntry),
  ]);
  const failure = firstInvalid(results);
  if (failure !== undefined) return failure;
  const logic = results[0];
  const presentation = results[1];
  if (logic?.kind !== "bundled" || presentation?.kind !== "bundled") {
    return invalid("bundle-output-invalid", "logic", "missing-output");
  }
  return Object.freeze({
    kind: "bundled",
    logic: logic.bytes,
    presentation: presentation.bytes,
  });
}

export async function bundleDefinitionInspection(
  snapshot: CompilationSnapshot,
): Promise<BundleDefinitionInspectionResult> {
  const name = "definition-inspection";
  const virtualId = "\0plotpoint:definition-inspection-entry.ts";
  const plugin = createSnapshotRolldownPlugin({
    virtualId,
    virtualSource: generateDefinitionInspectionEntry(snapshot.registries),
    modules: compilationSnapshotModules(snapshot),
  });
  return generateBundle(name, "neutral", plugin, virtualId);
}
