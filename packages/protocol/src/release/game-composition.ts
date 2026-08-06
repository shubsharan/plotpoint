import { encodeCanonicalJson } from "./canonical-json.js";
import { compareOrdinal, GAME_COMPOSITION_PATH } from "./paths.js";
import type {
  InspectedRelease,
  InvalidRelease,
  ReleaseEntryKind,
  ReleaseManifest,
} from "./types.js";

export interface SchemaReference {
  readonly id: string;
}

export interface GameCapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

export interface EventOrEffectDescriptor {
  readonly type: string;
  readonly schema: SchemaReference;
}

interface AggregateModelDescriptorBase {
  readonly id: string;
  readonly stateSchema: SchemaReference;
  readonly initializationSchema: SchemaReference;
  readonly events: readonly EventOrEffectDescriptor[];
  readonly effects: readonly EventOrEffectDescriptor[];
}

export interface LocalAggregateModelDescriptor extends AggregateModelDescriptorBase {
  readonly authority: "local";
  readonly kind: "player";
  readonly initializationContent?: string;
}

export interface ServerAggregateModelDescriptor extends AggregateModelDescriptorBase {
  readonly authority: "server";
  readonly kind: "team" | "session";
}

export type AggregateModelDescriptor =
  | LocalAggregateModelDescriptor
  | ServerAggregateModelDescriptor;

export interface CommandDescriptor {
  readonly id: string;
  readonly type: string;
  readonly aggregateModel: string;
  readonly payloadSchema: SchemaReference;
  readonly outcomeSchema: SchemaReference;
  readonly execution: "local" | "trusted-mechanic";
}

export interface ProgressionDescriptor {
  readonly id: string;
  readonly aggregateModel: string;
}

export interface DependencySelection {
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: readonly GameCapabilityRequirement[];
  readonly sharedProjection?: SchemaReference;
}

export interface ComponentDescriptor extends DependencySelection {
  readonly id: string;
}

interface ResourceBindingBase {
  readonly id: string;
  readonly path: string;
}

export type ResourceBinding =
  | (ResourceBindingBase & { readonly role: "schema" })
  | (ResourceBindingBase & {
      readonly role: "content";
      readonly schema?: SchemaReference;
    })
  | (ResourceBindingBase & {
      readonly role: "asset" | "progression-descriptor" | "component-descriptor";
    });

export interface TrustedMechanicBinding {
  readonly id: string;
  readonly aggregateModel: string;
  readonly commands: readonly string[];
  readonly configuration: string;
  readonly projectionSchema: SchemaReference;
  readonly capabilities: readonly GameCapabilityRequirement[];
}

export interface GameComposition {
  readonly application: {
    readonly components: readonly string[];
  };
  readonly aggregateModels: readonly AggregateModelDescriptor[];
  readonly commands: readonly CommandDescriptor[];
  readonly progressions: readonly ProgressionDescriptor[];
  readonly components: readonly ComponentDescriptor[];
  readonly resources: readonly ResourceBinding[];
  readonly trustedMechanic?: TrustedMechanicBinding;
}

export interface GameReleaseInspection {
  readonly release: InspectedRelease;
  readonly gameComposition: GameComposition;
}

export type GameCompositionParseResult =
  | { readonly kind: "valid"; readonly gameComposition: GameComposition }
  | InvalidRelease;

export type GameCompositionIssueCode =
  | "application-component-missing"
  | "command-aggregate-mismatch"
  | "command-reference-missing"
  | "component-shared-projection-mismatch"
  | "content-reference-missing"
  | "duplicate-command-type"
  | "initialization-schema-mismatch"
  | "local-model-count-invalid"
  | "multiple-model-progressions"
  | "progression-aggregate-mismatch"
  | "resource-reference-missing"
  | "schema-reference-missing"
  | "trusted-configuration-schema-missing"
  | "unselected-server-model"
  | "unselected-trusted-command";

export interface GameCompositionIssue {
  readonly code: GameCompositionIssueCode;
  readonly path: string;
  readonly subject: string;
  readonly related?: string;
}

