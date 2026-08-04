import { parseSync } from "oxc-parser";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type { CompilerDiagnostic } from "../project/config.js";

export type SourceReferenceKind = "static" | "dynamic" | "commonjs" | "url";

export interface SourceReference {
  readonly kind: SourceReferenceKind;
  readonly specifier?: string;
  readonly literal: boolean;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

export interface AnalyzedSource {
  readonly kind: "analyzed";
  readonly path: string;
  readonly exports: readonly string[];
  readonly references: readonly SourceReference[];
}

export interface InvalidSourceAnalysis {
  readonly kind: "invalid";
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export type AnalyzeSourceResult = AnalyzedSource | InvalidSourceAnalysis;

function position(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifierName(value: unknown): string | null {
  const valueRecord = record(value);
  return valueRecord?.type === "Identifier" && typeof valueRecord.name === "string"
    ? valueRecord.name
    : null;
}

function literalString(value: unknown): string | undefined {
  const valueRecord = record(value);
  return valueRecord?.type === "Literal" && typeof valueRecord.value === "string"
    ? valueRecord.value
    : undefined;
}

function nodeOffset(value: unknown, key: "start" | "end"): number {
  const valueRecord = record(value);
  return typeof valueRecord?.[key] === "number" ? valueRecord[key] : 0;
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const valueRecord = record(value);
  if (valueRecord === null) return;
  if (typeof valueRecord.type === "string") visit(valueRecord);
  for (const child of Object.values(valueRecord)) {
    if (child !== valueRecord) walk(child, visit);
  }
}

function sourceReference(
  source: string,
  kind: SourceReferenceKind,
  start: number,
  end: number,
  specifier: string | undefined,
  literal: boolean,
): SourceReference {
  return Object.freeze({
    kind,
    ...(specifier === undefined ? {} : { specifier }),
    literal,
    start,
    end,
    ...position(source, start),
  });
}

export function analyzeSource(path: string, source: string): AnalyzeSourceResult {
  const parsed = parseSync(path, source, {
    sourceType: "module",
    showSemanticErrors: true,
  });
  const errors = parsed.errors.filter(({ severity }) => severity === "Error");
  if (errors.length > 0) {
    const start = errors[0]?.labels[0]?.start ?? 0;
    return Object.freeze({
      kind: "invalid",
      diagnostics: Object.freeze([
        createCompilerDiagnostic({
          code: "import-syntax-invalid",
          location: { kind: "source", path, ...position(source, start) },
          details: { reason: "syntax" },
        }),
      ]),
    });
  }

  const references: SourceReference[] = [];
  const exports = new Set<string>();
  for (const item of parsed.module.staticImports) {
    references.push(
      sourceReference(
        source,
        "static",
        item.moduleRequest.start,
        item.moduleRequest.end,
        item.moduleRequest.value,
        true,
      ),
    );
  }
  for (const item of parsed.module.staticExports) {
    for (const entry of item.entries) {
      if (entry.exportName.name !== null) exports.add(entry.exportName.name);
      if (entry.moduleRequest !== null) {
        references.push(
          sourceReference(
            source,
            "static",
            entry.moduleRequest.start,
            entry.moduleRequest.end,
            entry.moduleRequest.value,
            true,
          ),
        );
      }
    }
  }
  for (const item of parsed.module.dynamicImports) {
    const argument = source.slice(item.moduleRequest.start, item.moduleRequest.end);
    let specifier: string | undefined;
    try {
      const value = JSON.parse(argument) as unknown;
      if (typeof value === "string") specifier = value;
    } catch {
      // A non-literal dynamic import is represented explicitly below.
    }
    references.push(
      sourceReference(
        source,
        "dynamic",
        item.moduleRequest.start,
        item.moduleRequest.end,
        specifier,
        specifier !== undefined,
      ),
    );
  }

  walk(parsed.program, (node) => {
    if (node.type === "CallExpression") {
      const callee = node.callee;
      const calleeName = identifierName(callee);
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      if (calleeName === "require") {
        const specifier = literalString(args[0]);
        references.push(
          sourceReference(
            source,
            "commonjs",
            nodeOffset(node, "start"),
            nodeOffset(node, "end"),
            specifier,
            specifier !== undefined,
          ),
        );
      }
    }

    if (node.type === "NewExpression") {
      const name = identifierName(node.callee);
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      if (name === "URL") {
        const specifier = literalString(args[0]);
        references.push(
          sourceReference(
            source,
            "url",
            nodeOffset(node, "start"),
            nodeOffset(node, "end"),
            specifier,
            specifier !== undefined,
          ),
        );
      }
    }
  });

  const unique = new Map<string, SourceReference>();
  for (const reference of references) {
    const key = `${reference.kind}\0${reference.start}\0${reference.end}\0${reference.specifier ?? ""}`;
    unique.set(key, reference);
  }
  return Object.freeze({
    kind: "analyzed",
    path,
    exports: Object.freeze([...exports].sort()),
    references: Object.freeze(
      [...unique.values()].sort((left, right) => left.start - right.start || left.end - right.end),
    ),
  });
}
