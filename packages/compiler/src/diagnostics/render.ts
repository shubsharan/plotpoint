import type { CompilerDiagnostic, DiagnosticLocation } from "../project/config.js";

function renderLocation(location: DiagnosticLocation): string {
  switch (location.kind) {
    case "configuration":
      return `${location.path}${location.pointer}`;
    case "source":
      return `${location.path}:${location.line}:${location.column}`;
    case "registration":
      return `${location.registration}:${location.id}${location.field === undefined ? "" : `:${location.field}`}`;
    case "artifact":
      return `${location.path}${location.relationship === undefined ? "" : ` (${location.relationship})`}`;
  }
}

export function renderCompilerDiagnostic(diagnostic: CompilerDiagnostic): string {
  const details =
    Object.keys(diagnostic.details).length === 0 ? "" : ` ${JSON.stringify(diagnostic.details)}`;
  return `${renderLocation(diagnostic.location)}: [${diagnostic.code}]${details}`;
}

export function renderCompilerDiagnostics(
  diagnostics: readonly CompilerDiagnostic[],
): readonly string[] {
  return Object.freeze(diagnostics.map(renderCompilerDiagnostic));
}