function invalid(reason: string, path = ""): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "composition",
        code: "game-composition-invalid",
        path,
        details: Object.freeze({ reason }),
      }),
    ],
  };
}

function inventoryInvalid(reason: string, path = ""): InvalidRelease {
  return {
    kind: "invalid",
    diagnostics: [
      Object.freeze({
        category: "composition",
        code: "game-composition-inventory-mismatch",
        path,
        details: Object.freeze({ reason }),
      }),
    ],
  };
}

function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /^[\x21-\x7e]+$/.test(value);
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function reference(value: unknown): value is SchemaReference {
  return object(value) && exact(value, ["id"]) && id(value.id);
}

function capability(value: unknown): value is GameCapabilityRequirement {
  return (
    object(value) &&
    exact(value, ["id", "major", "minimumMinor"]) &&
    id(value.id) &&
    positive(value.major) &&
    nonnegative(value.minimumMinor)
  );
}

function ordinalUnique<Value>(values: readonly Value[], key: (value: Value) => string): boolean {
  let previous: string | undefined;
  for (const value of values) {
    const current = key(value);
    if (previous !== undefined && compareOrdinal(previous, current) >= 0) return false;
    previous = current;
  }
  return true;
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(id) && ordinalUnique(value, (item) => item);
}

function capabilityArray(value: unknown): value is readonly GameCapabilityRequirement[] {
  return (
    Array.isArray(value) &&
    value.every(capability) &&
    ordinalUnique(value, (item) => `${item.id}\0${String(item.major).padStart(16, "0")}`)
  );
}

function records(value: unknown): value is readonly EventOrEffectDescriptor[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        object(item) && exact(item, ["schema", "type"]) && id(item.type) && reference(item.schema),
    ) &&
    ordinalUnique(value as readonly EventOrEffectDescriptor[], (item) => item.type)
  );
}

function aggregateModel(value: unknown): value is AggregateModelDescriptor {
  if (!object(value)) return false;
  const base = [
    "authority",
    "effects",
    "events",
    "id",
    "initializationSchema",
    "kind",
    "stateSchema",
  ];
  if (value.authority === "local") {
    if (!exact(value, base, ["initializationContent"]) || value.kind !== "player") return false;
    if (Object.hasOwn(value, "initializationContent") && !id(value.initializationContent))
      return false;
  } else if (
    value.authority !== "server" ||
    (value.kind !== "team" && value.kind !== "session") ||
    !exact(value, base)
  ) {
    return false;
  }
  return (
    id(value.id) &&
    reference(value.stateSchema) &&
    reference(value.initializationSchema) &&
    records(value.events) &&
    records(value.effects)
  );
}

function command(value: unknown): value is CommandDescriptor {
  return (
    object(value) &&
    exact(value, ["aggregateModel", "execution", "id", "outcomeSchema", "payloadSchema", "type"]) &&
    id(value.id) &&
    id(value.type) &&
    id(value.aggregateModel) &&
    reference(value.payloadSchema) &&
    reference(value.outcomeSchema) &&
    (value.execution === "local" || value.execution === "trusted-mechanic")
  );
}

function progression(value: unknown): value is ProgressionDescriptor {
  return (
    object(value) &&
    exact(value, ["aggregateModel", "id"]) &&
    id(value.id) &&
    id(value.aggregateModel)
  );
}

function component(value: unknown): value is ComponentDescriptor {
  return (
    object(value) &&
    exact(value, ["assets", "capabilities", "commands", "content", "id"], ["sharedProjection"]) &&
    id(value.id) &&
    stringArray(value.commands) &&
    stringArray(value.content) &&
    stringArray(value.assets) &&
    capabilityArray(value.capabilities) &&
    (!Object.hasOwn(value, "sharedProjection") || reference(value.sharedProjection))
  );
}

function resource(value: unknown): value is ResourceBinding {
  if (!object(value) || !id(value.id) || !id(value.path)) return false;
  if (value.role === "content") {
    return (
      exact(value, ["id", "path", "role"], ["schema"]) &&
      (!Object.hasOwn(value, "schema") || reference(value.schema))
    );
  }
  return (
    ["schema", "asset", "progression-descriptor", "component-descriptor"].includes(
      value.role as string,
    ) && exact(value, ["id", "path", "role"])
  );
}

