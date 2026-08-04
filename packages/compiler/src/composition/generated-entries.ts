import type { CanonicalProjectRegistries } from "../project/config.js";

function importSpecifier(projectPath: string): string {
  return projectPath.startsWith("./") ? projectPath : `./${projectPath}`;
}

export function generateDefinitionInspectionEntry(registries: CanonicalProjectRegistries): string {
  const imports: string[] = [];
  const commandValues: string[] = [];
  const progressionValues: string[] = [];

  registries.commands.forEach((registration, index) => {
    const moduleName = `commandModule${index}`;
    const valueName = `commandDefinition${index}`;
    imports.push(
      `import * as ${moduleName} from ${JSON.stringify(importSpecifier(registration.definition.source))};`,
    );
    imports.push(
      `const ${valueName} = ${moduleName}[${JSON.stringify(registration.definition.export)}];`,
    );
    commandValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      definitionId: ${valueName}.definitionId,
      commandType: ${valueName}.commandType,
      aggregateKind: ${valueName}.aggregateKind
    }`);
  });

  registries.progressions.forEach((registration, index) => {
    const moduleName = `progressionModule${index}`;
    const valueName = `progressionDefinition${index}`;
    imports.push(
      `import * as ${moduleName} from ${JSON.stringify(importSpecifier(registration.definition.source))};`,
    );
    imports.push(
      `const ${valueName} = ${moduleName}[${JSON.stringify(registration.definition.export)}];`,
    );
    progressionValues.push(`{
      registrationId: ${JSON.stringify(registration.id)},
      graphId: ${valueName}.graphId,
      graphVersion: ${valueName}.graphVersion,
      aggregateKind: ${valueName}.aggregateKind,
      nodes: ${valueName}.nodes.map(({ nodeId, initialStatus }) => ({ nodeId, initialStatus })),
      automaticRules: ${valueName}.automaticRules.map(({ ruleId, targetNodeId, from, to, priority }) => ({
        ruleId, targetNodeId, from, to, priority
      }))
    }`);
  });

  return `${imports.join("\n")}

const metadata = {
  commands: [${commandValues.join(",\n")}],
  progressions: [${progressionValues.join(",\n")}]
};

console.log(JSON.stringify(metadata));
`;
}
