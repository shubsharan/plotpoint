import { canonicalizeValue, type JsonValue } from "@plotpoint/runtime";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type { CompilationSnapshot, CompilerDiagnostic } from "../project/config.js";
import type { ValidatedSchema } from "./schemas.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export interface ValidatedContent {
  readonly id: string;
  readonly path: string;
  readonly value: JsonValue;
  readonly canonicalBytes: Uint8Array;
}

export type ValidateContentResult =
  | { readonly kind: "valid"; readonly content: readonly ValidatedContent[] }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

export function validateContent(
  snapshot: CompilationSnapshot,
  schemas: ReadonlyMap<string, ValidatedSchema>,
): ValidateContentResult {
  const content: ValidatedContent[] = [];
  const diagnostics: CompilerDiagnostic[] = [];

  for (const registration of snapshot.registries.content) {
    const file = snapshot.files.get(registration.path);
    if (file === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "content-invalid-json",
          location: { kind: "registration", registration: "content", id: registration.id },
          details: { reason: "missing-snapshot-file", path: registration.path },
        }),
      );
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(decoder.decode(file.bytes));
      const canonical = canonicalizeValue(parsed);
      if (canonical.kind === "invalid") {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "content-invalid-json",
            location: { kind: "artifact", path: registration.path },
            details: { reason: "not-canonical-json" },
          }),
        );
        continue;
      }
      if (registration.schema !== undefined) {
        const schema = schemas.get(registration.schema);
        if (schema === undefined) {
          diagnostics.push(
            createCompilerDiagnostic({
              code: "content-reference-missing",
              location: {
                kind: "registration",
                registration: "content",
                id: registration.id,
                field: "schema",
              },
              details: { target: registration.schema },
            }),
          );
          continue;
        }
        if (!schema.validate(canonical.canonical.value)) {
          const firstError = [...(schema.validate.errors ?? [])].sort((left, right) => {
            const leftKey = `${left.instancePath}\0${left.schemaPath}\0${left.keyword}`;
            const rightKey = `${right.instancePath}\0${right.schemaPath}\0${right.keyword}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
          })[0];
          diagnostics.push(
            createCompilerDiagnostic({
              code: "content-schema-invalid",
              location: { kind: "artifact", path: registration.path },
              details: {
                schema: registration.schema,
                instancePath: firstError?.instancePath ?? "",
                keyword: firstError?.keyword ?? "unknown",
              },
            }),
          );
          continue;
        }
      }
      content.push(
        Object.freeze({
          id: registration.id,
          path: registration.path,
          value: canonical.canonical.value,
          canonicalBytes: encoder.encode(canonical.canonical.text),
        }),
      );
    } catch {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "content-invalid-json",
          location: { kind: "artifact", path: registration.path },
          details: { reason: "invalid-json" },
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  return { kind: "valid", content: Object.freeze(content) };
}
