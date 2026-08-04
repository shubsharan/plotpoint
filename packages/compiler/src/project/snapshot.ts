import { readFile, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { posix } from "node:path";

import { analyzeSource } from "../imports/analyze-source.js";
import { isAllowedPackageRoot, isLocalSpecifier } from "../imports/environment-policy.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  CompilationSnapshot,
  CompilerDiagnostic,
  InvalidProject,
  SnapshotFile,
  SnapshotFileKind,
} from "./config.js";
import type { LoadedProject } from "./load-project.js";
import { ProjectPathPolicyError, resolveProjectFile, validateProjectPath } from "./path-policy.js";

export interface CapturedProject {
  readonly kind: "captured";
  readonly snapshot: CompilationSnapshot;
}

export type CaptureProjectSnapshotResult = CapturedProject | InvalidProject;

class ImmutableMap<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #values: Map<Key, Value>;

  constructor(entries: Iterable<readonly [Key, Value]>) {
    this.#values = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: Key): Value | undefined {
    return this.#values.get(key);
  }

  has(key: Key): boolean {
    return this.#values.has(key);
  }

  entries(): MapIterator<[Key, Value]> {
    return this.#values.entries();
  }

  keys(): MapIterator<Key> {
    return this.#values.keys();
  }

  values(): MapIterator<Value> {
    return this.#values.values();
  }

  forEach(callback: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void): void {
    for (const [key, value] of this.#values) callback(value, key, this);
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries();
  }
}

interface FileState {
  readonly byteLength: number;
  readonly modifiedTimeMs: number;
  readonly device: number;
  readonly inode: number;
}

function fileState(metadata: Stats): FileState {
  return Object.freeze({
    byteLength: metadata.size,
    modifiedTimeMs: metadata.mtimeMs,
    device: metadata.dev,
    inode: metadata.ino,
  });
}

function sameFileState(left: FileState, right: FileState): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.modifiedTimeMs === right.modifiedTimeMs &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

function changedDiagnostic(projectPath: string): CompilerDiagnostic {
  return createCompilerDiagnostic({
    code: "project-input-changed",
    location: { kind: "configuration", path: projectPath, pointer: "" },
    details: { path: projectPath },
  });
}

function projectFileDiagnostic(projectPath: string, error: unknown): CompilerDiagnostic | null {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return createCompilerDiagnostic({
      code: "project-file-missing",
      location: { kind: "configuration", path: projectPath, pointer: "" },
      details: { path: projectPath },
    });
  }
  if (!(error instanceof ProjectPathPolicyError)) return null;
  const code =
    error.reason === "symlink"
      ? "project-path-symlink"
      : error.reason === "case-alias"
        ? "project-path-case-alias"
        : error.reason === "outside-root"
          ? "project-path-outside-root"
          : error.reason === "not-file"
            ? "project-file-not-regular"
            : "project-path-invalid";
  return createCompilerDiagnostic({
    code,
    location: { kind: "configuration", path: projectPath, pointer: "" },
    details: { path: projectPath, reason: error.reason },
  });
}

function immutableSnapshotFile(
  kind: SnapshotFileKind,
  projectPath: string,
  bytes: Uint8Array,
): SnapshotFile {
  const captured = new Uint8Array(bytes);
  return Object.freeze({
    kind,
    projectPath,
    get bytes() {
      return new Uint8Array(captured);
    },
  });
}

async function captureFile(
  project: LoadedProject,
  projectPath: string,
  kind: SnapshotFileKind,
): Promise<SnapshotFile | CompilerDiagnostic> {
  try {
    const resolved = await resolveProjectFile(project.root, projectPath);
    const before = fileState(await stat(resolved.absolutePath));
    const bytes = new Uint8Array(await readFile(resolved.absolutePath));
    const after = fileState(await stat(resolved.absolutePath));
    if (!sameFileState(before, after) || before.byteLength !== bytes.byteLength) {
      return changedDiagnostic(projectPath);
    }
    return immutableSnapshotFile(kind, projectPath, bytes);
  } catch (error) {
    const diagnostic = projectFileDiagnostic(projectPath, error);
    if (diagnostic !== null) return diagnostic;
    throw error;
  }
}

