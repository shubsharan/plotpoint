import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { canonicalizeValue, type JsonObject } from "@plotpoint/runtime";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type { CompilationSnapshot, CompilerDiagnostic } from "../project/config.js";

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const ALLOWED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "title",
  "description",
]);

export interface NormalizedAjvError extends JsonObject {
  readonly schemaId: string;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly params: JsonObject;
}

export interface AjvErrorLike {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly params: Record<string, unknown>;
  readonly message?: string;
}

export interface ValidatedSchema {
  readonly id: string;
  readonly path: string;
  readonly document: JsonObject;
  readonly canonicalBytes: Uint8Array;
  readonly validate: ValidateFunction;
}

export type ValidateSchemasResult =
  | {
      readonly kind: "valid";
      readonly aggregateSchemas: ReadonlyMap<string, ValidatedSchema>;
      readonly schemas: ReadonlyMap<string, ValidatedSchema>;
    }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

function parseSchema(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes));
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function normalizeAjvErrors(
  schemaId: string,
  errors: readonly AjvErrorLike[] | null | undefined,
): readonly NormalizedAjvError[] {
  return Object.freeze(
    (errors ?? [])
      .map((error) => {
        const canonical = canonicalizeValue(error.params);
        const params =
          canonical.kind === "valid" &&
          canonical.canonical.value !== null &&
          typeof canonical.canonical.value === "object" &&
          !Array.isArray(canonical.canonical.value)
            ? (canonical.canonical.value as JsonObject)
            : Object.freeze({});
        return Object.freeze({
          schemaId,
          instancePath: error.instancePath,
          schemaPath: error.schemaPath,
          keyword: error.keyword,
          params,
        });
      })
      .sort((left, right) => {
        const leftKey = `${left.instancePath}\0${left.schemaPath}\0${left.keyword}\0${JSON.stringify(left.params)}`;
        const rightKey = `${right.instancePath}\0${right.schemaPath}\0${right.keyword}\0${JSON.stringify(right.params)}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  );
}

function closedSubsetDiagnostics(
  path: string,
  document: JsonObject,
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const visit = (value: unknown, pointer: string, root: boolean): void => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "schema-value-invalid",
          location: { kind: "artifact", path, relationship: pointer },
          details: { pointer, reason: "schema-must-be-object" },
        }),
      );
      return;
    }
    const schema = value as Record<string, unknown>;
    for (const keyword of Object.keys(schema).sort()) {
      const keywordPointer = `${pointer}/${pointerSegment(keyword)}`;
      if (
        !ALLOWED_KEYWORDS.has(keyword) ||
        (!root && keyword === "$schema") ||
        (!root && keyword === "$id")
      ) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "schema-keyword-unsupported",
            location: { kind: "artifact", path, relationship: keywordPointer },
            details: { keyword, pointer: keywordPointer },
          }),
        );
      }
    }
    if (
      (schema.type === "object" || schema.properties !== undefined) &&
      schema.additionalProperties !== false
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "schema-value-invalid",
          location: { kind: "artifact", path, relationship: pointer },
          details: { pointer, reason: "object-schema-must-be-closed" },
        }),
      );
    }
    if (typeof schema.$ref === "string" && !schema.$ref.startsWith("#/$defs/")) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "schema-value-invalid",
          location: { kind: "artifact", path, relationship: `${pointer}/$ref` },
          details: { pointer: `${pointer}/$ref`, reason: "non-local-ref" },
        }),
      );
    }
    for (const mapKeyword of ["properties", "$defs"] as const) {
      const map = schema[mapKeyword];
      if (map !== null && typeof map === "object" && !Array.isArray(map)) {
        for (const [key, child] of Object.entries(map)) {
          visit(child, `${pointer}/${mapKeyword}/${pointerSegment(key)}`, false);
        }
      }
    }
    if (schema.items !== undefined) visit(schema.items, `${pointer}/items`, false);
    if (schema.not !== undefined) visit(schema.not, `${pointer}/not`, false);
    for (const arrayKeyword of ["prefixItems", "allOf", "anyOf", "oneOf"] as const) {
      const values = schema[arrayKeyword];
      if (Array.isArray(values)) {
        values.forEach((child, index) =>
          visit(child, `${pointer}/${arrayKeyword}/${index}`, false),
        );
      }
    }
  };
  visit(document, "", true);
  return diagnostics;
}

export function validateSchemas(snapshot: CompilationSnapshot): ValidateSchemasResult {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateSchema: true });
  const aggregateSchemas = new Map<string, ValidatedSchema>();
  const schemas = new Map<string, ValidatedSchema>();
  const diagnostics: CompilerDiagnostic[] = [];
  const registrations = [
    ...snapshot.registries.aggregateSchemas.map((registration) => ({
      id: registration.id,
      path: registration.path,
      registration: "aggregateSchemas",
    })),
    ...snapshot.registries.schemas.map((registration) => ({
      id: registration.id,
      path: registration.path,
      registration: "schemas",
    })),
  ];

  for (const registration of registrations) {
    const file = snapshot.files.get(registration.path);
    if (file === undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "schema-invalid-json",
          location: {
            kind: "registration",
            registration: registration.registration,
            id: registration.id,
            field: "path",
          },
          details: { reason: "missing-snapshot-file", path: registration.path },
        }),
      );
      continue;
    }

    try {
      const parsed = parseSchema(file.bytes);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        (parsed as { readonly $schema?: unknown }).$schema !== JSON_SCHEMA_2020_12
      ) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "schema-dialect-unsupported",
            location: { kind: "artifact", path: registration.path },
            details: { expected: JSON_SCHEMA_2020_12 },
          }),
        );
        continue;
      }
      const canonical = canonicalizeValue(parsed);
      if (
        canonical.kind === "invalid" ||
        canonical.canonical.value === null ||
        typeof canonical.canonical.value !== "object" ||
        Array.isArray(canonical.canonical.value)
      ) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "schema-value-invalid",
            location: { kind: "artifact", path: registration.path },
            details: { reason: "not-canonical-object" },
          }),
        );
        continue;
      }
      const document = canonical.canonical.value as JsonObject;
      const subsetDiagnostics = closedSubsetDiagnostics(registration.path, document);
      if (subsetDiagnostics.length > 0) {
        diagnostics.push(...subsetDiagnostics);
        continue;
      }
      if (!ajv.validateSchema(document)) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "schema-value-invalid",
            location: { kind: "artifact", path: registration.path },
            details: {
              reason: "meta-schema-invalid",
              errors: normalizeAjvErrors(registration.id, ajv.errors),
            },
          }),
        );
        continue;
      }
      const validate = ajv.compile(document);
      const destination =
        registration.registration === "aggregateSchemas" ? aggregateSchemas : schemas;
      destination.set(
        registration.id,
        Object.freeze({
          id: registration.id,
          path: registration.path,
          document,
          canonicalBytes: encoder.encode(canonical.canonical.text),
          validate,
        }),
      );
    } catch (error) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: error instanceof SyntaxError ? "schema-invalid-json" : "schema-value-invalid",
          location: { kind: "artifact", path: registration.path },
          details: { reason: error instanceof SyntaxError ? "invalid-json" : "invalid-schema" },
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  return { kind: "valid", aggregateSchemas, schemas };
}
