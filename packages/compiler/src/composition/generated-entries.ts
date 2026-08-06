import type { CanonicalProjectRegistries, SourceExport } from "../project/config.js";

function importSpecifier(projectPath: string): string {
  return projectPath.startsWith("./") ? projectPath : `./${projectPath}`;
}

function selectedImport(imports: string[], namespace: string, selection: SourceExport): string {
  imports.push(
    `import * as ${namespace} from ${JSON.stringify(importSpecifier(selection.source))};`,
  );
  return `${namespace}[${JSON.stringify(selection.export)}]`;
}

export function generateDefinitionInspectionEntry(registries: CanonicalProjectRegistries): string {
  const imports: string[] = [];
  const application = selectedImport(
    imports,
    "applicationModule",
    registries.application.definition,
  );
  const modelValues: string[] = [];
  const commandValues: string[] = [];
  const progressionValues: string[] = [];
  const componentValues: string[] = [];

  registries.aggregateModels.forEach((registration, index) => {
    if (registration.authority !== "local") return;
    const value = selectedImport(imports, `initializerModule${index}`, registration.initializer);
    modelValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      initializerType: typeof ${value}
    }`);
  });

  registries.commands.forEach((registration, index) => {
    if (registration.execution !== "local") return;
    const value = selectedImport(imports, `commandModule${index}`, registration.definition);
    commandValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      definitionId: ${value}.definitionId,
      commandType: ${value}.commandType,
      aggregateKind: ${value}.aggregateKind
    }`);
  });

  registries.progressions.forEach((registration, index) => {
    const value = selectedImport(imports, `progressionModule${index}`, registration.definition);
    progressionValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      graphId: ${value}.graphId,
      aggregateKind: ${value}.aggregateKind,
      nodes: ${value}.nodes.map(({ nodeId, initialStatus }) => ({ nodeId, initialStatus })),
      transitions: ${value}.transitions.map(({ transitionId, targetNodeId, from, to, priority, trigger }) => ({
        transitionId, targetNodeId, from, to, priority, trigger
      }))
    }`);
  });

  registries.components.forEach((registration, index) => {
    const value = selectedImport(imports, `componentModule${index}`, registration.implementation);
    componentValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      implementationType: typeof ${value}
    }`);
  });

  return `${imports.join("\n")}

const selectedApplication = ${application};
const metadata = {
  application: {
    keys: selectedApplication !== null && typeof selectedApplication === "object"
      ? Object.keys(selectedApplication).sort()
      : [],
    mountType: selectedApplication !== null && typeof selectedApplication === "object"
      ? typeof selectedApplication.mount
      : "undefined"
  },
  aggregateModels: [${modelValues.join(",\n")}],
  commands: [${commandValues.join(",\n")}],
  progressions: [${progressionValues.join(",\n")}],
  components: [${componentValues.join(",\n")}]
};

console.log(JSON.stringify(metadata));
`;
}

export function generateLogicEntry(registries: CanonicalProjectRegistries): string {
  const imports: string[] = [];
  const progressionByModel = new Map(
    registries.progressions.map(
      (progression) => [progression.aggregateModel, progression] as const,
    ),
  );
  const models = registries.aggregateModels.flatMap((model, modelIndex) => {
    if (model.authority !== "local") return [];
    const initializer = selectedImport(
      imports,
      `initializerModule${modelIndex}`,
      model.initializer,
    );
    const commandEntries = registries.commands.flatMap((command, commandIndex) => {
      if (command.execution !== "local" || command.aggregateModel !== model.id) return [];
      const definition = selectedImport(
        imports,
        `commandModule${commandIndex}`,
        command.definition,
      );
      return [`${JSON.stringify(command.type)}: ${definition}`];
    });
    const progression = progressionByModel.get(model.id);
    const progressionValue =
      progression === undefined
        ? "undefined"
        : selectedImport(imports, `progressionModule${modelIndex}`, progression.definition);
    return [
      `${JSON.stringify(model.id)}: Object.freeze({
        modelId: ${JSON.stringify(model.id)},
        aggregateKind: "player",
        authority: "local",
        stateSchemaId: ${JSON.stringify(model.stateSchema)},
        initializationSchemaId: ${JSON.stringify(model.initializationSchema)},
        initializeState: ${initializer},
        commandsByType: Object.freeze({${commandEntries.join(",")}}),
        progression: ${progressionValue}
      })`,
    ];
  });
  return `${imports.join("\n")}
const aggregateModels = Object.freeze({${models.join(",")}});
export { aggregateModels };
`;
}

export function generatePresentationEntry(registries: CanonicalProjectRegistries): string {
  const imports: string[] = [];
  const application = selectedImport(
    imports,
    "applicationModule",
    registries.application.definition,
  );
  const components = registries.components.map((component, index) => {
    const implementation = selectedImport(
      imports,
      `componentModule${index}`,
      component.implementation,
    );
    return `${JSON.stringify(component.id)}: ${implementation}`;
  });
  return `${imports.join("\n")}
const application = ${application};
const components = Object.freeze({${components.join(",")}});
export { application, components };
`;
}
