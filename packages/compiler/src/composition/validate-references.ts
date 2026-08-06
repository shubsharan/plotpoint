import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import { resolveGraphExport, type ImportGraph } from "../imports/resolve-graph.js";
import type {
  CanonicalProjectRegistries,
  CompilerDiagnostic,
  SourceExport,
} from "../project/config.js";

function ids(values: readonly { readonly id: string }[]): ReadonlySet<string> {
  return new Set(values.map(({ id }) => id));
}

function registrationLocation(registration: string, id: string, field?: string) {
  return {
    kind: "registration" as const,
    registration,
    id,
    ...(field === undefined ? {} : { field }),
  };
}

export function validateReferences(
  registries: CanonicalProjectRegistries,
): readonly CompilerDiagnostic[] {
  const models = new Map(registries.aggregateModels.map((value) => [value.id, value] as const));
  const commands = new Map(registries.commands.map((value) => [value.id, value] as const));
  const schemaIds = ids(registries.schemas);
  const componentIds = ids(registries.components);
  const content = new Map(registries.content.map((value) => [value.id, value] as const));
  const assetIds = ids(registries.assets);
  const diagnostics: CompilerDiagnostic[] = [];

  const resourceOwners = new Map<string, string>();
  for (const [registration, values] of [
    ["schemas", registries.schemas],
    ["content", registries.content],
    ["assets", registries.assets],
    ["progressions", registries.progressions],
    ["components", registries.components],
  ] as const) {
    for (const value of values) {
      const prior = resourceOwners.get(value.id);
      if (prior === undefined) {
        resourceOwners.set(value.id, registration);
        continue;
      }
      diagnostics.push(
        createCompilerDiagnostic({
          code: "composition-reference-duplicate",
          location: registrationLocation(registration, value.id),
          details: { id: value.id, priorRegistration: prior },
        }),
      );
    }
  }

  function requireReference(
    exists: ReadonlySet<string> | ReadonlyMap<string, unknown>,
    registration: string,
    id: string,
    field: string,
    target: string,
  ): boolean {
    if (exists.has(target)) return true;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "composition-reference-missing",
        location: registrationLocation(registration, id, field),
        details: { target },
      }),
    );
    return false;
  }

  const localModels = registries.aggregateModels.filter(({ authority }) => authority === "local");
  if (localModels.length !== 1) {
    diagnostics.push(
      createCompilerDiagnostic({
        code: "configuration-value-invalid",
        location: {
          kind: "configuration",
          path: "plotpoint.project.json",
          pointer: "/aggregateModels",
        },
        details: { expected: "exactly one local player model" },
      }),
    );
  }

  for (const model of registries.aggregateModels) {
    requireReference(schemaIds, "aggregateModels", model.id, "stateSchema", model.stateSchema);
    requireReference(
      schemaIds,
      "aggregateModels",
      model.id,
      "initializationSchema",
      model.initializationSchema,
    );
    for (const entry of [...model.events, ...model.effects]) {
      requireReference(schemaIds, "aggregateModels", model.id, "schema", entry.schema);
    }
    if (model.authority !== "local" || model.initializationContent === undefined) continue;
    const selectedContent = content.get(model.initializationContent);
    if (
      requireReference(
        content,
        "aggregateModels",
        model.id,
        "initializationContent",
        model.initializationContent,
      ) &&
      selectedContent?.schema?.id !== model.initializationSchema
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "content-schema-invalid",
          location: registrationLocation("aggregateModels", model.id, "initializationContent"),
          details: {
            content: model.initializationContent,
            expectedSchema: model.initializationSchema,
            actualSchema: selectedContent?.schema?.id ?? null,
          },
        }),
      );
    }
  }

  const commandTypes = new Map<string, string>();
  for (const command of registries.commands) {
    const model = models.get(command.aggregateModel);
    requireReference(models, "commands", command.id, "aggregateModel", command.aggregateModel);
    requireReference(schemaIds, "commands", command.id, "payloadSchema", command.payloadSchema);
    requireReference(schemaIds, "commands", command.id, "outcomeSchema", command.outcomeSchema);
    if (
      model !== undefined &&
      ((command.execution === "local" && model.authority !== "local") ||
        (command.execution === "trusted-mechanic" && model.authority !== "server"))
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "command-aggregate-mismatch",
          location: registrationLocation("commands", command.id, "aggregateModel"),
          details: {
            aggregateModel: command.aggregateModel,
            authority: model.authority,
            execution: command.execution,
          },
        }),
      );
    }
    const typeKey = `${command.aggregateModel}\0${command.type}`;
    const prior = commandTypes.get(typeKey);
    if (prior !== undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "command-type-duplicate",
          location: registrationLocation("commands", command.id, "type"),
          details: {
            aggregateModel: command.aggregateModel,
            commandType: command.type,
            priorRegistration: prior,
          },
        }),
      );
    } else {
      commandTypes.set(typeKey, command.id);
    }
  }

  const progressionByModel = new Map<string, string>();
  for (const progression of registries.progressions) {
    const model = models.get(progression.aggregateModel);
    requireReference(
      models,
      "progressions",
      progression.id,
      "aggregateModel",
      progression.aggregateModel,
    );
    if (model !== undefined && model.authority !== "local") {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-invalid",
          location: registrationLocation("progressions", progression.id, "aggregateModel"),
          details: { reason: "server-progression-unsupported" },
        }),
      );
    }
    const prior = progressionByModel.get(progression.aggregateModel);
    if (prior !== undefined) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "progression-invalid",
          location: registrationLocation("progressions", progression.id, "aggregateModel"),
          details: { reason: "multiple-model-progressions", priorRegistration: prior },
        }),
      );
    } else {
      progressionByModel.set(progression.aggregateModel, progression.id);
    }
  }

  for (const target of registries.application.components) {
    requireReference(componentIds, "application", "application", "components", target);
  }
  for (const component of registries.components) {
    for (const target of component.commands) {
      requireReference(commands, "components", component.id, "commands", target);
    }
    for (const target of component.content) {
      requireReference(content, "components", component.id, "content", target);
    }
    for (const target of component.assets) {
      requireReference(assetIds, "components", component.id, "assets", target);
    }
    if (component.sharedProjection !== undefined) {
      requireReference(
        schemaIds,
        "components",
        component.id,
        "sharedProjection",
        component.sharedProjection.id,
      );
    }
    const selectsTrustedCommand = component.commands.some(
      (commandId) => commands.get(commandId)?.execution === "trusted-mechanic",
    );
    if (
      selectsTrustedCommand &&
      component.sharedProjection?.id !== registries.trustedMechanic?.projectionSchema.id
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "component-reference-missing",
          location: registrationLocation("components", component.id, "sharedProjection"),
          details: {
            target: registries.trustedMechanic?.projectionSchema.id ?? "trustedMechanic",
          },
        }),
      );
    }
  }

  const mechanic = registries.trustedMechanic;
  const selectedServerModel = mechanic?.aggregateModel;
  const selectedTrustedCommands = new Set(mechanic?.commands ?? []);
  for (const model of registries.aggregateModels) {
    if (model.authority === "server" && model.id !== selectedServerModel) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "composition-reference-missing",
          location: registrationLocation("aggregateModels", model.id, "authority"),
          details: { target: "trustedMechanic" },
        }),
      );
    }
  }
  for (const command of registries.commands) {
    if (command.execution === "trusted-mechanic" && !selectedTrustedCommands.has(command.id)) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "composition-reference-missing",
          location: registrationLocation("commands", command.id, "execution"),
          details: { target: "trustedMechanic.commands" },
        }),
      );
    }
  }
  if (mechanic !== undefined) {
    const model = models.get(mechanic.aggregateModel);
    if (
      requireReference(
        models,
        "trustedMechanic",
        mechanic.id,
        "aggregateModel",
        mechanic.aggregateModel,
      ) &&
      model?.authority !== "server"
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "command-aggregate-mismatch",
          location: registrationLocation("trustedMechanic", mechanic.id, "aggregateModel"),
          details: { aggregateModel: mechanic.aggregateModel, authority: model?.authority ?? null },
        }),
      );
    }
    for (const target of mechanic.commands) {
      const command = commands.get(target);
      if (!requireReference(commands, "trustedMechanic", mechanic.id, "commands", target)) continue;
      if (
        command?.execution !== "trusted-mechanic" ||
        command.aggregateModel !== mechanic.aggregateModel
      ) {
        diagnostics.push(
          createCompilerDiagnostic({
            code: "command-aggregate-mismatch",
            location: registrationLocation("trustedMechanic", mechanic.id, "commands"),
            details: { command: target, aggregateModel: mechanic.aggregateModel },
          }),
        );
      }
    }
    const configuration = content.get(mechanic.configuration);
    if (
      requireReference(
        content,
        "trustedMechanic",
        mechanic.id,
        "configuration",
        mechanic.configuration,
      ) &&
      configuration?.schema === undefined
    ) {
      diagnostics.push(
        createCompilerDiagnostic({
          code: "content-schema-invalid",
          location: registrationLocation("trustedMechanic", mechanic.id, "configuration"),
          details: { content: mechanic.configuration, reason: "schema-required" },
        }),
      );
    }
    requireReference(
      schemaIds,
      "trustedMechanic",
      mechanic.id,
      "projectionSchema",
      mechanic.projectionSchema.id,
    );
  }

  return orderCompilerDiagnostics(diagnostics);
}

export function validateDefinitionExports(
  definitions: readonly {
    readonly registration: string;
    readonly id: string;
    readonly selected: SourceExport;
    readonly graph: ImportGraph;
  }[],
): readonly CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const { registration, id, selected, graph } of definitions) {
    const resolution = resolveGraphExport(graph, selected.source, selected.export);
    if (resolution === "resolved") continue;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "definition-export-missing",
        location: registrationLocation(registration, id, "definition"),
        details: {
          export: selected.export,
          reason: resolution === "ambiguous" ? "export-ambiguous" : "export-missing",
          source: selected.source,
        },
      }),
    );
  }
  return orderCompilerDiagnostics(diagnostics);
}