function trustedMechanic(value: unknown): value is TrustedMechanicBinding {
  return (
    object(value) &&
    exact(value, [
      "aggregateModel",
      "capabilities",
      "commands",
      "configuration",
      "id",
      "projectionSchema",
    ]) &&
    id(value.id) &&
    id(value.aggregateModel) &&
    stringArray(value.commands) &&
    id(value.configuration) &&
    reference(value.projectionSchema) &&
    capabilityArray(value.capabilities)
  );
}

function shape(value: unknown): value is GameComposition {
  if (
    !object(value) ||
    !exact(
      value,
      ["aggregateModels", "application", "commands", "components", "progressions", "resources"],
      ["trustedMechanic"],
    ) ||
    !object(value.application) ||
    !exact(value.application, ["components"]) ||
    !stringArray(value.application.components) ||
    !Array.isArray(value.aggregateModels) ||
    !value.aggregateModels.every(aggregateModel) ||
    !ordinalUnique(value.aggregateModels, (item) => item.id) ||
    !Array.isArray(value.commands) ||
    !value.commands.every(command) ||
    !ordinalUnique(value.commands, (item) => item.id) ||
    !Array.isArray(value.progressions) ||
    !value.progressions.every(progression) ||
    !ordinalUnique(value.progressions, (item) => item.id) ||
    !Array.isArray(value.components) ||
    !value.components.every(component) ||
    !ordinalUnique(value.components, (item) => item.id) ||
    !Array.isArray(value.resources) ||
    !value.resources.every(resource) ||
    !ordinalUnique(value.resources, (item) => item.id) ||
    (Object.hasOwn(value, "trustedMechanic") && !trustedMechanic(value.trustedMechanic))
  ) {
    return false;
  }
  return true;
}

