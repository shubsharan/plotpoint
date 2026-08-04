import type { DefinitionInspectionMetadata } from "../composition/inspect-definitions.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type { CanonicalProjectRegistries, CompilerDiagnostic } from "../project/config.js";

function commandLocation(id: string, field?: string) {
  return {
    kind: "registration" as const,
    registration: "commands",
    id,
    ...(field === undefined ? {} : { field }),
  };
}

export function validateCommands(
  registries: CanonicalProjectRegistries,
  inspection: DefinitionInspectionMetadata,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const aggregateSchemas = new Map(
    registries.aggregateSchemas.map((registration) => [registration.id, registration] as const),
  );
  const registrations = new Map(
    registries.commands.map((registration) => [registration.id, registration] as const),
  );
  const metadata = new Map<string, (typeof inspection.commands)[number]>();

  for (const inspected of inspection.commands) {
    if (metadata.has(inspected.registrationId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-identity-duplicate",
          location: commandLocation(inspected.registrationId),
          details: { id: inspected.registrationId, identity: "registration" },
        }),
      );
    } else {
      metadata.set(inspected.registrationId, inspected);
    }
    if (!registrations.has(inspected.registrationId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-metadata-mismatch",
          location: commandLocation(inspected.registrationId),
          details: { field: "registrationId", reason: "unexpected-definition" },
        }),
      );
    }
  }

  const definitionIds = new Map<string, string>();
  const commandTypes = new Map<string, string>();
  for (const registration of registries.commands) {
    const inspected = metadata.get(registration.id);
    const aggregate = aggregateSchemas.get(registration.aggregateSchema);
    if (inspected === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-metadata-mismatch",
          location: commandLocation(registration.id, "definition"),
          details: { reason: "missing-definition" },
        }),
      );
      continue;
    }
    for (const [field, expected, actual] of [
      ["definitionId", registration.id, inspected.definitionId],
      ["commandType", registration.type, inspected.commandType],
    ] as const) {
      if (expected !== actual) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "definition-metadata-mismatch",
            location: commandLocation(registration.id, "definition"),
            details: { field, expected, actual },
          }),
        );
      }
    }
    if (aggregate !== undefined && aggregate.kind !== inspected.aggregateKind) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "command-aggregate-mismatch",
          location: commandLocation(registration.id, "aggregateSchema"),
          details: {
            expected: aggregate.kind,
            actual: inspected.aggregateKind,
            schema: aggregate.id,
          },
        }),
      );
    }

    const priorDefinition = definitionIds.get(inspected.definitionId);
    if (priorDefinition !== undefined && priorDefinition !== registration.id) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-identity-duplicate",
          location: commandLocation(registration.id, "definition"),
          details: { id: inspected.definitionId, priorRegistration: priorDefinition },
        }),
      );
    } else {
      definitionIds.set(inspected.definitionId, registration.id);
    }

    const aggregateKind = aggregate?.kind ?? inspected.aggregateKind;
    const typeKey = `${aggregateKind}\0${inspected.commandType}`;
    const priorType = commandTypes.get(typeKey);
    if (priorType !== undefined && priorType !== registration.id) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "command-type-duplicate",
          location: commandLocation(registration.id, "type"),
          details: {
            aggregateKind,
            commandType: inspected.commandType,
            priorRegistration: priorType,
          },
        }),
      );
    } else {
      commandTypes.set(typeKey, registration.id);
    }
  }

  return orderCompilerDiagnostics(diagnostics);
}
