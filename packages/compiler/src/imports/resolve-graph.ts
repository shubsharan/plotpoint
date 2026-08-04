import { posix } from "node:path";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  CompilationSnapshot,
  CompilerDiagnostic,
  InvalidProject,
  SourceExport,
} from "../project/config.js";
import { ProjectPathPolicyError, validateProjectPath } from "../project/path-policy.js";
import { analyzeSource, type AnalyzedSource, type SourceReference } from "./analyze-source.js";
import {
  isAllowedPackageRoot,
  isLocalSpecifier,
  type ImportEnvironment,
  validateEnvironmentPolicy,
} from "./environment-policy.js";

export interface ImportGraphNode {
  readonly path: string;
  readonly bytes: Readonly<Uint8Array>;
  readonly analysis: AnalyzedSource;
}

export interface ImportGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly specifier: string;
  readonly kind: "static" | "dynamic";
  readonly external: boolean;
}

export interface ImportGraph {
  readonly environment: ImportEnvironment;
  readonly entry: SourceExport;
  readonly nodes: readonly ImportGraphNode[];
  readonly edges: readonly ImportGraphEdge[];
}

export interface ResolvedImportGraph {
  readonly kind: "resolved";
  readonly graph: ImportGraph;
}

export type ResolveImportGraphResult = ResolvedImportGraph | InvalidProject;

function candidates(from: string, specifier: string): readonly string[] {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  validateProjectPath(base);
  const extension = posix.extname(base);
  if (extension === ".js" || extension === ".jsx") {
    const stem = base.slice(0, -extension.length);
    return [`${stem}.ts`, `${stem}.tsx`, base];
  }
  if (extension.length > 0) return [base];
  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
}

function referenceLocation(path: string, reference: SourceReference) {
  return { kind: "source" as const, path, line: reference.line, column: reference.column };
}

function resolveLocal(
  snapshot: CompilationSnapshot,
  from: string,
  reference: SourceReference,
): string | CompilerDiagnostic {
  const specifier = reference.specifier as string;
  let importCandidates: readonly string[];
  try {
    importCandidates = candidates(from, specifier);
  } catch (error) {
    if (!(error instanceof ProjectPathPolicyError)) throw error;
    return createCompilerDiagnostic({
      code: "import-unresolved",
      location: referenceLocation(from, reference),
      details: { specifier, reason: error.reason },
    });
  }
  const matches = importCandidates.filter((candidate) => snapshot.files.has(candidate));
  if (matches.length === 1) return matches[0] as string;
  return createCompilerDiagnostic({
    code: "import-unresolved",
    location: referenceLocation(from, reference),
    details: { specifier, reason: matches.length === 0 ? "missing" : "ambiguous" },
  });
}