export function analyzeGameComposition(composition: GameComposition): GameCompositionIssue[] {
  const models = new Map(composition.aggregateModels.map((model) => [model.id, model]));
  const commands = new Map(composition.commands.map((item) => [item.id, item]));
  const components = new Set(composition.components.map((item) => item.id));
  const resources = new Map(composition.resources.map((item) => [item.id, item]));
  const binding = composition.trustedMechanic;
  const issues: GameCompositionIssue[] = [];
  const add = (code: GameCompositionIssueCode, path: string, subject: string, related?: string) =>
    issues.push(
      Object.freeze({ code, path, subject, ...(related === undefined ? {} : { related }) }),
    );
  const requireSchema = (referenceValue: SchemaReference, path: string, subject: string) => {
    if (resources.get(referenceValue.id)?.role !== "schema") {
      add("schema-reference-missing", path, subject, referenceValue.id);
    }
  };

  const localModels = composition.aggregateModels.filter((model) => model.authority === "local");
  if (localModels.length !== 1) {
    add("local-model-count-invalid", "/aggregateModels", String(localModels.length));
  }

  for (const componentId of composition.application.components) {
    if (!components.has(componentId)) {
      add("application-component-missing", "/application/components", componentId);
    }
  }

  for (const model of composition.aggregateModels) {
    const modelPath = `/aggregateModels/${model.id}`;
    requireSchema(model.stateSchema, `${modelPath}/stateSchema`, model.id);
    requireSchema(model.initializationSchema, `${modelPath}/initializationSchema`, model.id);
    if (model.authority === "local" && model.initializationContent !== undefined) {
      const selected = resources.get(model.initializationContent);
      if (selected?.role !== "content") {
        add(
          "content-reference-missing",
          `${modelPath}/initializationContent`,
          model.id,
          model.initializationContent,
        );
      } else if (selected.schema?.id !== model.initializationSchema.id) {
        add(
          "initialization-schema-mismatch",
          `${modelPath}/initializationContent`,
          model.id,
          model.initializationContent,
        );
      }
    }
    for (const [kind, records] of [
      ["events", model.events],
      ["effects", model.effects],
    ] as const) {
      for (const record of records) {
        requireSchema(record.schema, `${modelPath}/${kind}/${record.type}/schema`, model.id);
      }
    }
  }

  const commandTypeOwners = new Map<string, string>();
  for (const item of composition.commands) {
    const model = models.get(item.aggregateModel);
    const commandPath = `/commands/${item.id}`;
    if (
      model === undefined ||
      (item.execution === "local" ? model.authority !== "local" : model.authority !== "server")
    ) {
      add(
        "command-aggregate-mismatch",
        `${commandPath}/aggregateModel`,
        item.id,
        item.aggregateModel,
      );
    }
    requireSchema(item.payloadSchema, `${commandPath}/payloadSchema`, item.id);
    requireSchema(item.outcomeSchema, `${commandPath}/outcomeSchema`, item.id);
    const typeKey = `${item.aggregateModel}\0${item.type}`;
    const prior = commandTypeOwners.get(typeKey);
    if (prior === undefined) commandTypeOwners.set(typeKey, item.id);
    else add("duplicate-command-type", `${commandPath}/type`, item.id, prior);
  }

  const progressionOwners = new Map<string, string>();
  for (const item of composition.progressions) {
    const progressionPath = `/progressions/${item.id}`;
    if (models.get(item.aggregateModel)?.authority !== "local") {
      add(
        "progression-aggregate-mismatch",
        `${progressionPath}/aggregateModel`,
        item.id,
        item.aggregateModel,
      );
    }
    if (resources.get(item.id)?.role !== "progression-descriptor") {
      add("resource-reference-missing", progressionPath, item.id, item.id);
    }
    const prior = progressionOwners.get(item.aggregateModel);
    if (prior === undefined) progressionOwners.set(item.aggregateModel, item.id);
    else add("multiple-model-progressions", `${progressionPath}/aggregateModel`, item.id, prior);
  }
  for (const item of composition.components) {
    const componentPath = `/components/${item.id}`;
    if (resources.get(item.id)?.role !== "component-descriptor") {
      add("resource-reference-missing", componentPath, item.id, item.id);
    }
    for (const commandId of item.commands) {
      if (!commands.has(commandId)) {
        add("command-reference-missing", `${componentPath}/commands`, item.id, commandId);
      }
    }
    const selectsTrustedCommand = item.commands.some(
      (commandId) => commands.get(commandId)?.execution === "trusted-mechanic",
    );
    if (
      selectsTrustedCommand &&
      (binding === undefined || item.sharedProjection?.id !== binding.projectionSchema.id)
    ) {
      add(
        "component-shared-projection-mismatch",
        `${componentPath}/sharedProjection`,
        item.id,
        binding?.projectionSchema.id,
      );
    }
    for (const resourceId of item.content) {
      if (resources.get(resourceId)?.role !== "content") {
        add("content-reference-missing", `${componentPath}/content`, item.id, resourceId);
      }
    }
    for (const resourceId of item.assets) {
      if (resources.get(resourceId)?.role !== "asset") {
        add("resource-reference-missing", `${componentPath}/assets`, item.id, resourceId);
      }
    }
    if (item.sharedProjection !== undefined) {
      requireSchema(item.sharedProjection, `${componentPath}/sharedProjection`, item.id);
    }
  }
  for (const item of composition.resources) {
    if (item.role === "content" && item.schema !== undefined) {
      requireSchema(item.schema, `/resources/${item.id}/schema`, item.id);
    }
  }
  if (binding !== undefined) {
    const model = models.get(binding.aggregateModel);
    const bindingPath = `/trustedMechanic/${binding.id}`;
    if (model?.authority !== "server") {
      add(
        "command-aggregate-mismatch",
        `${bindingPath}/aggregateModel`,
        binding.id,
        binding.aggregateModel,
      );
    }
    for (const commandId of binding.commands) {
      const command = commands.get(commandId);
      if (
        command?.execution !== "trusted-mechanic" ||
        command.aggregateModel !== binding.aggregateModel
      ) {
        add("command-reference-missing", `${bindingPath}/commands`, binding.id, commandId);
      }
    }
    const configuration = resources.get(binding.configuration);
    if (configuration?.role !== "content") {
      add(
        "content-reference-missing",
        `${bindingPath}/configuration`,
        binding.id,
        binding.configuration,
      );
    } else if (configuration.schema === undefined) {
      add(
        "trusted-configuration-schema-missing",
        `${bindingPath}/configuration`,
        binding.id,
        binding.configuration,
      );
    }
    requireSchema(binding.projectionSchema, `${bindingPath}/projectionSchema`, binding.id);
  }

  const selectedServerModel = binding?.aggregateModel;
  const selectedCommands = new Set(binding?.commands ?? []);
  for (const model of composition.aggregateModels) {
    if (model.authority === "server" && model.id !== selectedServerModel) {
      add("unselected-server-model", `/aggregateModels/${model.id}/authority`, model.id);
    }
  }
  for (const command of composition.commands) {
    if (command.execution === "trusted-mechanic" && !selectedCommands.has(command.id)) {
      add("unselected-trusted-command", `/commands/${command.id}/execution`, command.id);
    }
  }
  return issues;
}

