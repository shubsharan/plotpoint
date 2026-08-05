import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

import { CONTRACT_VERSIONS } from "@plotpoint/protocol";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  AggregateKind,
  AggregateSchemaRegistration,
  AssetRegistration,
  CanonicalProjectRegistries,
  CommandRegistration,
  CompilerDiagnostic,
  ComponentRegistration,
  ContentRegistration,
  InvalidProject,
  ProgressionRegistration,
  ProjectConfiguration,
  SchemaRegistration,
  SourceExport,
  ValidateProjectInput,
} from "./config.js";
import {
  ProjectPathPolicyError,
  type ResolvedProjectRoot,
  resolveProjectFile,
  resolveProjectRoot,
  validateProjectPath,
  validateReleaseDestinationPath,
} from "./path-policy.js";

export interface LoadedProject {
  readonly kind: "loaded";
  readonly root: ResolvedProjectRoot;
  readonly configPath: string;
  readonly config: ProjectConfiguration;
  readonly registries: CanonicalProjectRegistries;
}

export type LoadProjectResult = LoadedProject | InvalidProject;

type JsonRecord = Record<string, unknown>;

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

class JsonObjectScanner {
  readonly duplicates: { readonly key: string; readonly pointer: string }[] = [];
  #offset = 0;

  constructor(readonly text: string) {}

