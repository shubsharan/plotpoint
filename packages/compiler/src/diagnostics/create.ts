import { canonicalizeValue, type JsonObject } from "@plotpoint/runtime";

import type { CompilerDiagnostic, DiagnosticLocation } from "../project/config.js";
import { compilerDiagnosticCategory, type CompilerDiagnosticCode } from "./codes.js";

export interface CreateCompilerDiagnosticInput {
  readonly code: CompilerDiagnosticCode;
  readonly location: DiagnosticLocation;
  readonly details?: JsonObject;
  readonly related?: readonly DiagnosticLocation[];
}

function freezeLocation(location: DiagnosticLocation): DiagnosticLocation {
  return Object.freeze({ ...location });
}

export function createCompilerDiagnostic(
  input: CreateCompilerDiagnosticInput,
): CompilerDiagnostic & { readonly code: CompilerDiagnosticCode } {
  const canonical = canonicalizeValue(input.details ?? {});
  if (
    canonical.kind === "invalid" ||
    canonical.canonical.value === null ||
    typeof canonical.canonical.value !== "object" ||
    Array.isArray(canonical.canonical.value)
  ) {
    throw new TypeError("Compiler diagnostic details must be a canonical JSON object");
  }

  return Object.freeze({
    category: compilerDiagnosticCategory(input.code),
    code: input.code,
    severity: "error",
    location: freezeLocation(input.location),
    details: canonical.canonical.value as JsonObject,
    related: Object.freeze((input.related ?? []).map(freezeLocation)),
  });
}