export function parseGameComposition(value: unknown): GameCompositionParseResult {
  if (!shape(value)) return invalid("invalid-catalog-shape-or-reference");
  const [issue] = analyzeGameComposition(value);
  if (issue !== undefined) return invalid(issue.code, issue.path);
  const canonical = encodeCanonicalJson(value);
  if (canonical.kind === "invalid") return invalid("catalog-not-canonicalizable");
  return {
    kind: "valid",
    gameComposition: canonical.document.value as unknown as GameComposition,
  };
}

function expectedInventoryKind(role: ResourceBinding["role"]): readonly ReleaseEntryKind[] {
  switch (role) {
    case "schema":
      return ["aggregate-schema", "command-schema"];
    case "content":
      return ["content"];
    case "asset":
      return ["asset"];
    case "progression-descriptor":
      return ["progression"];
    case "component-descriptor":
      return ["component-data"];
  }
}

function capabilityUnion(
  composition: GameComposition,
): readonly GameCapabilityRequirement[] | null {
  const byId = new Map<string, GameCapabilityRequirement>();
  const requirements = [
    ...composition.components.flatMap((item) => item.capabilities),
    ...(composition.trustedMechanic?.capabilities ?? []),
  ];
  for (const requirement of requirements) {
    const existing = byId.get(requirement.id);
    if (existing !== undefined && existing.major !== requirement.major) return null;
    if (existing === undefined || existing.minimumMinor < requirement.minimumMinor) {
      byId.set(requirement.id, requirement);
    }
  }
  return [...byId.values()].sort((left, right) => compareOrdinal(left.id, right.id));
}

export function validateGameCompositionInventory(
  composition: GameComposition,
  manifest: ReleaseManifest,
): InvalidRelease | null {
  const inventory = new Map(manifest.inventory.map((entry) => [entry.path, entry]));
  for (const resourceValue of composition.resources) {
    const entry = inventory.get(resourceValue.path);
    if (entry === undefined || !expectedInventoryKind(resourceValue.role).includes(entry.kind)) {
      return inventoryInvalid("resource-role-mismatch", resourceValue.path);
    }
  }
  const boundPaths = new Set(composition.resources.map((resourceValue) => resourceValue.path));
  for (const entry of manifest.inventory) {
    if (
      entry.kind !== "logic-bundle" &&
      entry.kind !== "presentation-bundle" &&
      entry.path !== GAME_COMPOSITION_PATH &&
      !boundPaths.has(entry.path)
    ) {
      return inventoryInvalid("inventory-entry-unbound", entry.path);
    }
  }
  const capabilities = capabilityUnion(composition);
  if (
    capabilities === null ||
    capabilities.length !== manifest.capabilities.length ||
    capabilities.some((requirement, index) => {
      const declared = manifest.capabilities[index];
      return (
        declared === undefined ||
        requirement.id !== declared.id ||
        requirement.major !== declared.major ||
        requirement.minimumMinor !== declared.minimumMinor
      );
    })
  ) {
    return inventoryInvalid("manifest-capabilities-mismatch");
  }
  return null;
}
