import { posix } from "node:path";

import type { Plugin } from "rolldown";

import type { ImportGraph } from "../imports/resolve-graph.js";
import type { CompilationSnapshot } from "../project/config.js";

const SNAPSHOT_PREFIX = "\0plotpoint:snapshot/";

export interface SnapshotBundleModule {
  readonly path: string;
  readonly bytes: Readonly<Uint8Array>;
}

export interface SnapshotRolldownPluginInput {
  readonly virtualId: string;
  readonly virtualSource: string;
  readonly modules: readonly SnapshotBundleModule[];
  readonly allowedEdges?: ReadonlySet<string>;
}

export class SnapshotBundleResolutionError extends Error {
  constructor(
    readonly reason: "module-not-in-snapshot" | "ambiguous-module" | "edge-not-in-graph",
    readonly source: string,
    readonly importer: string,
  ) {
    super("Snapshot bundle resolution failed");
    this.name = "SnapshotBundleResolutionError";
  }
}

function snapshotId(path: string): string {
  return `${SNAPSHOT_PREFIX}${path}`;
}

function snapshotPath(id: string): string | null {
  return id.startsWith(SNAPSHOT_PREFIX) ? id.slice(SNAPSHOT_PREFIX.length) : null;
}

function localCandidates(importer: string, source: string): readonly string[] {
  const base = posix.normalize(posix.join(posix.dirname(importer), source));
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

function resolveSnapshotPath(
  source: string,
  importer: string,
  modulePaths: ReadonlySet<string>,
): string {
  const importerPath = snapshotPath(importer);
  if (importerPath === null) {
    const rootPath = source.startsWith("./") ? source.slice(2) : source;
    if (modulePaths.has(rootPath)) return rootPath;
    throw new SnapshotBundleResolutionError("module-not-in-snapshot", source, importer);
  }

  let candidates: readonly string[];
  if (source.startsWith("./") || source.startsWith("../")) {
    candidates = localCandidates(importerPath, source);
  } else {
    const packagePrefix = `vendor/${source}/index.`;
    candidates = [...modulePaths].filter((path) => path.startsWith(packagePrefix));
  }
  const matches = candidates.filter((candidate) => modulePaths.has(candidate));
  if (matches.length !== 1) {
    throw new SnapshotBundleResolutionError(
      matches.length === 0 ? "module-not-in-snapshot" : "ambiguous-module",
      source,
      importerPath,
    );
  }
  return matches[0] as string;
}

export function createSnapshotRolldownPlugin(input: SnapshotRolldownPluginInput): Plugin {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const modules = new Map(input.modules.map((module) => [module.path, module.bytes]));
  const modulePaths = new Set(modules.keys());

  return {
    name: "plotpoint-snapshot",
    resolveId(source, importer) {
      if (source === input.virtualId) return input.virtualId;
      if (source.startsWith(SNAPSHOT_PREFIX)) {
        const path = snapshotPath(source);
        if (path !== null && modulePaths.has(path)) return source;
      }
      if (importer === undefined) {
        throw new SnapshotBundleResolutionError("module-not-in-snapshot", source, "entry");
      }
      const target = resolveSnapshotPath(source, importer, modulePaths);
      const from = snapshotPath(importer);
      if (
        from !== null &&
        input.allowedEdges !== undefined &&
        !input.allowedEdges.has(`${from}\0${target}`)
      ) {
        throw new SnapshotBundleResolutionError("edge-not-in-graph", source, from);
      }
      return snapshotId(target);
    },
    load(id) {
      if (id === input.virtualId) return input.virtualSource;
      const path = snapshotPath(id);
      const bytes = path === null ? undefined : modules.get(path);
      if (path === null || bytes === undefined) {
        throw new SnapshotBundleResolutionError("module-not-in-snapshot", id, "load");
      }
      return decoder.decode(bytes);
    },
  };
}

export function graphSnapshotPlugin(
  graph: ImportGraph,
  virtualId: string,
  virtualSource: string,
): Plugin {
  return createSnapshotRolldownPlugin({
    virtualId,
    virtualSource,
    modules: graph.nodes,
    allowedEdges: new Set(
      graph.edges.filter((edge) => !edge.external).map((edge) => `${edge.from}\0${edge.to}`),
    ),
  });
}

export function compilationSnapshotModules(
  snapshot: CompilationSnapshot,
): readonly SnapshotBundleModule[] {
  return Object.freeze(
    [...snapshot.files.values()]
      .filter((file) => file.kind === "source" || file.kind === "dependency")
      .map((file) => Object.freeze({ path: file.projectPath, bytes: file.bytes }))
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
  );
}
