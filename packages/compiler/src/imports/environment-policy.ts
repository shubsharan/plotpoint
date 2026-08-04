import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type { CompilerDiagnostic } from "../project/config.js";
import type { AnalyzedSource, SourceReference } from "./analyze-source.js";

export type ImportEnvironment = "logic" | "presentation";

const ALLOWED_PACKAGE_ROOTS = new Set([
  "@plotpoint/runtime",
  "@plotpoint/modules",
  "@plotpoint/protocol/player",
]);
const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "stream",
  "timers",
  "tls",
  "url",
  "util",
  "vm",
  "worker_threads",
  "zlib",
]);

function sourceLocation(path: string, reference: SourceReference) {
  return { kind: "source" as const, path, line: reference.line, column: reference.column };
}

function forbidden(
  path: string,
  reference: SourceReference,
  code:
    | "import-forbidden"
    | "import-dynamic-nonliteral"
    | "import-commonjs-forbidden"
    | "import-url-forbidden"
    | "import-native-addon"
    | "import-unresolved",
  details: Record<string, string | boolean>,
): CompilerDiagnostic {
  return createCompilerDiagnostic({ code, location: sourceLocation(path, reference), details });
}

export function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

export function isAllowedPackageRoot(specifier: string): boolean {
  return ALLOWED_PACKAGE_ROOTS.has(specifier);
}

function staticPolicy(path: string, reference: SourceReference): CompilerDiagnostic | null {
  const specifier = reference.specifier ?? "";
  if (specifier.endsWith(".node")) {
    return forbidden(path, reference, "import-native-addon", { specifier });
  }
  if (isLocalSpecifier(specifier) || isAllowedPackageRoot(specifier)) return null;
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) {
    return forbidden(path, reference, "import-forbidden", { specifier, reason: "node-builtin" });
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) {
    return forbidden(path, reference, "import-url-forbidden", { specifier });
  }
  return forbidden(path, reference, "import-unresolved", { specifier });
}

export function validateEnvironmentPolicy(
  analysis: AnalyzedSource,
  _environment: ImportEnvironment,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const reference of analysis.references) {
    if (reference.kind === "static") {
      const diagnostic = staticPolicy(analysis.path, reference);
      if (diagnostic !== null) diagnostics.push(diagnostic);
      continue;
    }
    if (reference.kind === "dynamic") {
      if (!reference.literal || reference.specifier === undefined) {
        diagnostics.push(
          forbidden(analysis.path, reference, "import-dynamic-nonliteral", { literal: false }),
        );
      } else {
        const diagnostic = staticPolicy(analysis.path, reference);
        if (diagnostic !== null) diagnostics.push(diagnostic);
      }
      continue;
    }
    if (reference.kind === "commonjs") {
      diagnostics.push(
        forbidden(analysis.path, reference, "import-commonjs-forbidden", {
          specifier: reference.specifier ?? "non-literal",
        }),
      );
      continue;
    }
    if (reference.kind === "url") {
      diagnostics.push(
        forbidden(analysis.path, reference, "import-url-forbidden", {
          specifier: reference.specifier ?? "non-literal",
        }),
      );
      continue;
    }
  }
  return Object.freeze(diagnostics);
}
