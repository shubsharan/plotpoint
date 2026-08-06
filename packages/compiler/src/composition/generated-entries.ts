import type { CanonicalProjectRegistries, SourceExport } from "../project/config.js";
import { analyzeSource } from "../imports/analyze-source.js";
import { generateStandaloneSchemaValidators, type ValidatedSchema } from "../validation/schemas.js";
import type { GeneratedRootContract } from "./game-composition.js";

function importSpecifier(projectPath: string): string {
  return projectPath.startsWith("./") ? projectPath : `./${projectPath}`;
}

function selectedImport(imports: string[], namespace: string, selection: SourceExport): string {
  imports.push(
    `import * as ${namespace} from ${JSON.stringify(importSpecifier(selection.source))};`,
  );
  return `${namespace}[${JSON.stringify(selection.export)}]`;
}

export function generatedRootContract(
  registries: CanonicalProjectRegistries,
): GeneratedRootContract {
  const progressionByModel = new Map(
    registries.progressions.map(
      (progression) => [progression.aggregateModel, progression] as const,
    ),
  );
  return Object.freeze({
    aggregateModels: Object.freeze(
      registries.aggregateModels.flatMap((model) => {
        if (model.authority !== "local") return [];
        const progression = progressionByModel.get(model.id);
        return [
          Object.freeze({
            id: model.id,
            commandTypes: Object.freeze(
              registries.commands
                .filter(
                  (command) => command.execution === "local" && command.aggregateModel === model.id,
                )
                .map(({ type }) => type),
            ),
            ...(progression === undefined ? {} : { progressionId: progression.id }),
          }),
        ];
      }),
    ),
    components: Object.freeze(registries.components.map(({ id }) => id)),
  });
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

function standaloneValidatorModule(source: string): string {
  const analysis = analyzeSource("generated/schema-validators.js", source);
  if (analysis.kind === "invalid") {
    throw new Error("Standalone schema validator output is invalid");
  }
  const helperSpecifiers = analysis.references.flatMap((reference) =>
    reference.kind === "commonjs" && reference.specifier !== undefined ? [reference.specifier] : [],
  );
  const supportedHelpers = new Set(["ajv/dist/runtime/equal", "ajv/dist/runtime/ucs2length"]);
  if (helperSpecifiers.some((specifier) => !supportedHelpers.has(specifier))) {
    throw new Error("Standalone schema validator helper is unsupported");
  }
  return `const schemaValidators = (() => {
  const module = { exports: Object.create(null) };
  const exports = module.exports;
  const jsonEqual = (left, right) => {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
      return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
        left.every((value, index) => jsonEqual(value, right[index]));
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
      Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
  };
  const require = (specifier) => {
    if (specifier === "ajv/dist/runtime/equal") return { default: jsonEqual };
    if (specifier === "ajv/dist/runtime/ucs2length") {
      return { default: (value) => [...value].length };
    }
    throw new Error("Unsupported schema validator helper");
  };
  ${source}
  return module.exports;
})();`;
}

export function generateLogicEntry(
  registries: CanonicalProjectRegistries,
  schemas: ReadonlyMap<string, ValidatedSchema>,
): string {
  const imports = [
    'import { bindExecutableAggregateModel, canonicalizeValue, resolveCommandBinding } from "@plotpoint/runtime";',
  ];
  const contract = generatedRootContract(registries);
  const selectedSchemaIds = new Set<string>();
  for (const model of registries.aggregateModels) {
    if (model.authority !== "local") continue;
    selectedSchemaIds.add(model.stateSchema);
    selectedSchemaIds.add(model.initializationSchema);
    for (const entry of [...model.events, ...model.effects]) selectedSchemaIds.add(entry.schema);
  }
  for (const command of registries.commands) {
    if (command.execution !== "local") continue;
    selectedSchemaIds.add(command.payloadSchema);
    selectedSchemaIds.add(command.outcomeSchema);
  }
  const schemaNames = new Map<string, string>();
  const selectedSchemas = [...selectedSchemaIds].sort().map((schemaId) => {
    const schema = schemas.get(schemaId);
    if (schema === undefined) throw new Error(`Validated schema is missing: ${schemaId}`);
    return schema;
  });
  const standaloneValidators = generateStandaloneSchemaValidators(selectedSchemas);
  const validatorModule = standaloneValidatorModule(standaloneValidators.source);
  const schemaBindings = selectedSchemas.map((schema, index) => {
    const name = `runtimeSchema${index}`;
    schemaNames.set(schema.id, name);
    const validatorName = standaloneValidators.validatorNameById.get(schema.id);
    if (validatorName === undefined) {
      throw new Error(`Standalone schema validator is missing: ${schema.id}`);
    }
    return `const ${name} = Object.freeze({
  id: ${JSON.stringify(schema.id)},
  schemaDigest: ${JSON.stringify(schema.digest)},
  validate(value) {
    const canonical = canonicalizeValue(value);
    if (canonical.kind === "invalid") {
      return Object.freeze({
        valid: false,
        diagnostics: Object.freeze([canonical.diagnostic])
      });
    }
    const canonicalValue = canonical.canonical.value;
    if (canonicalValue !== null && typeof canonicalValue === "object" && !Array.isArray(canonicalValue) && schemaValidators[${JSON.stringify(validatorName)}](canonicalValue)) {
      return Object.freeze({ valid: true, value: canonicalValue });
    }
    return Object.freeze({
      valid: false,
      diagnostics: Object.freeze([Object.freeze({
        code: "canonical-value-invalid",
        details: Object.freeze({ schemaId: ${JSON.stringify(schema.id)} })
      })])
    });
  }
});`;
  });
  const schemaName = (schemaId: string): string => {
    const name = schemaNames.get(schemaId);
    if (name === undefined) throw new Error(`Generated schema binding is missing: ${schemaId}`);
    return name;
  };
  const models = contract.aggregateModels.map((rootModel, modelIndex) => {
    const model = registries.aggregateModels.find(
      (candidate) => candidate.authority === "local" && candidate.id === rootModel.id,
    );
    if (model === undefined || model.authority !== "local") {
      throw new Error("Generated local aggregate-model contract is inconsistent");
    }
    const initializer = selectedImport(
      imports,
      `initializerModule${modelIndex}`,
      model.initializer,
    );
    const commandEntries = rootModel.commandTypes.map((commandType, commandIndex) => {
      const command = registries.commands.find(
        (candidate) =>
          candidate.execution === "local" &&
          candidate.aggregateModel === model.id &&
          candidate.type === commandType,
      );
      if (command === undefined || command.execution !== "local") {
        throw new Error("Generated command contract is inconsistent");
      }
      const definition = selectedImport(
        imports,
        `commandModule${modelIndex}_${commandIndex}`,
        command.definition,
      );
      return `[${JSON.stringify(command.type)}]: resolveCommandBinding({
        registrationId: ${JSON.stringify(command.id)},
        definition: ${definition},
        payloadSchema: ${schemaName(command.payloadSchema)},
        outcomeSchema: ${schemaName(command.outcomeSchema)}
      })`;
    });
    const progression =
      rootModel.progressionId === undefined
        ? undefined
        : registries.progressions.find(({ id }) => id === rootModel.progressionId);
    const progressionValue =
      progression === undefined
        ? "undefined"
        : selectedImport(imports, `progressionModule${modelIndex}`, progression.definition);
    const eventSchemas = model.events.map(
      (entry) => `[${JSON.stringify(entry.type)}]: ${schemaName(entry.schema)}`,
    );
    const effectSchemas = model.effects.map(
      (entry) => `[${JSON.stringify(entry.type)}]: ${schemaName(entry.schema)}`,
    );
    return `[${JSON.stringify(model.id)}]: bindExecutableAggregateModel({
        modelId: ${JSON.stringify(model.id)},
        aggregateKind: "player",
        authority: "local",
        stateSchema: ${schemaName(model.stateSchema)},
        initializationSchema: ${schemaName(model.initializationSchema)},
        initializeState: ${initializer},
        commandsByType: Object.freeze({${commandEntries.join(",")}}),
        eventSchemas: Object.freeze({${eventSchemas.join(",")}}),
        effectSchemas: Object.freeze({${effectSchemas.join(",")}}),
        progression: ${progressionValue}
      })`;
  });
  return `${imports.join("\n")}
${validatorModule}
${schemaBindings.join("\n")}
const aggregateModels = Object.freeze({${models.join(",")}});
export { aggregateModels };
`;
}

export function generatePresentationEntry(registries: CanonicalProjectRegistries): string {
  const imports: string[] = [];
  const contract = generatedRootContract(registries);
  const application = selectedImport(
    imports,
    "applicationModule",
    registries.application.definition,
  );
  const components = contract.components.map((componentId, index) => {
    const component = registries.components.find(({ id }) => id === componentId);
    if (component === undefined) throw new Error("Generated component contract is inconsistent");
    const implementation = selectedImport(
      imports,
      `componentModule${index}`,
      component.implementation,
    );
    return `[${JSON.stringify(component.id)}]: ${implementation}`;
  });
  return `${imports.join("\n")}
const application = ${application};
const components = Object.freeze({${components.join(",")}});
export { application, components };
`;
}