function compareEdge(left: ImportGraphEdge, right: ImportGraphEdge): number {
  const leftKey = `${left.from}\0${left.to}\0${left.specifier}\0${left.kind}`;
  const rightKey = `${right.from}\0${right.to}\0${right.specifier}\0${right.kind}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export type GraphExportResolution = "resolved" | "missing" | "ambiguous";

export function resolveGraphExport(
  graph: ImportGraph,
  source: string,
  exportName: string,
): GraphExportResolution {
  const nodes = new Map(graph.nodes.map((node) => [node.path, node] as const));
  const targets = new Map<string, string>();
  for (const edge of graph.edges) targets.set(`${edge.from}\0${edge.specifier}`, edge.to);

  const visit = (path: string, name: string, active: ReadonlySet<string>): ReadonlySet<string> => {
    const node = nodes.get(path);
    if (node === undefined) return new Set();
    if (node.analysis.exports.includes(name)) return new Set([`${path}\0${name}`]);
    if (name === "default") return new Set();
    const key = `${path}\0${name}`;
    if (active.has(key)) return new Set();
    const nextActive = new Set(active);
    nextActive.add(key);
    const origins = new Set<string>();
    for (const reference of node.analysis.references) {
      if (!reference.exportAll || reference.specifier === undefined) continue;
      const target = targets.get(`${path}\0${reference.specifier}`);
      if (target === undefined) continue;
      for (const origin of visit(target, name, nextActive)) origins.add(origin);
    }
    return origins;
  };

  const origins = visit(source, exportName, new Set());
  return origins.size === 1 ? "resolved" : origins.size === 0 ? "missing" : "ambiguous";
}

function packageEntry(snapshot: CompilationSnapshot, specifier: string): string | undefined {
  const prefix = `vendor/${specifier}/index.`;
  return [...snapshot.files.keys()].find((path) => path.startsWith(prefix));
}

export function resolveImportGraph(
  snapshot: CompilationSnapshot,
  entry: SourceExport,
  environment: ImportEnvironment,
): ResolveImportGraphResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const nodes = new Map<string, ImportGraphNode>();
  const edges: ImportGraphEdge[] = [];
  const registeredSources =
    environment === "logic"
      ? [
          ...snapshot.registries.commands.map(({ definition }) => definition.source),
          ...snapshot.registries.progressions.map(({ definition }) => definition.source),
        ]
      : snapshot.registries.components.map(({ implementation }) => implementation.source);
  const pending = [entry.source, ...registeredSources];

  while (pending.length > 0) {
    pending.sort();
    const path = pending.shift() as string;
    if (nodes.has(path)) continue;
    const file = snapshot.files.get(path);
    if (file === undefined || (file.kind !== "source" && file.kind !== "dependency")) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "import-unresolved",
          location: { kind: "source", path, line: 1, column: 1 },
          details: { specifier: path, reason: "not-in-snapshot" },
        }),
      );
      continue;
    }
    const analysis = analyzeSource(path, new TextDecoder().decode(file.bytes));
    if (analysis.kind === "invalid") {
      diagnostics.push(...analysis.diagnostics);
      continue;
    }
    nodes.set(path, Object.freeze({ path, bytes: file.bytes, analysis }));
    diagnostics.push(...validateEnvironmentPolicy(analysis, environment));

    for (const reference of analysis.references) {
      if (
        (reference.kind !== "static" && reference.kind !== "dynamic") ||
        reference.specifier === undefined
      ) {
        continue;
      }
      if (isLocalSpecifier(reference.specifier)) {
        const target = resolveLocal(snapshot, path, reference);
        if (typeof target !== "string") {
          diagnostics.push(target);
          continue;
        }
        edges.push(
          Object.freeze({
            from: path,
            to: target,
            specifier: reference.specifier,
            kind: reference.kind,
            external: false,
          }),
        );
        pending.push(target);
      } else if (isAllowedPackageRoot(reference.specifier)) {
        const target = packageEntry(snapshot, reference.specifier);
        if (target === undefined) {
          diagnostics.push(
            createCompilerDiagnostic({
              code: "import-unresolved",
              location: referenceLocation(path, reference),
              details: { specifier: reference.specifier, reason: "not-in-snapshot" },
            }),
          );
          continue;
        }
        edges.push(
          Object.freeze({
            from: path,
            to: target,
            specifier: reference.specifier,
            kind: reference.kind,
            external: false,
          }),
        );
        pending.push(target);
      }
    }
  }

  const graph = Object.freeze({
    environment,
    entry,
    nodes: Object.freeze(
      [...nodes.values()].sort((left, right) => (left.path < right.path ? -1 : 1)),
    ),
    edges: Object.freeze(edges.sort(compareEdge)),
  });
  const entryResolution = resolveGraphExport(graph, entry.source, entry.export);
  if (entryResolution !== "resolved") {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "definition-export-missing",
        location: { kind: "source", path: entry.source, line: 1, column: 1 },
        details: { export: entry.export, reason: entryResolution },
      }),
    );
  }
  if (diagnostics.length > 0) {
    return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
  }
  return Object.freeze({
    kind: "resolved",
    graph,
  });
}
