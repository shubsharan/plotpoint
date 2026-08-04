import type { CompilerDiagnosticCategory } from "../project/config.js";

export const COMPILER_DIAGNOSTIC_CODES = {
  "configuration-invalid-json": "configuration",
  "configuration-duplicate-key": "configuration",
  "configuration-unknown-field": "configuration",
  "configuration-version-unsupported": "configuration",
  "configuration-value-invalid": "configuration",
  "configuration-identity-duplicate": "configuration",
  "project-path-invalid": "configuration",
  "project-path-outside-root": "configuration",
  "project-path-symlink": "configuration",
  "project-path-case-alias": "configuration",
  "project-file-missing": "configuration",
  "project-file-not-regular": "configuration",
  "project-input-changed": "configuration",
  "release-destination-invalid": "configuration",
  "output-path-invalid": "configuration",
  "output-collision": "configuration",
  "import-syntax-invalid": "import-boundary",
  "import-forbidden": "import-boundary",
  "import-dynamic-nonliteral": "import-boundary",
  "import-commonjs-forbidden": "import-boundary",
  "import-url-forbidden": "import-boundary",
  "import-unresolved": "import-boundary",
  "import-native-addon": "import-boundary",
  "composition-reference-missing": "composition",
  "composition-reference-duplicate": "composition",
  "composition-reference-cycle": "composition",
  "definition-identity-duplicate": "composition",
  "definition-export-missing": "composition",
  "definition-metadata-mismatch": "composition",
  "definition-inspection-timeout": "composition",
  "definition-inspection-failed": "composition",
  "definition-inspection-output-invalid": "composition",
  "command-invalid": "command",
  "command-type-duplicate": "command",
  "command-aggregate-mismatch": "command",
  "schema-invalid-json": "schema",
  "schema-dialect-unsupported": "schema",
  "schema-keyword-unsupported": "schema",
  "schema-value-invalid": "schema",
  "progression-invalid": "progression",
  "progression-definition-mismatch": "progression",
  "progression-reference-missing": "progression",
  "progression-cycle": "progression",
  "component-export-missing": "component",
  "component-reference-missing": "component",
  "content-invalid-json": "content",
  "content-schema-invalid": "content",
  "content-reference-missing": "content",
  "asset-empty": "asset",
  "asset-unreadable": "asset",
  "asset-destination-duplicate": "asset",
  "capability-invalid": "compatibility",
  "capability-major-conflict": "compatibility",
  "compatibility-invalid": "compatibility",
  "bundle-failed": "integrity",
  "bundle-output-invalid": "integrity",
  "release-assembly-failed": "integrity",
  "release-self-verification-failed": "integrity",
  "temporary-cleanup-failed": "integrity",
} as const satisfies Readonly<Record<string, CompilerDiagnosticCategory>>;

export type CompilerDiagnosticCode = keyof typeof COMPILER_DIAGNOSTIC_CODES;

export function compilerDiagnosticCategory(
  code: CompilerDiagnosticCode,
): CompilerDiagnosticCategory {
  return COMPILER_DIAGNOSTIC_CODES[code];
}

export function isCompilerDiagnosticCode(value: string): value is CompilerDiagnosticCode {
  return Object.hasOwn(COMPILER_DIAGNOSTIC_CODES, value);
}
