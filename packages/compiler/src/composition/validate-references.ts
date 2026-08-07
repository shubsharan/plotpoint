import { analyzeGameComposition, type GameCompositionIssue } from "@plotpoint/protocol";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import { resolveGraphExport, type ImportGraph } from "../imports/resolve-graph.js";
import type { DefinitionInspectionMetadata } from "./inspect-definitions.js";
import type {
  CanonicalProjectRegistries,
  CompilerDiagnostic,
  SourceExport,
} from "../project/config.js";
import { buildGameComposition } from "./game-composition.js";

function registrationLocation(registration: string, id: string, field?: string) {
  return {
    kind: "registration" as const,
    registration,
    id,
    ...(field === undefined ? {} : { field }),
  };
}

export function validateReferences(
  registries: CanonicalProjectRegistries,
): readonly CompilerDiagnostic[] {
  const models = new Map(registries.aggregateModels.map((value) => [value.id, value] as const));
  const commands = new Map(registries.commands.map((value) => [value.id, value] as const));
  const content = new Map(registries.content.map((value) => [value.id, value] as const));
  const diagnostics: CompilerDiagnostic[] = [];

  function issueLocation(issue: GameCompositionIssue) {
    const registration = models.has(issue.subject)
      ? "aggregateModels"
      : commands.has(issue.subject)
        ? "commands"
        : registries.progressions.some(({ id }) => id === issue.subject)
          ? "progressions"
          : registries.components.some(({ id }) => id === issue.subject)
            ? "components"
            : registries.trustedMechanic?.id === issue.subject
              ? "trustedMechanic"
              : "application";
    const field = issue.path.split("/").at(-1);
    return registrationLocation(registration, issue.subject, field);
  }

  function compositionDiagnostic(issue: GameCompositionIssue): CompilerDiagnostic {
    switch (issue.code) {
      case "initialization-schema-mismatch": {
        const model = models.get(issue.subject);
        const selectedContent =
          model?.authority === "local" && model.initializationContent !== undefined
            ? content.get(model.initializationContent)
            : undefined;
        return createCompilerDiagnostic({
          code: "content-schema-invalid",
          location: registrationLocation("aggregateModels", issue.subject, "initializationContent"),
          details: {
            content: issue.related ?? "",
            expectedSchema: model?.initializationSchema ?? "",
            actualSchema: selectedContent?.schema?.id ?? null,
          },
        });
      }
      case "duplicate-command-type": {
        const command = commands.get(issue.subject);
        return createCompilerDiagnostic({
          code: "command-type-duplicate",
          location: registrationLocation("commands", issue.subject, "type"),
          details: {
            aggregateModel: command?.aggregateModel ?? "",
            commandType: command?.type ?? "",
            priorRegistration: issue.related ?? "",
          },
        });
      }
      case "multiple-model-progressions": {
        return createCompilerDiagnostic({
          code: "progression-invalid",
          location: registrationLocation("progressions", issue.subject, "aggregateModel"),
          details: {
            reason: "multiple-model-progressions",
            priorRegistration: issue.related ?? "",
          },
        });
      }
      case "unselected-server-model":
        return createCompilerDiagnostic({
          code: "composition-reference-missing",
          location: registrationLocation("aggregateModels", issue.subject, "authority"),
          details: { target: "trustedMechanic" },
        });
      case "unselected-trusted-command":
        return createCompilerDiagnostic({
          code: "composition-reference-missing",
          location: registrationLocation("commands", issue.subject, "execution"),
          details: { target: "trustedMechanic.commands" },
        });
      case "component-shared-projection-mismatch":
        return createCompilerDiagnostic({
          code: "component-reference-missing",
          location: registrationLocation("components", issue.subject, "sharedProjection"),
          details: { target: issue.related ?? "trustedMechanic" },
        });
      case "trusted-configuration-schema-missing":
        return createCompilerDiagnostic({
          code: "content-schema-invalid",
          location: registrationLocation("trustedMechanic", issue.subject, "configuration"),
          details: { content: issue.related ?? "", reason: "schema-required" },
        });
      case "local-model-count-invalid":
        return createCompilerDiagnostic({
          code: "configuration-value-invalid",
          location: {
            kind: "configuration",
            path: "plotpoint.project.json",
            pointer: "/aggregateModels",
          },
          details: { expected: "exactly one local player model" },
        });
      case "command-aggregate-mismatch":
        return createCompilerDiagnostic({
          code: "command-aggregate-mismatch",
          location: issueLocation(issue),
          details: { aggregateModel: issue.related ?? "", reason: issue.code },
        });
      case "progression-aggregate-mismatch":
        return models.has(issue.related ?? "")
          ? createCompilerDiagnostic({
              code: "progression-invalid",
              location: issueLocation(issue),
              details: { reason: "server-progression-unsupported" },
            })
          : createCompilerDiagnostic({
              code: "composition-reference-missing",
              location: issueLocation(issue),
              details: { target: issue.related ?? issue.subject },
            });
      case "application-component-missing":
      case "command-reference-missing":
      case "content-reference-missing":
      case "resource-reference-missing":
      case "schema-reference-missing":
        return createCompilerDiagnostic({
          code: "composition-reference-missing",
          location: issueLocation(issue),
          details: { target: issue.related ?? issue.subject, reason: issue.code },
        });
    }
  }

  const compositionIssues = analyzeGameComposition(buildGameComposition(registries));
  if (compositionIssues.length > 0) {
    return orderCompilerDiagnostics(compositionIssues.map(compositionDiagnostic));
  }

  const resourceOwners = new Map<string, string>();
  for (const [registration, values] of [
    ["schemas", registries.schemas],
    ["content", registries.content],
    ["assets", registries.assets],
    ["progressions", registries.progressions],
    ["components", registries.components],
  ] as const) {
    for (const value of values) {
      const prior = resourceOwners.get(value.id);
      if (prior === undefined) {
        resourceOwners.set(value.id, registration);
        continue;
      }
      diagnostics.push(
        createCompilerDiagnostic({
          code: "composition-reference-duplicate",
          location: registrationLocation(registration, value.id),
          details: { id: value.id, priorRegistration: prior },
        }),
      );
    }
  }

  return orderCompilerDiagnostics(diagnostics);
}

