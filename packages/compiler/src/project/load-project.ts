import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

import { buildCanonicalRegistries } from "../composition/registries.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  AggregateModelRegistration,
  ApplicationRegistration,
  AssetRegistration,
  CanonicalProjectRegistries,
  CapabilityRequirement,
  CommandRegistration,
  CompilerDiagnostic,
  ComponentRegistration,
  ContentRegistration,
  InvalidProject,
  ModelSchemaRegistration,
  ProgressionRegistration,
  ProjectConfiguration,
  SchemaReference,
  SchemaRegistration,
  SourceExport,
  TrustedMechanicRegistration,
  ValidateProjectInput,
} from "./config.js";
import { PROJECT_FORMAT_VERSION } from "./config.js";
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

function optionalString(
  record: JsonRecord,
  key: string,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): string | undefined {
  return record[key] === undefined
    ? undefined
    : string(record, key, configPath, pointer, diagnostics);
}

function schemaReference(
  value: unknown,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): SchemaReference {
  const record = object(value, configPath, pointer, ["id"], diagnostics) ?? {};
  return Object.freeze({ id: string(record, "id", configPath, pointer, diagnostics) });
}

function capabilities(
  value: unknown,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): readonly CapabilityRequirement[] {
  if (!Array.isArray(value)) {
    valueDiagnostic(diagnostics, configPath, pointer, "array");
    return Object.freeze([]);
  }
  return Object.freeze(
    value.map((item, index) => {
      const itemPointer = `${pointer}/${index}`;
      const record =
        object(item, configPath, itemPointer, ["id", "major", "minimumMinor"], diagnostics) ?? {};
      return Object.freeze({
        id: string(record, "id", configPath, itemPointer, diagnostics),
        major: integer(record, "major", 1, configPath, itemPointer, diagnostics),
        minimumMinor: integer(record, "minimumMinor", 0, configPath, itemPointer, diagnostics),
      });
    }),
  );
}

function modelSchemas(
  value: unknown,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): readonly ModelSchemaRegistration[] {
  if (!Array.isArray(value)) {
    valueDiagnostic(diagnostics, configPath, pointer, "array");
    return Object.freeze([]);
  }
  return Object.freeze(
    value.map((item, index) => {
      const itemPointer = `${pointer}/${index}`;
      const record = object(item, configPath, itemPointer, ["type", "schema"], diagnostics) ?? {};
      return Object.freeze({
        type: string(record, "type", configPath, itemPointer, diagnostics),
        schema: string(record, "schema", configPath, itemPointer, diagnostics),
      });
    }),
  );
}

