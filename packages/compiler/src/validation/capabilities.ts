import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  CapabilityRequirement,
  CompilationSnapshot,
  CompilerDiagnostic,
} from "../project/config.js";

export type ValidateCapabilitiesResult =
  | { readonly kind: "valid"; readonly capabilities: readonly CapabilityRequirement[] }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validCapabilityId(id: string): boolean {
  return /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/.test(id);
}

export function validateCapabilities(snapshot: CompilationSnapshot): ValidateCapabilitiesResult {
  const capabilities = new Map<string, CapabilityRequirement>();
  const diagnostics: CompilerDiagnostic[] = [];

  const selections = [
    ...snapshot.registries.components.map((component) => ({
      registration: "components",
      id: component.id,
      capabilities: component.capabilities,
    })),
    ...(snapshot.registries.trustedMechanic === undefined
      ? []
      : [
          {
            registration: "trustedMechanic",
            id: snapshot.registries.trustedMechanic.id,
            capabilities: snapshot.registries.trustedMechanic.capabilities,
          },
        ]),
  ];
  for (const selection of selections) {
    for (const requirement of selection.capabilities) {
      const location = {
        kind: "registration" as const,
        registration: selection.registration,
        id: selection.id,
        field: "capabilities",
      };
      if (
        !validCapabilityId(requirement.id) ||
        !Number.isSafeInteger(requirement.major) ||
        requirement.major < 1 ||
        !Number.isSafeInteger(requirement.minimumMinor) ||
        requirement.minimumMinor < 0
      ) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "capability-invalid",
            location,
            details: { capability: requirement.id },
          }),
        );
        continue;
      }
      const previous = capabilities.get(requirement.id);
      if (previous !== undefined && previous.major !== requirement.major) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "capability-major-conflict",
            location,
            details: {
              capability: requirement.id,
              firstMajor: previous.major,
              secondMajor: requirement.major,
            },
          }),
        );
        continue;
      }
      capabilities.set(
        requirement.id,
        Object.freeze({
          id: requirement.id,
          major: requirement.major,
          minimumMinor: Math.max(previous?.minimumMinor ?? 0, requirement.minimumMinor),
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  return {
    kind: "valid",
    capabilities: Object.freeze(
      [...capabilities.values()].sort((left, right) => compareOrdinal(left.id, right.id)),
    ),
  };
}

export function validateCompatibilityRequirements(
  snapshot: CompilationSnapshot,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const hostLocation = {
    kind: "configuration" as const,
    path: "plotpoint.project.json",
    pointer: "/hostApi",
  };
  if (!Number.isSafeInteger(snapshot.config.hostApi.major) || snapshot.config.hostApi.major < 1) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "compatibility-invalid",
        location: hostLocation,
        details: { field: "major", reason: "not-positive-integer" },
      }),
    );
  }
  if (
    !Number.isSafeInteger(snapshot.config.hostApi.minimumMinor) ||
    snapshot.config.hostApi.minimumMinor < 0
  ) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "compatibility-invalid",
        location: hostLocation,
        details: { field: "minimumMinor", reason: "not-nonnegative-integer" },
      }),
    );
  }
  return orderCompilerDiagnostics(diagnostics);
}
