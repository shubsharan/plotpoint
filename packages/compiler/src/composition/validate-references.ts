import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import { resolveGraphExport, type ImportGraph } from "../imports/resolve-graph.js";
import type { CanonicalProjectRegistries, CompilerDiagnostic } from "../project/config.js";

function ids(values: readonly { readonly id: string }[]): ReadonlySet<string> {
  return new Set(values.map(({ id }) => id));
}

export function validateReferences(
  registries: CanonicalProjectRegistries,
): readonly CompilerDiagnostic[] {
  const commands = ids(registries.commands);
  const aggregateSchemas = ids(registries.aggregateSchemas);
  const schemas = ids(registries.schemas);
  const progressions = ids(registries.progressions);
  const components = ids(registries.components);
  const content = ids(registries.content);
  const assets = ids(registries.assets);
  const diagnostics: CompilerDiagnostic[] = [];

  function requireReference(
    exists: ReadonlySet<string>,
    registration: string,
    id: string,
    field: string,
    target: string,
  ): void {
    if (exists.has(target)) return;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "composition-reference-missing",
        location: { kind: "registration", registration, id, field },
        details: { target },
      }),
    );
  }

  for (const command of registries.commands) {
    requireReference(
      aggregateSchemas,
      "commands",
      command.id,
      "aggregateSchema",
      command.aggregateSchema,
    );
    requireReference(schemas, "commands", command.id, "payloadSchema", command.payloadSchema);
    requireReference(schemas, "commands", command.id, "outcomeSchema", command.outcomeSchema);
  }
  for (const progression of registries.progressions) {
    requireReference(
      aggregateSchemas,
      "progressions",
      progression.id,
      "aggregateSchema",
      progression.aggregateSchema,
    );
    for (const target of progression.commands) {
      requireReference(commands, "progressions", progression.id, "commands", target);
    }
    for (const target of progression.content) {
      requireReference(content, "progressions", progression.id, "content", target);
    }
    for (const target of progression.components) {
      requireReference(components, "progressions", progression.id, "components", target);
    }
  }
  for (const component of registries.components) {
    for (const target of component.commands) {
      requireReference(commands, "components", component.id, "commands", target);
    }
    for (const target of component.content) {
      requireReference(content, "components", component.id, "content", target);
    }
    for (const target of component.assets) {
      requireReference(assets, "components", component.id, "assets", target);
    }
  }
  for (const entry of registries.content) {
    if (entry.schema !== undefined) {
      requireReference(schemas, "content", entry.id, "schema", entry.schema);
    }
  }

  // Keep the local set construction exhaustive as registries grow.
  void progressions;
  return orderCompilerDiagnostics(diagnostics);
}

export function validateLogicDefinitionExports(
  registries: CanonicalProjectRegistries,
  logicGraph: ImportGraph,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];

  for (const [registration, definitions] of [
    ["commands", registries.commands.map(({ id, definition }) => ({ id, definition }))],
    ["progressions", registries.progressions.map(({ id, definition }) => ({ id, definition }))],
  ] as const) {
    for (const { id, definition } of definitions) {
      const resolution = resolveGraphExport(logicGraph, definition.source, definition.export);
      if (resolution === "resolved") continue;
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-export-missing",
          location: { kind: "registration", registration, id, field: "definition" },
          details: {
            export: definition.export,
            reason: resolution === "ambiguous" ? "export-ambiguous" : "export-missing",
            source: definition.source,
          },
        }),
      );
    }
  }

  return orderCompilerDiagnostics(diagnostics);
}