function projectPath(
  record: JsonRecord,
  key: string,
  configPath: string,
  pointer: string,
  diagnostics: CompilerDiagnostic[],
): string {
  const path = string(record, key, configPath, pointer, diagnostics);
  try {
    validateProjectPath(path);
  } catch (error) {
    if (!(error instanceof ProjectPathPolicyError)) throw error;
    diagnostics.push(projectPathDiagnostic(configPath, `${pointer}/${key}`, path, error));
  }
  return path;
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
        "application",
        "aggregateModels",
        "commands",
        "schemas",
        "progressions",
        "components",
        "content",
        "assets",
        "trustedMechanic",
      ],
      diagnostics,
    ) ?? {};
  if (root.projectFormatVersion !== PROJECT_FORMAT_VERSION) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "configuration-version-unsupported",
        location: location(configPath, "/projectFormatVersion"),
        details: { supported: PROJECT_FORMAT_VERSION },
      }),
    );
  }
  if (root.environment !== "web") {
    valueDiagnostic(diagnostics, configPath, "/environment", 'literal "web"');
  }

  const host =
    object(root.hostApi, configPath, "/hostApi", ["major", "minimumMinor"], diagnostics) ?? {};
  const hostMajor = integer(host, "major", 1, configPath, "/hostApi", diagnostics);
  const hostMinimumMinor = integer(host, "minimumMinor", 0, configPath, "/hostApi", diagnostics);
  if (hostMajor !== 1) valueDiagnostic(diagnostics, configPath, "/hostApi/major", "literal 1");
  if (hostMinimumMinor !== 0 && hostMinimumMinor !== 1) {
    valueDiagnostic(diagnostics, configPath, "/hostApi/minimumMinor", "literal 0 or 1");
  }

  const applicationRecord =
    object(
      root.application,
      configPath,
      "/application",
      ["definition", "components"],
      diagnostics,
    ) ?? {};
  const application: ApplicationRegistration = Object.freeze({
    definition: sourceExport(
      applicationRecord.definition,
      configPath,
      "/application/definition",
      diagnostics,
    ),
    components: stringArray(
      applicationRecord.components,
      configPath,
      "/application/components",
      diagnostics,
    ),
  });

  const aggregateModels: AggregateModelRegistration[] = array(
    root,
    "aggregateModels",
    configPath,
    "",
    diagnostics,
  ).map((item, index) => {
    const pointer = `/aggregateModels/${index}`;
    const raw = item !== null && typeof item === "object" && !Array.isArray(item) ? item : {};
    const authority = (raw as JsonRecord).authority;
    const allowed = [
      "id",
      "authority",
      "kind",
      "stateSchema",
      "initializationSchema",
      "events",
      "effects",
      ...(authority === "server" ? [] : ["initializer", "initializationContent"]),
    ];
    const record = object(item, configPath, pointer, allowed, diagnostics) ?? {};
    const parsedAuthority = string(record, "authority", configPath, pointer, diagnostics);
    const kind = string(record, "kind", configPath, pointer, diagnostics);
    if (parsedAuthority === "local") {
      if (kind !== "player") {
        valueDiagnostic(diagnostics, configPath, `${pointer}/kind`, 'literal "player"');
      }
    } else if (parsedAuthority === "server") {
      if (kind !== "team" && kind !== "session") {
        valueDiagnostic(diagnostics, configPath, `${pointer}/kind`, 'literal "team" or "session"');
      }
    } else {
      valueDiagnostic(
        diagnostics,
        configPath,
        `${pointer}/authority`,
        'literal "local" or "server"',
      );
    }
    const common = {
      id: string(record, "id", configPath, pointer, diagnostics),
      stateSchema: string(record, "stateSchema", configPath, pointer, diagnostics),
      initializationSchema: string(
        record,
        "initializationSchema",
        configPath,
        pointer,
        diagnostics,
      ),
      events: modelSchemas(record.events, configPath, `${pointer}/events`, diagnostics),
      effects: modelSchemas(record.effects, configPath, `${pointer}/effects`, diagnostics),
    } as const;
    if (parsedAuthority === "server") {
      return Object.freeze({
        ...common,
        authority: "server" as const,
        kind: (kind === "session" ? "session" : "team") as "team" | "session",
      });
    }
    const initializationContent = optionalString(
      record,
      "initializationContent",
      configPath,
      pointer,
      diagnostics,
    );
    return Object.freeze({
      ...common,
      authority: "local" as const,
      kind: "player" as const,
      initializer: sourceExport(
        record.initializer,
        configPath,
        `${pointer}/initializer`,
        diagnostics,
      ),
      ...(initializationContent === undefined ? {} : { initializationContent }),
    });
  });

  const commands: CommandRegistration[] = array(root, "commands", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/commands/${index}`;
      const raw = item !== null && typeof item === "object" && !Array.isArray(item) ? item : {};
      const execution = (raw as JsonRecord).execution;
      const record =
        object(
          item,
          configPath,
          pointer,
          [
            "id",
            "type",
            "execution",
            "aggregateModel",
            "payloadSchema",
            "outcomeSchema",
            ...(execution === "trusted-mechanic" ? [] : ["definition"]),
          ],
          diagnostics,
        ) ?? {};
      const parsedExecution = string(record, "execution", configPath, pointer, diagnostics);
      if (parsedExecution !== "local" && parsedExecution !== "trusted-mechanic") {
        valueDiagnostic(
          diagnostics,
          configPath,
          `${pointer}/execution`,
          'literal "local" or "trusted-mechanic"',
        );
      }
      const common = {
        id: string(record, "id", configPath, pointer, diagnostics),
        type: string(record, "type", configPath, pointer, diagnostics),
        aggregateModel: string(record, "aggregateModel", configPath, pointer, diagnostics),
        payloadSchema: string(record, "payloadSchema", configPath, pointer, diagnostics),
        outcomeSchema: string(record, "outcomeSchema", configPath, pointer, diagnostics),
      } as const;
      return parsedExecution === "trusted-mechanic"
        ? Object.freeze({ ...common, execution: "trusted-mechanic" as const })
        : Object.freeze({
            ...common,
            execution: "local" as const,
            definition: sourceExport(
              record.definition,
              configPath,
              `${pointer}/definition`,
              diagnostics,
            ),
          });
    },
  );

  const schemas: SchemaRegistration[] = array(root, "schemas", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/schemas/${index}`;
      const record = object(item, configPath, pointer, ["id", "path"], diagnostics) ?? {};
      return Object.freeze({
        id: string(record, "id", configPath, pointer, diagnostics),
        path: projectPath(record, "path", configPath, pointer, diagnostics),
      });
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
      object(item, configPath, pointer, ["id", "aggregateModel", "definition"], diagnostics) ?? {};
    return Object.freeze({
      id: string(record, "id", configPath, pointer, diagnostics),
      aggregateModel: string(record, "aggregateModel", configPath, pointer, diagnostics),
      definition: sourceExport(record.definition, configPath, `${pointer}/definition`, diagnostics),
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
        [
          "id",
          "implementation",
          "commands",
          "content",
          "assets",
          "capabilities",
          "sharedProjection",
        ],
        diagnostics,
      ) ?? {};
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
      capabilities: capabilities(
        record.capabilities,
        configPath,
        `${pointer}/capabilities`,
        diagnostics,
      ),
      ...(record.sharedProjection === undefined
        ? {}
        : {
            sharedProjection: schemaReference(
              record.sharedProjection,
              configPath,
              `${pointer}/sharedProjection`,
              diagnostics,
            ),
          }),
    });
  });

  const content: ContentRegistration[] = array(root, "content", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/content/${index}`;
      const record = object(item, configPath, pointer, ["id", "path", "schema"], diagnostics) ?? {};
      return Object.freeze({
        id: string(record, "id", configPath, pointer, diagnostics),
        path: projectPath(record, "path", configPath, pointer, diagnostics),
        ...(record.schema === undefined
          ? {}
          : {
              schema: schemaReference(record.schema, configPath, `${pointer}/schema`, diagnostics),
            }),
      });
    },
  );

  const assets: AssetRegistration[] = array(root, "assets", configPath, "", diagnostics).map(
    (item, index) => {
      const pointer = `/assets/${index}`;
      const record =
        object(item, configPath, pointer, ["id", "path", "releasePath"], diagnostics) ?? {};
      const releasePath = string(record, "releasePath", configPath, pointer, diagnostics);
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
        path: projectPath(record, "path", configPath, pointer, diagnostics),
        releasePath,
      });
    },
  );

  let trustedMechanic: TrustedMechanicRegistration | undefined;
  if (root.trustedMechanic !== undefined) {
    const pointer = "/trustedMechanic";
    const record =
      object(
        root.trustedMechanic,
        configPath,
        pointer,
        ["id", "aggregateModel", "commands", "configuration", "projectionSchema", "capabilities"],
        diagnostics,
      ) ?? {};
    trustedMechanic = Object.freeze({
      id: string(record, "id", configPath, pointer, diagnostics),
      aggregateModel: string(record, "aggregateModel", configPath, pointer, diagnostics),
      commands: stringArray(record.commands, configPath, `${pointer}/commands`, diagnostics),
      configuration: string(record, "configuration", configPath, pointer, diagnostics),
      projectionSchema: schemaReference(
        record.projectionSchema,
        configPath,
        `${pointer}/projectionSchema`,
        diagnostics,
      ),
      capabilities: capabilities(
        record.capabilities,
        configPath,
        `${pointer}/capabilities`,
        diagnostics,
      ),
    });
  }

  return Object.freeze({
    projectFormatVersion: PROJECT_FORMAT_VERSION,
    environment: "web",
    hostApi: Object.freeze({ major: hostMajor, minimumMinor: hostMinimumMinor }),
    application,
    aggregateModels: Object.freeze(aggregateModels),
    commands: Object.freeze(commands),
    schemas: Object.freeze(schemas),
    progressions: Object.freeze(progressions),
    components: Object.freeze(components),
    content: Object.freeze(content),
    assets: Object.freeze(assets),
    ...(trustedMechanic === undefined ? {} : { trustedMechanic }),
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
  if (diagnostics.length > 0) {
    return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
  }
  const built = buildCanonicalRegistries(config);
  if (built.kind === "invalid") {
    return Object.freeze({ kind: "invalid", diagnostics: built.diagnostics });
  }
  return Object.freeze({
    kind: "loaded",
    root,
    configPath: projectConfigPath,
    config,
    registries: built.registries,
  });
}