async function captureAbsoluteFile(
  projectPath: string,
  absolutePath: string,
  kind: SnapshotFileKind,
): Promise<SnapshotFile | CompilerDiagnostic> {
  const before = fileState(await stat(absolutePath));
  const bytes = new Uint8Array(await readFile(absolutePath));
  const after = fileState(await stat(absolutePath));
  if (!sameFileState(before, after) || before.byteLength !== bytes.byteLength) {
    return changedDiagnostic(projectPath);
  }
  return immutableSnapshotFile(kind, projectPath, bytes);
}

function sourceCandidates(from: string, specifier: string): readonly string[] {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  validateProjectPath(base);
  const extension = posix.extname(base);
  if (extension === ".js" || extension === ".jsx") {
    const withoutExtension = base.slice(0, -extension.length);
    return Object.freeze([`${withoutExtension}.ts`, `${withoutExtension}.tsx`, base]);
  }
  if (extension.length > 0) return Object.freeze([base]);
  return Object.freeze([
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ]);
}

async function existingSourceCandidates(
  project: LoadedProject,
  from: string,
  specifier: string,
): Promise<readonly string[]> {
  const matches: string[] = [];
  for (const candidate of sourceCandidates(from, specifier)) {
    try {
      await resolveProjectFile(project.root, candidate);
      matches.push(candidate);
    } catch (error) {
      if (error instanceof ProjectPathPolicyError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return Object.freeze(matches);
}

function explicitFiles(project: LoadedProject): ReadonlyMap<string, SnapshotFileKind> {
  const files = new Map<string, SnapshotFileKind>([[project.configPath, "config"]]);
  const sources = [
    project.config.entries.logic,
    project.config.entries.presentation,
    ...project.config.commands.map(({ definition }) => definition),
    ...project.config.progressions.map(({ definition }) => definition),
    ...project.config.components.map(({ implementation }) => implementation),
  ];
  for (const { source } of sources) files.set(source, "source");
  for (const { path } of project.config.aggregateSchemas) files.set(path, "schema");
  for (const { path } of project.config.schemas) files.set(path, "schema");
  for (const { path } of project.config.content) files.set(path, "content");
  for (const { path } of project.config.assets) files.set(path, "asset");
  return files;
}

export async function captureProjectSnapshot(
  project: LoadedProject,
): Promise<CaptureProjectSnapshotResult> {
  const pending = new Map(explicitFiles(project));
  const files = new Map<string, SnapshotFile>();
  const diagnostics: CompilerDiagnostic[] = [];
  const packageEntries = new Map<string, string>();
  const pendingPackages = new Set<string>();

  while (pending.size > 0) {
    const [projectPath, kind] = [...pending.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )[0] as [string, SnapshotFileKind];
    pending.delete(projectPath);
    if (files.has(projectPath)) continue;

    const captured = await captureFile(project, projectPath, kind);
    if ("code" in captured) {
      diagnostics.push(captured);
      continue;
    }
    files.set(projectPath, captured);

    if (kind !== "source") continue;
    const analysis = analyzeSource(projectPath, new TextDecoder().decode(captured.bytes));
    if (analysis.kind === "invalid") {
      diagnostics.push(...analysis.diagnostics);
      continue;
    }
    for (const reference of analysis.references) {
      if (
        (reference.kind !== "static" && reference.kind !== "dynamic") ||
        reference.specifier === undefined ||
        !isLocalSpecifier(reference.specifier)
      ) {
        if (
          (reference.kind === "static" || reference.kind === "dynamic") &&
          reference.specifier !== undefined &&
          isAllowedPackageRoot(reference.specifier)
        ) {
          pendingPackages.add(reference.specifier);
        }
        continue;
      }
      if (reference.specifier.endsWith(".node")) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "import-native-addon",
            location: {
              kind: "source",
              path: projectPath,
              line: reference.line,
              column: reference.column,
            },
            details: { specifier: reference.specifier },
          }),
        );
        continue;
      }
      let candidates: readonly string[];
      try {
        candidates = await existingSourceCandidates(project, projectPath, reference.specifier);
      } catch (error) {
        if (!(error instanceof ProjectPathPolicyError)) throw error;
        diagnostics.push(
          createCompilerDiagnostic({
            code: "import-unresolved",
            location: {
              kind: "source",
              path: projectPath,
              line: reference.line,
              column: reference.column,
            },
            details: { specifier: reference.specifier, reason: error.reason },
          }),
        );
        continue;
      }
      if (candidates.length !== 1) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "import-unresolved",
            location: {
              kind: "source",
              path: projectPath,
              line: reference.line,
              column: reference.column,
            },
            details: {
              specifier: reference.specifier,
              reason: candidates.length === 0 ? "missing" : "ambiguous",
            },
          }),
        );
        continue;
      }
      pending.set(candidates[0] as string, "source");
    }
  }

  const dependencyQueue: { readonly virtualPath: string; readonly absolutePath: string }[] = [];
  const enqueuePackage = (specifier: string): void => {
    if (packageEntries.has(specifier)) return;
    const absolutePath = fileURLToPath(import.meta.resolve(specifier));
    const virtualPath = `vendor/${specifier}/index${extname(absolutePath) || ".js"}`;
    packageEntries.set(specifier, virtualPath);
    dependencyQueue.push({ virtualPath, absolutePath });
  };
  for (const specifier of [...pendingPackages].sort()) enqueuePackage(specifier);

  while (dependencyQueue.length > 0) {
    dependencyQueue.sort((left, right) =>
      left.virtualPath < right.virtualPath ? -1 : left.virtualPath > right.virtualPath ? 1 : 0,
    );
    const dependency = dependencyQueue.shift() as {
      readonly virtualPath: string;
      readonly absolutePath: string;
    };
    if (files.has(dependency.virtualPath)) continue;
    const captured = await captureAbsoluteFile(
      dependency.virtualPath,
      dependency.absolutePath,
      "dependency",
    );
    if ("code" in captured) {
      diagnostics.push(captured);
      continue;
    }
    files.set(dependency.virtualPath, captured);
    const analysis = analyzeSource(
      dependency.virtualPath,
      new TextDecoder().decode(captured.bytes),
    );
    if (analysis.kind === "invalid") {
      diagnostics.push(...analysis.diagnostics);
      continue;
    }
    for (const reference of analysis.references) {
      if (
        (reference.kind !== "static" && reference.kind !== "dynamic") ||
        reference.specifier === undefined
      ) {
        continue;
      }
      if (isAllowedPackageRoot(reference.specifier)) {
        enqueuePackage(reference.specifier);
        continue;
      }
      if (!isLocalSpecifier(reference.specifier)) continue;
      const absoluteBase = resolve(dirname(dependency.absolutePath), reference.specifier);
      const virtualBase = posix.normalize(
        posix.join(posix.dirname(dependency.virtualPath), reference.specifier),
      );
      const absoluteExtension = extname(absoluteBase);
      const dependencyCandidates =
        absoluteExtension.length > 0
          ? [{ absolutePath: absoluteBase, virtualPath: virtualBase }]
          : [".js", ".mjs", ".cjs"].map((extension) => ({
              absolutePath: `${absoluteBase}${extension}`,
              virtualPath: `${virtualBase}${extension}`,
            }));
      const matches: typeof dependencyCandidates = [];
      for (const candidate of dependencyCandidates) {
        try {
          const metadata = await stat(candidate.absolutePath);
          if (metadata.isFile()) matches.push(candidate);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (matches.length !== 1) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "import-unresolved",
            location: {
              kind: "source",
              path: dependency.virtualPath,
              line: reference.line,
              column: reference.column,
            },
            details: {
              specifier: reference.specifier,
              reason: matches.length === 0 ? "missing" : "ambiguous",
            },
          }),
        );
        continue;
      }
      dependencyQueue.push(matches[0] as (typeof matches)[number]);
    }
  }

  if (diagnostics.length > 0) {
    return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
  }
  const fileEntries = [...files.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return Object.freeze({
    kind: "captured",
    snapshot: Object.freeze({
      config: project.config,
      registries: project.registries,
      files: new ImmutableMap(fileEntries),
    }),
  });
}
