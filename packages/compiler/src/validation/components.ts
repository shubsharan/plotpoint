import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import { resolveGraphExport, type ImportGraph } from "../imports/resolve-graph.js";
import type {
  CompilationSnapshot,
  CompilerDiagnostic,
  ComponentRegistration,
} from "../project/config.js";

export interface ValidatedComponent {
  readonly id: string;
  readonly export: string;
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: ComponentRegistration["capabilities"];
}

export type ValidateComponentsResult =
  | { readonly kind: "valid"; readonly components: readonly ValidatedComponent[] }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

function ids(values: readonly { readonly id: string }[]): ReadonlySet<string> {
  return new Set(values.map(({ id }) => id));
}

export function validateComponents(
  snapshot: CompilationSnapshot,
  presentationGraph: ImportGraph,
): ValidateComponentsResult {
  const commandIds = ids(snapshot.registries.commands);
  const contentIds = ids(snapshot.registries.content);
  const assetIds = ids(snapshot.registries.assets);
  const components: ValidatedComponent[] = [];
  const diagnostics: CompilerDiagnostic[] = [];

  function requireReference(
    componentId: string,
    field: "assets" | "commands" | "content",
    target: string,
    available: ReadonlySet<string>,
  ): void {
    if (available.has(target)) return;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "component-reference-missing",
        location: { kind: "registration", registration: "components", id: componentId, field },
        details: { target },
      }),
    );
  }

  for (const component of snapshot.registries.components) {
    const exportResolution = resolveGraphExport(
      presentationGraph,
      component.implementation.source,
      component.implementation.export,
    );
    if (exportResolution !== "resolved") {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "component-export-missing",
          location: {
            kind: "registration",
            registration: "components",
            id: component.id,
            field: "implementation",
          },
          details: {
            export: component.implementation.export,
            reason: exportResolution,
            source: component.implementation.source,
          },
        }),
      );
    }
    for (const target of component.assets) {
      requireReference(component.id, "assets", target, assetIds);
    }
    for (const target of component.commands) {
      requireReference(component.id, "commands", target, commandIds);
    }
    for (const target of component.content) {
      requireReference(component.id, "content", target, contentIds);
    }
    components.push(
      Object.freeze({
        id: component.id,
        export: component.implementation.export,
        commands: component.commands,
        content: component.content,
        assets: component.assets,
        capabilities: component.capabilities,
      }),
    );
  }

  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  return { kind: "valid", components: Object.freeze(components) };
}
