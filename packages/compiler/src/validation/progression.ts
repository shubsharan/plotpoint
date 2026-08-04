import type {
  DefinitionInspectionMetadata,
  InspectedProgressionMetadata,
} from "../composition/inspect-definitions.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type { CanonicalProjectRegistries, CompilerDiagnostic } from "../project/config.js";

const STATUSES = new Set(["locked", "available", "active", "completed", "skipped"]);

function progressionLocation(id: string, field?: string) {
  return {
    kind: "registration" as const,
    registration: "progressions",
    id,
    ...(field === undefined ? {} : { field }),
  };
}

function hasCycle(progression: InspectedProgressionMetadata): string | null {
  const edges = new Map<string, Set<string>>();
  for (const rule of progression.automaticRules) {
    for (const from of rule.from) {
      const key = `${rule.targetNodeId}\0${from}`;
      const targets = edges.get(key) ?? new Set<string>();
      targets.add(`${rule.targetNodeId}\0${rule.to}`);
      edges.set(key, targets);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): string | null => {
    if (visiting.has(node)) return node;
    if (visited.has(node)) return null;
    visiting.add(node);
    for (const target of edges.get(node) ?? []) {
      const cycle = visit(target);
      if (cycle !== null) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  };
  for (const node of [...edges.keys()].sort()) {
    const cycle = visit(node);
    if (cycle !== null) return cycle;
  }
  return null;
}

function validateInspectedShape(
  progression: InspectedProgressionMetadata,
  diagnostics: CompilerDiagnostic[],
): void {
  const nodeIds = new Set<string>();
  for (const node of progression.nodes) {
    if (nodeIds.has(node.nodeId) || !STATUSES.has(node.initialStatus)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-invalid",
          location: progressionLocation(progression.registrationId, "nodes"),
          details: {
            nodeId: node.nodeId,
            reason: nodeIds.has(node.nodeId) ? "duplicate-node" : "invalid-initial-status",
          },
        }),
      );
    }
    nodeIds.add(node.nodeId);
  }
  const ruleIds = new Set<string>();
  for (const rule of progression.automaticRules) {
    if (ruleIds.has(rule.ruleId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-invalid",
          location: progressionLocation(progression.registrationId, "automaticRules"),
          details: { ruleId: rule.ruleId, reason: "duplicate-rule" },
        }),
      );
    }
    ruleIds.add(rule.ruleId);
    if (!nodeIds.has(rule.targetNodeId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-reference-missing",
          location: progressionLocation(progression.registrationId, "automaticRules"),
          details: { ruleId: rule.ruleId, target: rule.targetNodeId, targetKind: "node" },
        }),
      );
    }
    if (
      rule.from.length === 0 ||
      rule.from.some((status) => !STATUSES.has(status)) ||
      !STATUSES.has(rule.to)
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-invalid",
          location: progressionLocation(progression.registrationId, "automaticRules"),
          details: { ruleId: rule.ruleId, reason: "invalid-status-transition" },
        }),
      );
    }
  }
  const cycle = hasCycle(progression);
  if (cycle !== null) {
    const [nodeId, status] = cycle.split("\0");
    diagnostics.push(
      createCompilerDiagnostic({
        code: "progression-cycle",
        location: progressionLocation(progression.registrationId, "automaticRules"),
        details: { nodeId: nodeId ?? "", status: status ?? "" },
      }),
    );
  }
}

export function validateProgressions(
  registries: CanonicalProjectRegistries,
  inspection: DefinitionInspectionMetadata,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const commands = new Set(registries.commands.map(({ id }) => id));
  const content = new Set(registries.content.map(({ id }) => id));
  const components = new Set(registries.components.map(({ id }) => id));
  const aggregates = new Map(
    registries.aggregateSchemas.map((registration) => [registration.id, registration] as const),
  );
  const registrations = new Map(
    registries.progressions.map((registration) => [registration.id, registration] as const),
  );
  const metadata = new Map<string, InspectedProgressionMetadata>();
  for (const progression of inspection.progressions) {
    if (metadata.has(progression.registrationId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-identity-duplicate",
          location: progressionLocation(progression.registrationId),
          details: { id: progression.registrationId, identity: "registration" },
        }),
      );
    } else {
      metadata.set(progression.registrationId, progression);
    }
    if (!registrations.has(progression.registrationId)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-definition-mismatch",
          location: progressionLocation(progression.registrationId),
          details: { field: "registrationId", reason: "unexpected-definition" },
        }),
      );
    }
    validateInspectedShape(progression, diagnostics);
  }

  const identities = new Map(
    inspection.commands.map((command) => [command.definitionId, command.registrationId] as const),
  );
  for (const registration of registries.progressions) {
    const progression = metadata.get(registration.id);
    const aggregate = aggregates.get(registration.aggregateSchema);
    if (aggregate === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-reference-missing",
          location: progressionLocation(registration.id, "aggregateSchema"),
          details: { target: registration.aggregateSchema, targetKind: "aggregateSchema" },
        }),
      );
    }
    for (const [field, targets, existing, targetKind] of [
      ["commands", registration.commands, commands, "command"],
      ["content", registration.content, content, "content"],
      ["components", registration.components, components, "component"],
    ] as const) {
      for (const target of targets) {
        if (!existing.has(target)) {
          diagnostics.push(
            createCompilerDiagnostic({
              code: "progression-reference-missing",
              location: progressionLocation(registration.id, field),
              details: { target, targetKind },
            }),
          );
        }
      }
    }
    if (progression === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-definition-mismatch",
          location: progressionLocation(registration.id, "definition"),
          details: { reason: "missing-definition" },
        }),
      );
      continue;
    }
    for (const [field, expected, actual] of [
      ["graphId", registration.id, progression.graphId],
      ["graphVersion", registration.version, progression.graphVersion],
      ["aggregateKind", registration.kind, progression.aggregateKind],
    ] as const) {
      if (expected !== actual) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "progression-definition-mismatch",
            location: progressionLocation(registration.id, "definition"),
            details: { field, expected, actual },
          }),
        );
      }
    }
    if (aggregate !== undefined && aggregate.kind !== progression.aggregateKind) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-definition-mismatch",
          location: progressionLocation(registration.id, "aggregateSchema"),
          details: {
            field: "aggregateKind",
            expected: aggregate.kind,
            actual: progression.aggregateKind,
          },
        }),
      );
    }
    const priorIdentity = identities.get(progression.graphId);
    if (priorIdentity !== undefined && priorIdentity !== registration.id) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "definition-identity-duplicate",
          location: progressionLocation(registration.id, "definition"),
          details: { id: progression.graphId, priorRegistration: priorIdentity },
        }),
      );
    } else {
      identities.set(progression.graphId, registration.id);
    }
  }

  return orderCompilerDiagnostics(diagnostics);
}