  scan(): void {
    this.#value("");
    this.#space();
    if (this.#offset !== this.text.length) throw new SyntaxError("trailing JSON input");
  }

  #space(): void {
    while (/\s/.test(this.text[this.#offset] ?? "")) this.#offset += 1;
  }

  #take(expected: string): void {
    this.#space();
    if (!this.text.startsWith(expected, this.#offset)) throw new SyntaxError("invalid JSON token");
    this.#offset += expected.length;
  }

  #string(): string {
    this.#space();
    const start = this.#offset;
    if (this.text[this.#offset] !== '"') throw new SyntaxError("expected JSON string");
    this.#offset += 1;
    while (this.#offset < this.text.length) {
      const value = this.text[this.#offset];
      if (value === '"') {
        this.#offset += 1;
        return JSON.parse(this.text.slice(start, this.#offset)) as string;
      }
      if (value === "\\") this.#offset += 1;
      this.#offset += 1;
    }
    throw new SyntaxError("unterminated JSON string");
  }

  #value(pointer: string): void {
    this.#space();
    const value = this.text[this.#offset];
    if (value === "{") return this.#object(pointer);
    if (value === "[") return this.#array(pointer);
    if (value === '"') {
      this.#string();
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      this.text.slice(this.#offset),
    );
    if (match === null) throw new SyntaxError("invalid JSON value");
    this.#offset += match[0].length;
  }

  #object(pointer: string): void {
    this.#take("{");
    this.#space();
    if (this.text[this.#offset] === "}") {
      this.#offset += 1;
      return;
    }
    const keys = new Set<string>();
    while (true) {
      const key = this.#string();
      const childPointer = `${pointer}/${pointerSegment(key)}`;
      if (keys.has(key)) this.duplicates.push({ key, pointer: childPointer });
      keys.add(key);
      this.#take(":");
      this.#value(childPointer);
      this.#space();
      const token = this.text[this.#offset];
      if (token === "}") {
        this.#offset += 1;
        return;
      }
      this.#take(",");
    }
  }

  #array(pointer: string): void {
    this.#take("[");
    this.#space();
    if (this.text[this.#offset] === "]") {
      this.#offset += 1;
      return;
    }
    let index = 0;
    while (true) {
      this.#value(`${pointer}/${index}`);
      index += 1;
      this.#space();
      const token = this.text[this.#offset];
      if (token === "]") {
        this.#offset += 1;
        return;
      }
      this.#take(",");
    }
  }
}

function location(configPath: string, pointer: string) {
  return { kind: "configuration" as const, path: configPath, pointer };
}

function valueDiagnostic(
  diagnostics: CompilerDiagnostic[],
  configPath: string,
  pointer: string,
  expected: string,
): void {
  diagnostics.push(
    createCompilerDiagnostic({
      code: "configuration-value-invalid",
      location: location(configPath, pointer),
      details: { expected },
    }),
  );
}

function projectPathDiagnostic(
  configPath: string,
  pointer: string,
  projectPath: string,
  error: ProjectPathPolicyError,
): CompilerDiagnostic {
  return createCompilerDiagnostic({
    code: "project-path-invalid",
    location: location(configPath, pointer),
    details: { path: projectPath, reason: error.reason },
  });
}

function projectFileDiagnostic(projectPath: string, error: unknown): CompilerDiagnostic | null {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return createCompilerDiagnostic({
      code: "project-file-missing",
      location: location(projectPath, ""),
      details: { path: projectPath },
    });
  }
  if (!(error instanceof ProjectPathPolicyError)) return null;
  const code =
    error.reason === "symlink"
      ? "project-path-symlink"
      : error.reason === "case-alias"
        ? "project-path-case-alias"
        : error.reason === "outside-root"
          ? "project-path-outside-root"
          : error.reason === "not-file"
            ? "project-file-not-regular"
            : "project-path-invalid";
  return createCompilerDiagnostic({
    code,
    location: location(projectPath, ""),
    details: { path: projectPath, reason: error.reason },
  });
}

function object(
  value: unknown,
  configPath: string,
  pointer: string,
  allowed: readonly string[],
  diagnostics: CompilerDiagnostic[],
): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    valueDiagnostic(diagnostics, configPath, pointer, "object");
    return null;
  }
  const record = value as JsonRecord;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "configuration-unknown-field",
          location: location(configPath, `${pointer}/${pointerSegment(key)}`),
          details: { field: key },
        }),
      );
    }
  }
  return record;
}

function string(
  record: JsonRecord,
  key: string,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): string {
  const value = record[key];
  if (typeof value === "string" && /^[\x21-\x7e]+$/.test(value)) return value;
  valueDiagnostic(diagnostics, configPath, `${pointer}/${key}`, "non-empty printable ASCII string");
  return "";
}

function integer(
  record: JsonRecord,
  key: string,
  minimum: number,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): number {
  const value = record[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum) return value;
  valueDiagnostic(diagnostics, configPath, `${pointer}/${key}`, `integer >= ${minimum}`);
  return minimum;
}

function array(
  record: JsonRecord,
  key: string,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): readonly unknown[] {
  const value = record[key];
  if (Array.isArray(value)) return value;
  valueDiagnostic(diagnostics, configPath, `${pointer}/${key}`, "array");
  return [];
}

function sourceExport(
  value: unknown,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): SourceExport {
  const record = object(value, configPath, pointer, ["source", "export"], diagnostics) ?? {};
  const source = string(record, "source", configPath, pointer, diagnostics);
  const exportName = string(record, "export", configPath, pointer, diagnostics);
  try {
    validateProjectPath(source);
  } catch (error) {
    if (!(error instanceof ProjectPathPolicyError)) throw error;
    diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/source`, source, error));
  }
  return Object.freeze({ source, export: exportName });
}

function stringArray(
  value: unknown,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): readonly string[] {
  if (!Array.isArray(value)) {
    valueDiagnostic(diagnostics, configPath, pointer, "string array");
    return Object.freeze([]);
  }
  return Object.freeze(
    value.map((item, index) => {
      if (typeof item === "string" && /^[\x21-\x7e]+$/.test(item)) return item;
      valueDiagnostic(
        diagnostics,
        configPath,
        `${pointer}/${index}`,
        "non-empty printable ASCII string",
      );
      return "";
    }),
  );
}

function parseConfiguration(
  value: unknown,
  configPath: string,
  diagnostics: CompilerDiagnostic[],
): ProjectConfiguration {
  const root =
    object(
      value,
      configPath,
      "",
      [
        "projectFormatVersion",
        "environment",
        "hostApi",
        "entries",
        "commands",
        "aggregateSchemas",
        "schemas",
        "progressions",
        "components",
        "content",
        "assets",
      ],
      diagnostics,
    ) ?? {};
  if (root.projectFormatVersion !== CONTRACT_VERSIONS.projectConfiguration) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "configuration-version-unsupported",
        location: location(configPath, "/projectFormatVersion"),
        details: { supported: 1 },
      }),
    );
  }
  if (root.environment !== "web") {
    valueDiagnostic(diagnostics, configPath, "/environment", 'literal "web"');
  }

  const host =
    object(root.hostApi, configPath, "/hostApi", ["major", "minimumMinor"], diagnostics) ?? {};
  const entries =
    object(root.entries, configPath, "/entries", ["logic", "presentation"], diagnostics) ?? {};

  const commands: CommandRegistration[] = array(root, "commands", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/commands/${index}`;
      const record =
        object(
          item,
          configPath,
          pointer,
          ["id", "type", "definition", "aggregateSchema", "payloadSchema", "outcomeSchema"],
          diagnostics,
        ) ?? {};
      return Object.freeze({
        id: string(record, "id", configPath, pointer, diagnostics),
        type: string(record, "type", configPath, pointer, diagnostics),
        definition: sourceExport(
          record.definition,
          configPath,
          `${pointer}/definition`,
          diagnostics,
        ),
        aggregateSchema: string(record, "aggregateSchema", configPath, pointer, diagnostics),
        payloadSchema: string(record, "payloadSchema", configPath, pointer, diagnostics),
        outcomeSchema: string(record, "outcomeSchema", configPath, pointer, diagnostics),
      });
    },
  );

  const aggregateSchemas: AggregateSchemaRegistration[] = array(
    root,
    "aggregateSchemas",
    configPath,
    "",
    diagnostics,
  ).map((item, index) => {
    const pointer = `/aggregateSchemas/${index}`;
    const record =
      object(item, configPath, pointer, ["id", "kind", "version", "path"], diagnostics) ?? {};
    const kind = string(record, "kind", configPath, pointer, diagnostics);
    if (!(["player", "team", "session"] as const).includes(kind as AggregateKind)) {
      valueDiagnostic(diagnostics, configPath, `${pointer}/kind`, "aggregate kind");
    }
    const path = string(record, "path", configPath, pointer, diagnostics);
    try {
      validateProjectPath(path);
    } catch (error) {
      if (!(error instanceof ProjectPathPolicyError)) throw error;
      diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/path`, path, error));
    }
    return Object.freeze({
      id: string(record, "id", configPath, pointer, diagnostics),
      kind: kind as AggregateKind,
      version: integer(record, "version", 1, configPath, pointer, diagnostics),
      path,
    });
  });

  const schemas: SchemaRegistration[] = array(root, "schemas", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/schemas/${index}`;
      const record = object(item, configPath, pointer, ["id", "path"], diagnostics) ?? {};
      const path = string(record, "path", configPath, pointer, diagnostics);
      try {
        validateProjectPath(path);
      } catch (error) {
        if (!(error instanceof ProjectPathPolicyError)) throw error;
        diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/path`, path, error));
      }
      return Object.freeze({ id: string(record, "id", configPath, pointer, diagnostics), path });
    },
  );

  const progressions: ProgressionRegistration[] = array(
    root,
    "progressions",
    configPath,
    "",
    diagnostics,
  ).map((item, index) => {
    const pointer = `/progressions/${index}`;
    const record =
      object(
        item,
        configPath,
        pointer,
        [
          "id",
          "version",
          "kind",
          "definition",
          "aggregateSchema",
          "commands",
          "content",
          "components",
        ],
        diagnostics,
      ) ?? {};
    const kind = string(record, "kind", configPath, pointer, diagnostics);
    if (!(["player", "team", "session"] as const).includes(kind as AggregateKind)) {
      valueDiagnostic(diagnostics, configPath, `${pointer}/kind`, "aggregate kind");
    }
    return Object.freeze({
      id: string(record, "id", configPath, pointer, diagnostics),
      version: integer(record, "version", 1, configPath, pointer, diagnostics),
      kind: kind as AggregateKind,
      definition: sourceExport(record.definition, configPath, `${pointer}/definition`, diagnostics),
      aggregateSchema: string(record, "aggregateSchema", configPath, pointer, diagnostics),
      commands: stringArray(record.commands, configPath, `${pointer}/commands`, diagnostics),
      content: stringArray(record.content, configPath, `${pointer}/content`, diagnostics),
      components: stringArray(record.components, configPath, `${pointer}/components`, diagnostics),
    });
  });

  const components: ComponentRegistration[] = array(
    root,
    "components",
    configPath,
    "",
    diagnostics,
  ).map((item, index) => {
    const pointer = `/components/${index}`;
    const record =
      object(
        item,
        configPath,
        pointer,
        ["id", "implementation", "commands", "content", "assets", "capabilities"],
        diagnostics,
      ) ?? {};
    const capabilities = Array.isArray(record.capabilities)
      ? record.capabilities.map((item, capabilityIndex) => {
          const capabilityPointer = `${pointer}/capabilities/${capabilityIndex}`;
          const capability =
            object(
              item,
              configPath,
              capabilityPointer,
              ["id", "major", "minimumMinor"],
              diagnostics,
            ) ?? {};
          return Object.freeze({
            id: string(capability, "id", configPath, capabilityPointer, diagnostics),
            major: integer(capability, "major", 1, configPath, capabilityPointer, diagnostics),
            minimumMinor: integer(
              capability,
              "minimumMinor",
              0,
              configPath,
              capabilityPointer,
              diagnostics,
            ),
          });
        })
      : (valueDiagnostic(diagnostics, configPath, `${pointer}/capabilities`, "array"), []);
    return Object.freeze({
      id: string(record, "id", configPath, pointer, diagnostics),
      implementation: sourceExport(
        record.implementation,
        configPath,
        `${pointer}/implementation`,
        diagnostics,
      ),
      commands: stringArray(record.commands, configPath, `${pointer}/commands`, diagnostics),
      content: stringArray(record.content, configPath, `${pointer}/content`, diagnostics),
      assets: stringArray(record.assets, configPath, `${pointer}/assets`, diagnostics),
      capabilities: Object.freeze(capabilities),
    });
  });

  const content: ContentRegistration[] = array(root, "content", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/content/${index}`;
      const record = object(item, configPath, pointer, ["id", "path", "schema"], diagnostics) ?? {};
      const path = string(record, "path", configPath, pointer, diagnostics);
      try {
        validateProjectPath(path);
      } catch (error) {
        if (!(error instanceof ProjectPathPolicyError)) throw error;
        diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/path`, path, error));
      }
      const schema =
        record.schema === undefined
          ? undefined
          : string(record, "schema", configPath, pointer, diagnostics);
      return Object.freeze({
        id: string(record, "id", configPath, pointer, diagnostics),
        path,
        ...(schema === undefined ? {} : { schema }),
      });
    },
  );

  const assets: AssetRegistration[] = array(root, "assets", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/assets/${index}`;
      const record =
        object(item, configPath, pointer, ["id", "path", "releasePath"], diagnostics) ?? {};
      const path = string(record, "path", configPath, pointer, diagnostics);
      const releasePath = string(record, "releasePath", configPath, pointer, diagnostics);
      try {
        validateProjectPath(path);
      } catch (error) {
        if (!(error instanceof ProjectPathPolicyError)) throw error;
        diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/path`, path, error));
      }
      try {
        validateReleaseDestinationPath(releasePath);
      } catch (error) {
        if (!(error instanceof ProjectPathPolicyError)) throw error;
        diagnostics.push(
          createCompilerDiagnostic({
            code: "release-destination-invalid",
            location: location(configPath, `${pointer}/releasePath`),
            details: { path: releasePath },
          }),
        );
      }
      return Object.freeze({
        id: string(record, "id", configPath, pointer, diagnostics),
        path,
        releasePath,
      });
    },
  );

  return Object.freeze({
    projectFormatVersion: CONTRACT_VERSIONS.projectConfiguration,
    environment: "web",
    hostApi: Object.freeze({
      major: integer(host, "major", 1, configPath, "/hostApi", diagnostics),
      minimumMinor: integer(host, "minimumMinor", 0, configPath, "/hostApi", diagnostics),
    }),
    entries: Object.freeze({
      logic: sourceExport(entries.logic, configPath, "/entries/logic", diagnostics),
      presentation: sourceExport(
        entries.presentation,
        configPath,
        "/entries/presentation",
        diagnostics,
      ),
    }),
    commands: Object.freeze(commands),
    aggregateSchemas: Object.freeze(aggregateSchemas),
    schemas: Object.freeze(schemas),
    progressions: Object.freeze(progressions),
    components: Object.freeze(components),
    content: Object.freeze(content),
    assets: Object.freeze(assets),
  });
}

function ordinal<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  return Object.freeze(
    [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  );
}

function buildRegistries(
  config: ProjectConfiguration,
  configPath: string,
  diagnostics: CompilerDiagnostic[],
): CanonicalProjectRegistries {
  const registrations = [
    ["commands", config.commands],
    ["aggregateSchemas", config.aggregateSchemas],
    ["schemas", config.schemas],
    ["progressions", config.progressions],
    ["components", config.components],
    ["content", config.content],
    ["assets", config.assets],
  ] as const;
  for (const [kind, values] of registrations) {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value.id)) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "configuration-identity-duplicate",
            location: { kind: "registration", registration: kind, id: value.id },
            details: { id: value.id, registry: kind },
            related: [location(configPath, `/${kind}`)],
          }),
        );
      }
      seen.add(value.id);
    }
  }
  return Object.freeze({
    commands: ordinal(config.commands),
    aggregateSchemas: ordinal(config.aggregateSchemas),
    schemas: ordinal(config.schemas),
    progressions: ordinal(config.progressions),
    components: ordinal(config.components),
    content: ordinal(config.content),
    assets: ordinal(config.assets),
  });
}

export async function loadProject(input: ValidateProjectInput): Promise<LoadProjectResult> {
  const configPath = input.configPath ?? "plotpoint.project.json";
  let root: ResolvedProjectRoot;
  try {
    root = await resolveProjectRoot(input.projectRoot);
  } catch (error) {
    const diagnostic = projectFileDiagnostic(configPath, error);
    if (diagnostic === null) throw error;
    return Object.freeze({ kind: "invalid", diagnostics: Object.freeze([diagnostic]) });
  }
  const projectConfigPath = isAbsolute(configPath)
    ? relative(root.path, configPath).split("\\").join("/")
    : configPath;
  let text: string;
  try {
    const resolved = await resolveProjectFile(root, projectConfigPath);
    text = await readFile(resolved.absolutePath, "utf8");
  } catch (error) {
    const diagnostic = projectFileDiagnostic(projectConfigPath, error);
    if (diagnostic === null) throw error;
    return Object.freeze({ kind: "invalid", diagnostics: Object.freeze([diagnostic]) });
  }
  const diagnostics: CompilerDiagnostic[] = [];

  let value: unknown;
  try {
    const scanner = new JsonObjectScanner(text);
    scanner.scan();
    value = JSON.parse(text) as unknown;
    for (const duplicate of scanner.duplicates) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "configuration-duplicate-key",
          location: location(projectConfigPath, duplicate.pointer),
          details: { key: duplicate.key },
        }),
      );
    }
  } catch {
    return Object.freeze({
      kind: "invalid",
      diagnostics: Object.freeze([
        createCompilerDiagnostic({
          code: "configuration-invalid-json",
          location: location(projectConfigPath, ""),
        }),
      ]),
    });
  }

  if (diagnostics.length > 0) {
    return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
  }
  const config = parseConfiguration(value, projectConfigPath, diagnostics);
  const registries = buildRegistries(config, projectConfigPath, diagnostics);
  if (diagnostics.length > 0) {
    return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
  }
  return Object.freeze({ kind: "loaded", root, configPath: projectConfigPath, config, registries });
}
