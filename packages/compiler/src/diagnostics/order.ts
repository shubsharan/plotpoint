import type {
  CompilerDiagnostic,
  CompilerDiagnosticCategory,
  DiagnosticLocation,
} from "../project/config.js";

const CATEGORY_RANK: Readonly<Record<CompilerDiagnosticCategory, number>> = Object.freeze({
  configuration: 0,
  "import-boundary": 1,
  composition: 2,
  command: 3,
  schema: 4,
  progression: 5,
  component: 6,
  content: 7,
  asset: 8,
  compatibility: 9,
  integrity: 10,
});

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function locationKey(location: DiagnosticLocation): readonly (number | string)[] {
  switch (location.kind) {
    case "configuration":
      return [0, location.path, location.pointer];
    case "source":
      return [1, location.path, location.line, location.column];
    case "registration":
      return [2, location.registration, location.id, location.field ?? ""];
    case "artifact":
      return [3, location.path, location.relationship ?? ""];
  }
}

function compareKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart < rightPart ? -1 : 1;
    }
    return compareOrdinal(String(leftPart), String(rightPart));
  }
  return 0;
}

export function compareCompilerDiagnostics(
  left: CompilerDiagnostic,
  right: CompilerDiagnostic,
): number {
  const category = CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category];
  if (category !== 0) return category;
  const location = compareKeys(locationKey(left.location), locationKey(right.location));
  if (location !== 0) return location;
  const code = compareOrdinal(left.code, right.code);
  if (code !== 0) return code;
  return compareOrdinal(JSON.stringify(left.details), JSON.stringify(right.details));
}

export function orderCompilerDiagnostics(
  diagnostics: readonly CompilerDiagnostic[],
): readonly CompilerDiagnostic[] {
  return Object.freeze([...diagnostics].sort(compareCompilerDiagnostics));
}