export function validateDefinitionMetadata(
  registries: CanonicalProjectRegistries,
  inspection: DefinitionInspectionMetadata,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  if (
    inspection.application.mountType !== "function" ||
    inspection.application.keys.length !== 1 ||
    inspection.application.keys[0] !== "mount"
  ) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "definition-metadata-mismatch",
        location: registrationLocation("application", "application", "definition"),
        details: { reason: "application-must-expose-only-mount" },
      }),
    );
  }

  function validateSelectedDefinitions(
    registration: "aggregateModels" | "components",
    field: "initializer" | "implementation",
    expectedIds: readonly string[],
    inspected: readonly { readonly registrationId: string }[],
  ): void {
    const expected = new Set(expectedIds);
    const seen = new Set<string>();
    for (const selected of inspected) {
      if (seen.has(selected.registrationId)) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "definition-identity-duplicate",
            location: registrationLocation(registration, selected.registrationId, field),
            details: { id: selected.registrationId, identity: "registration" },
          }),
        );
        continue;
      }
      seen.add(selected.registrationId);
      if (!expected.has(selected.registrationId)) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "definition-metadata-mismatch",
            location: registrationLocation(registration, selected.registrationId, field),
            details: { reason: "unexpected-definition" },
          }),
        );
      }
    }
    for (const id of expectedIds) {
      if (seen.has(id)) continue;
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-metadata-mismatch",
          location: registrationLocation(registration, id, field),
          details: { reason: "missing-definition" },
        }),
      );
    }
  }

  validateSelectedDefinitions(
    "aggregateModels",
    "initializer",
    registries.aggregateModels.filter((model) => model.authority === "local").map(({ id }) => id),
    inspection.aggregateModels,
  );
  validateSelectedDefinitions(
    "components",
    "implementation",
    registries.components.map(({ id }) => id),
    inspection.components,
  );
  return orderCompilerDiagnostics(diagnostics);
}

export function validateDefinitionExports(
  definitions: readonly {
    readonly registration: string;
    readonly id: string;
    readonly selected: SourceExport;
    readonly graph: ImportGraph;
  }[],
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const { registration, id, selected, graph } of definitions) {
    const resolution = resolveGraphExport(graph, selected.source, selected.export);
    if (resolution === "resolved") continue;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "definition-export-missing",
        location: registrationLocation(registration, id, "definition"),
        details: {
          export: selected.export,
          reason: resolution === "ambiguous" ? "export-ambiguous" : "export-missing",
          source: selected.source,
        },
      }),
    );
  }
  return orderCompilerDiagnostics(diagnostics);
}
