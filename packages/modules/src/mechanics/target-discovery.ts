import {
  bindExecutableAggregateModel,
  canonicalizeValue,
  defineCommand,
  resolveCommandBinding,
  type Diagnostic,
  type JsonObject,
  type RuntimeSchema,
  type SchemaValidationResult,
} from "@plotpoint/runtime";
import {
  isLocationObservation,
  type GameCapabilityRequirement,
  type GameComposition,
  type LocationObservation,
  type TrustedMechanicBinding,
} from "@plotpoint/protocol";

import type {
  AuthorizedParticipant,
  MechanicBindingValidation,
  MechanicDiagnostic,
  MechanicDiagnosticCode,
  MechanicProjection,
  PersistedObservation,
  TrustedMechanicAdapter,
} from "../trusted-mechanics.js";

export const TARGET_DISCOVERY_MECHANIC = "plotpoint.location.target-discovery" as const;
export const TARGET_DISCOVERY_COMMAND = TARGET_DISCOVERY_MECHANIC;
export const TARGET_DISCOVERY_MODEL = "plotpoint.location.team" as const;
export const TARGET_DISCOVERY_CONFIG_SCHEMA = "plotpoint.location.target-config" as const;
export const TARGET_DISCOVERY_STATE_SCHEMA = "plotpoint.location.team-state" as const;
export const TARGET_DISCOVERY_PAYLOAD_SCHEMA =
  "plotpoint.location.target-discovery-payload" as const;
export const TARGET_DISCOVERY_OUTCOME_SCHEMA =
  "plotpoint.location.target-discovery-outcome" as const;
export const TARGET_DISCOVERY_PROJECTION_SCHEMA = "plotpoint.location.team-projection" as const;

const TARGET_DISCOVERY_FACT = "plotpoint.location.target-discovery" as const;
const FOREGROUND_LOCATION_CAPABILITY: GameCapabilityRequirement = Object.freeze({
  id: "plotpoint.location.foreground",
  major: 1,
  minimumMinor: 0,
});

const SCHEMA_DIGESTS = Object.freeze({
  configuration: "sha256:b546973744aecad4c2bcc7c3579235e8403630a622700c3e8e4e83f076e28f6e" as const,
  outcome: "sha256:e9e572d33bbd6cc80bceb97058ce8363f323a5736a8cdc414577e7d0a281343f" as const,
  payload: "sha256:cdb6e7d4466a8f0145421bebfd7e49b73a2d4ba6804076ee4552559972b9c523" as const,
  projection: "sha256:89f5280dd509d8b0a5f9a098a78a02f74c10d0476c340ca2fd06ac7bd8876739" as const,
  state: "sha256:78efad0abca11dfcfefcf875c06255e9e072583ae640eab1f842257ca9531a00" as const,
});

interface HuntTargetConfig extends JsonObject {
  readonly targetId: string;
  readonly prompt: string;
  readonly zone: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly maximumAgeMs: number;
  readonly maximumAccuracyMeters: number;
}

interface TargetDiscoveryConfig extends JsonObject {
  readonly targets: readonly HuntTargetConfig[];
}

interface TeamTargetState extends JsonObject {
  readonly targetId: string;
  readonly status: "available" | "discovered";
}

interface TeamState extends JsonObject {
  readonly targets: readonly TeamTargetState[];
  readonly completedTargets: number;
  readonly complete: boolean;
}

interface TargetDiscoveryPayload extends JsonObject {
  readonly targetId: string;
}

interface TargetDiscoveryOutcome extends JsonObject {
  readonly code: TargetDiscoveryOutcomeCode;
}

type TargetDiscoveryOutcomeCode =
  | "location-denied"
  | "location-expired"
  | "location-future"
  | "location-inaccurate"
  | "location-missing"
  | "location-outside-zone"
  | "location-stale"
  | "location-unavailable"
  | "target-already-discovered"
  | "target-discovered"
  | "target-unknown";

const OUTCOME_CODES: ReadonlySet<string> = new Set<TargetDiscoveryOutcomeCode>([
  "location-denied",
  "location-expired",
  "location-future",
  "location-inaccurate",
  "location-missing",
  "location-outside-zone",
  "location-stale",
  "location-unavailable",
  "target-already-discovered",
  "target-discovered",
  "target-unknown",
]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function present<Value>(value: Value | null): value is Value {
  return value !== null;
}

function outcomeCode(value: string): value is TargetDiscoveryOutcomeCode {
  return OUTCOME_CODES.has(value);
}

function schemaDiagnostic(code: Diagnostic["code"], schemaId: string): Diagnostic {
  return Object.freeze({ code, details: Object.freeze({ schemaId }) });
}

function invalidSchema<Value>(code: Diagnostic["code"], schemaId: string) {
  return Object.freeze({
    valid: false as const,
    diagnostics: Object.freeze([schemaDiagnostic(code, schemaId)]),
  }) satisfies SchemaValidationResult<Value>;
}

function canonicalObject(value: unknown): Record<string, unknown> | null {
  const canonical = canonicalizeValue(value);
  return canonical.kind === "valid" && object(canonical.canonical.value)
    ? canonical.canonical.value
    : null;
}

function target(value: unknown): HuntTargetConfig | null {
  if (!object(value)) return null;
  const fields = [
    "targetId",
    "prompt",
    "zone",
    "latitude",
    "longitude",
    "radiusMeters",
    "maximumAgeMs",
    "maximumAccuracyMeters",
  ];
  if (
    !exact(value, fields) ||
    !nonempty(value.targetId) ||
    !nonempty(value.prompt) ||
    !nonempty(value.zone) ||
    !finite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !finite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180 ||
    !finite(value.radiusMeters) ||
    value.radiusMeters <= 0 ||
    !nonnegativeInteger(value.maximumAgeMs) ||
    !finite(value.maximumAccuracyMeters) ||
    value.maximumAccuracyMeters < 0
  ) {
    return null;
  }
  return Object.freeze({
    targetId: value.targetId,
    prompt: value.prompt,
    zone: value.zone,
    latitude: value.latitude,
    longitude: value.longitude,
    radiusMeters: value.radiusMeters,
    maximumAgeMs: value.maximumAgeMs,
    maximumAccuracyMeters: value.maximumAccuracyMeters,
  });
}

const configurationSchema: RuntimeSchema<TargetDiscoveryConfig> = Object.freeze({
  id: TARGET_DISCOVERY_CONFIG_SCHEMA,
  schemaDigest: SCHEMA_DIGESTS.configuration,
  validate(value: unknown): SchemaValidationResult<TargetDiscoveryConfig> {
    const candidate = canonicalObject(value);
    if (candidate === null || !exact(candidate, ["targets"]) || !Array.isArray(candidate.targets)) {
      return invalidSchema("initialization-input-invalid", TARGET_DISCOVERY_CONFIG_SCHEMA);
    }
    const targets = candidate.targets.map(target);
    if (targets.length === 0 || !targets.every(present)) {
      return invalidSchema("initialization-input-invalid", TARGET_DISCOVERY_CONFIG_SCHEMA);
    }
    return Object.freeze({
      valid: true,
      value: Object.freeze({ targets: Object.freeze(targets) }),
    });
  },
});

function teamState(value: unknown): TeamState | null {
  const candidate = canonicalObject(value);
  if (
    candidate === null ||
    !exact(candidate, ["complete", "completedTargets", "targets"]) ||
    typeof candidate.complete !== "boolean" ||
    !nonnegativeInteger(candidate.completedTargets) ||
    !Array.isArray(candidate.targets)
  ) {
    return null;
  }
  const targets = candidate.targets.map((entry): TeamTargetState | null => {
    if (
      !object(entry) ||
      !exact(entry, ["status", "targetId"]) ||
      !nonempty(entry.targetId) ||
      (entry.status !== "available" && entry.status !== "discovered")
    ) {
      return null;
    }
    return Object.freeze({ targetId: entry.targetId, status: entry.status });
  });
  if (!targets.every(present)) return null;
  return Object.freeze({
    complete: candidate.complete,
    completedTargets: candidate.completedTargets,
    targets: Object.freeze(targets),
  });
}

const stateSchema: RuntimeSchema<TeamState> = Object.freeze({
  id: TARGET_DISCOVERY_STATE_SCHEMA,
  schemaDigest: SCHEMA_DIGESTS.state,
  validate(value: unknown): SchemaValidationResult<TeamState> {
    const state = teamState(value);
    return state === null
      ? invalidSchema("aggregate-state-invalid", TARGET_DISCOVERY_STATE_SCHEMA)
      : Object.freeze({ valid: true, value: state });
  },
});

const projectionSchema: RuntimeSchema<TeamState> = Object.freeze({
  id: TARGET_DISCOVERY_PROJECTION_SCHEMA,
  schemaDigest: SCHEMA_DIGESTS.projection,
  validate(value: unknown): SchemaValidationResult<TeamState> {
    const state = teamState(value);
    return state === null
      ? invalidSchema("aggregate-state-invalid", TARGET_DISCOVERY_PROJECTION_SCHEMA)
      : Object.freeze({ valid: true, value: state });
  },
});

const payloadSchema: RuntimeSchema<TargetDiscoveryPayload> = Object.freeze({
  id: TARGET_DISCOVERY_PAYLOAD_SCHEMA,
  schemaDigest: SCHEMA_DIGESTS.payload,
  validate(value: unknown): SchemaValidationResult<TargetDiscoveryPayload> {
    const candidate = canonicalObject(value);
    return candidate === null || !exact(candidate, ["targetId"]) || !nonempty(candidate.targetId)
      ? invalidSchema("command-payload-invalid", TARGET_DISCOVERY_PAYLOAD_SCHEMA)
      : Object.freeze({
          valid: true,
          value: Object.freeze({ targetId: candidate.targetId }),
        });
  },
});

const outcomeSchema: RuntimeSchema<TargetDiscoveryOutcome> = Object.freeze({
  id: TARGET_DISCOVERY_OUTCOME_SCHEMA,
  schemaDigest: SCHEMA_DIGESTS.outcome,
  validate(value: unknown): SchemaValidationResult<TargetDiscoveryOutcome> {
    const candidate = canonicalObject(value);
    return candidate === null ||
      !exact(candidate, ["code"]) ||
      typeof candidate.code !== "string" ||
      !outcomeCode(candidate.code)
      ? invalidSchema("handler-result-invalid", TARGET_DISCOVERY_OUTCOME_SCHEMA)
      : Object.freeze({
          valid: true,
          value: Object.freeze({ code: candidate.code }),
        });
  },
});

function mechanicDiagnostic(
  code: MechanicDiagnosticCode,
  logicalIds: readonly string[],
): MechanicDiagnostic {
  return Object.freeze({ code, logicalIds: Object.freeze([...logicalIds]) });
}

function bindingInvalid(
  code: MechanicDiagnosticCode,
  logicalIds: readonly string[],
): MechanicBindingValidation {
  return Object.freeze({ kind: "invalid", diagnostic: mechanicDiagnostic(code, logicalIds) });
}

function equalCapabilities(
  actual: readonly GameCapabilityRequirement[],
  expected: readonly GameCapabilityRequirement[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (capability, index) =>
        capability.id === expected[index]?.id &&
        capability.major === expected[index]?.major &&
        capability.minimumMinor === expected[index]?.minimumMinor,
    )
  );
}

function equalBinding(left: TrustedMechanicBinding | undefined, right: TrustedMechanicBinding) {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.aggregateModel === right.aggregateModel &&
    left.configuration === right.configuration &&
    left.projectionSchema.id === right.projectionSchema.id &&
    left.commands.length === right.commands.length &&
    left.commands.every((id, index) => id === right.commands[index]) &&
    equalCapabilities(left.capabilities, right.capabilities)
  );
}

function validateContract(input: {
  readonly binding: TrustedMechanicBinding;
  readonly composition: GameComposition;
  readonly configuration: unknown;
}): MechanicBindingValidation {
  const { binding, composition } = input;
  if (
    binding.id !== TARGET_DISCOVERY_MECHANIC ||
    binding.aggregateModel !== TARGET_DISCOVERY_MODEL ||
    binding.commands.length !== 1 ||
    binding.commands[0] !== TARGET_DISCOVERY_COMMAND ||
    binding.projectionSchema.id !== TARGET_DISCOVERY_PROJECTION_SCHEMA ||
    !equalCapabilities(binding.capabilities, [FOREGROUND_LOCATION_CAPABILITY]) ||
    !equalBinding(composition.trustedMechanic, binding)
  ) {
    return bindingInvalid("invalid-binding", [binding.id]);
  }

  const serverModels = composition.aggregateModels.filter(
    ({ authority }) => authority === "server",
  );
  const model = serverModels.find(({ id }) => id === binding.aggregateModel);
  const serverProgression = composition.progressions.find(
    ({ aggregateModel }) => aggregateModel === binding.aggregateModel,
  );
  if (
    model === undefined ||
    serverModels.length !== 1 ||
    model.authority !== "server" ||
    model.kind !== "team" ||
    model.events.length !== 0 ||
    model.effects.length !== 0 ||
    serverProgression !== undefined
  ) {
    return bindingInvalid("model-contract-mismatch", [
      binding.aggregateModel,
      ...serverModels.filter(({ id }) => id !== binding.aggregateModel).map(({ id }) => id),
      ...(serverProgression === undefined ? [] : [serverProgression.id]),
    ]);
  }
  if (
    model.stateSchema.id !== TARGET_DISCOVERY_STATE_SCHEMA ||
    model.initializationSchema.id !== TARGET_DISCOVERY_CONFIG_SCHEMA
  ) {
    return bindingInvalid("schema-contract-mismatch", [
      TARGET_DISCOVERY_STATE_SCHEMA,
      TARGET_DISCOVERY_CONFIG_SCHEMA,
      model.stateSchema.id,
      model.initializationSchema.id,
    ]);
  }

  const trustedCommands = composition.commands.filter(
    ({ execution }) => execution === "trusted-mechanic",
  );
  const command = trustedCommands.find(({ id }) => id === TARGET_DISCOVERY_COMMAND);
  if (
    command === undefined ||
    trustedCommands.length !== binding.commands.length ||
    command.type !== TARGET_DISCOVERY_COMMAND ||
    command.aggregateModel !== TARGET_DISCOVERY_MODEL ||
    command.execution !== "trusted-mechanic"
  ) {
    return bindingInvalid("command-contract-mismatch", [
      TARGET_DISCOVERY_COMMAND,
      ...trustedCommands.filter(({ id }) => !binding.commands.includes(id)).map(({ id }) => id),
    ]);
  }
  if (
    command.payloadSchema.id !== TARGET_DISCOVERY_PAYLOAD_SCHEMA ||
    command.outcomeSchema.id !== TARGET_DISCOVERY_OUTCOME_SCHEMA
  ) {
    return bindingInvalid("schema-contract-mismatch", [
      ...(command.payloadSchema.id === TARGET_DISCOVERY_PAYLOAD_SCHEMA
        ? []
        : [TARGET_DISCOVERY_PAYLOAD_SCHEMA, command.payloadSchema.id]),
      ...(command.outcomeSchema.id === TARGET_DISCOVERY_OUTCOME_SCHEMA
        ? []
        : [TARGET_DISCOVERY_OUTCOME_SCHEMA, command.outcomeSchema.id]),
    ]);
  }

  const configResource = composition.resources.find(({ id }) => id === binding.configuration);
  const schemaIds = new Set(
    composition.resources.filter(({ role }) => role === "schema").map(({ id }) => id),
  );
  if (
    configResource?.role !== "content" ||
    configResource.schema?.id !== TARGET_DISCOVERY_CONFIG_SCHEMA ||
    !schemaIds.has(TARGET_DISCOVERY_CONFIG_SCHEMA) ||
    !schemaIds.has(TARGET_DISCOVERY_STATE_SCHEMA) ||
    !schemaIds.has(TARGET_DISCOVERY_PAYLOAD_SCHEMA) ||
    !schemaIds.has(TARGET_DISCOVERY_OUTCOME_SCHEMA) ||
    !schemaIds.has(TARGET_DISCOVERY_PROJECTION_SCHEMA)
  ) {
    return bindingInvalid("schema-contract-mismatch", [
      binding.configuration,
      TARGET_DISCOVERY_CONFIG_SCHEMA,
      TARGET_DISCOVERY_STATE_SCHEMA,
      TARGET_DISCOVERY_PAYLOAD_SCHEMA,
      TARGET_DISCOVERY_OUTCOME_SCHEMA,
      TARGET_DISCOVERY_PROJECTION_SCHEMA,
    ]);
  }

  const parsed = configurationSchema.validate(input.configuration);
  if (
    !parsed.valid ||
    new Set(parsed.value.targets.map(({ targetId }) => targetId)).size !==
      parsed.value.targets.length
  ) {
    return bindingInvalid("invalid-configuration", [
      binding.configuration,
      TARGET_DISCOVERY_CONFIG_SCHEMA,
    ]);
  }
  return Object.freeze({
    kind: "valid",
    value: Object.freeze({
      binding,
      configuration: parsed.value,
      initializationInput: parsed.value,
    }),
  });
}

function distanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const radians = Math.PI / 180;
  const dLatitude = (latitude2 - latitude1) * radians;
  const dLongitude = (longitude2 - longitude1) * radians;
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(latitude1 * radians) * Math.cos(latitude2 * radians) * Math.sin(dLongitude / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, a));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

function trustedOutcome(code: TargetDiscoveryOutcomeCode): TargetDiscoveryOutcome {
  return Object.freeze({ code });
}

function runtimeDiagnostic(code: Diagnostic["code"], details: JsonObject): Diagnostic {
  return Object.freeze({ code, details: Object.freeze({ ...details }) });
}

function invalidAuthorization(code: Diagnostic["code"], details: JsonObject) {
  return Object.freeze({
    kind: "invalid" as const,
    diagnostics: Object.freeze([runtimeDiagnostic(code, details)]),
  });
}

function observationsAgree(
  transmitted: readonly LocationObservation[],
  persisted: readonly PersistedObservation[],
): boolean {
  const left = canonicalizeValue(transmitted);
  const right = canonicalizeValue(persisted);
  return (
    left.kind === "valid" && right.kind === "valid" && left.canonical.text === right.canonical.text
  );
}

function authorizedParticipant(value: AuthorizedParticipant): boolean {
  return value.sessionId.length > 0 && value.participantId.length > 0 && value.teamId.length > 0;
}

const targetDiscoveryDefinition = defineCommand<
  "team",
  TeamState,
  TargetDiscoveryPayload,
  TargetDiscoveryOutcome
>({
  definitionId: TARGET_DISCOVERY_COMMAND,
  commandType: TARGET_DISCOVERY_COMMAND,
  aggregateKind: "team",
  handle(aggregate, command, context) {
    const fact = context.take<JsonObject>(TARGET_DISCOVERY_FACT, command.payload.targetId);
    if (!object(fact) || !exact(fact, ["qualified"]) || fact.qualified !== true) {
      return { kind: "rejected", outcome: trustedOutcome("location-unavailable") };
    }
    const selected = aggregate.state.targets.find(
      ({ targetId }) => targetId === command.payload.targetId,
    );
    if (selected === undefined) {
      return { kind: "rejected", outcome: trustedOutcome("target-unknown") };
    }
    if (selected.status === "discovered") {
      return { kind: "no-op", outcome: trustedOutcome("target-already-discovered") };
    }
    const targets = aggregate.state.targets.map((entry) =>
      entry.targetId === command.payload.targetId
        ? Object.freeze({ targetId: entry.targetId, status: "discovered" as const })
        : entry,
    );
    const completedTargets = targets.filter(({ status }) => status === "discovered").length;
    return {
      kind: "accepted",
      nextState: Object.freeze({
        targets: Object.freeze(targets),
        completedTargets,
        complete: completedTargets === targets.length,
      }),
      outcome: trustedOutcome("target-discovered"),
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});

const model = bindExecutableAggregateModel({
  modelId: TARGET_DISCOVERY_MODEL,
  aggregateKind: "team",
  authority: "server",
  stateSchema,
  initializationSchema: configurationSchema,
  initializeState(input) {
    const parsed = configurationSchema.validate(input);
    if (!parsed.valid) throw new Error("target-discovery-configuration-invalid");
    return Object.freeze({
      targets: Object.freeze(
        parsed.value.targets.map(({ targetId }) =>
          Object.freeze({ targetId, status: "available" as const }),
        ),
      ),
      completedTargets: 0,
      complete: false,
    });
  },
  commandsByType: Object.freeze({
    [TARGET_DISCOVERY_COMMAND]: resolveCommandBinding({
      registrationId: TARGET_DISCOVERY_COMMAND,
      definition: targetDiscoveryDefinition,
      payloadSchema,
      outcomeSchema,
    }),
  }),
  eventSchemas: Object.freeze({}),
  effectSchemas: Object.freeze({}),
});

function canonicalConfig(value: unknown): TargetDiscoveryConfig | null {
  const parsed = configurationSchema.validate(value);
  return parsed.valid &&
    new Set(parsed.value.targets.map(({ targetId }) => targetId)).size ===
      parsed.value.targets.length
    ? parsed.value
    : null;
}

export function createTargetDiscoveryAdapter(
  capturedConfiguration: unknown,
): TrustedMechanicAdapter<"team"> {
  const captured = canonicalConfig(capturedConfiguration);
  const adapter: TrustedMechanicAdapter<"team"> = {
    id: TARGET_DISCOVERY_MECHANIC,
    model,
    configurationSchema,
    projectionSchema,
    validateBinding(input): MechanicBindingValidation {
      const validation = validateContract(input);
      if (validation.kind === "invalid") return validation;
      const candidate = canonicalizeValue(validation.value.configuration);
      const expected = canonicalizeValue(captured);
      return captured === null ||
        candidate.kind !== "valid" ||
        expected.kind !== "valid" ||
        candidate.canonical.text !== expected.canonical.text
        ? bindingInvalid("invalid-configuration", [
            input.binding.configuration,
            TARGET_DISCOVERY_CONFIG_SCHEMA,
          ])
        : validation;
    },
    authorize({ participant, command, observations }) {
      if (
        !authorizedParticipant(participant) ||
        command.type !== TARGET_DISCOVERY_COMMAND ||
        command.target.aggregateKind !== "team" ||
        command.target.aggregateId !== participant.teamId ||
        command.target.schemaId !== TARGET_DISCOVERY_STATE_SCHEMA ||
        command.target.schemaVersion !== 1
      ) {
        return invalidAuthorization("command-target-mismatch", {
          commandId: command.commandId,
          modelId: TARGET_DISCOVERY_MODEL,
        });
      }
      const payload = payloadSchema.validate(command.payload);
      if (!payload.valid || captured === null) {
        return invalidAuthorization("command-payload-invalid", {
          commandId: command.commandId,
          schemaId: TARGET_DISCOVERY_PAYLOAD_SCHEMA,
        });
      }
      if (!observationsAgree(command.observations, observations)) {
        return invalidAuthorization("observation-order-mismatch", {
          commandId: command.commandId,
        });
      }
      const targetConfig = captured.targets.find(
        ({ targetId }) => targetId === payload.value.targetId,
      );
      if (targetConfig === undefined) {
        return Object.freeze({ kind: "rejected", outcome: trustedOutcome("target-unknown") });
      }
      const observation = observations[0];
      if (observation === undefined) {
        return Object.freeze({ kind: "rejected", outcome: trustedOutcome("location-missing") });
      }
      if (observations.length !== 1 || !isLocationObservation(observation)) {
        return invalidAuthorization("observation-order-mismatch", {
          commandId: command.commandId,
        });
      }
      if (observation.availability === "permission-denied") {
        return Object.freeze({ kind: "rejected", outcome: trustedOutcome("location-denied") });
      }
      if (observation.availability !== "available") {
        return Object.freeze({ kind: "rejected", outcome: trustedOutcome("location-unavailable") });
      }
      let rejection: TargetDiscoveryOutcomeCode | null = null;
      if (observation.ageMs < 0) rejection = "location-future";
      else if (observation.ageMs > targetConfig.maximumAgeMs) rejection = "location-stale";
      else if (observation.horizontalAccuracy > targetConfig.maximumAccuracyMeters)
        rejection = "location-inaccurate";
      else if (
        distanceMeters(
          observation.latitude,
          observation.longitude,
          targetConfig.latitude,
          targetConfig.longitude,
        ) > targetConfig.radiusMeters
      )
        rejection = "location-outside-zone";
      if (rejection !== null) {
        return Object.freeze({ kind: "rejected", outcome: trustedOutcome(rejection) });
      }
      return Object.freeze({
        kind: "authorized",
        command: Object.freeze({
          id: command.commandId,
          type: command.type,
          target: Object.freeze({ kind: "team", id: command.target.aggregateId }),
          expectedStateVersion: command.expectedStateVersion,
          payload: payload.value,
        }),
        observations: Object.freeze([
          Object.freeze({
            kind: TARGET_DISCOVERY_FACT,
            key: payload.value.targetId,
            value: Object.freeze({ qualified: true }),
          }),
        ]),
      });
    },
    project({ participant, aggregate }): MechanicProjection {
      const projected = projectionSchema.validate(aggregate.state);
      if (
        aggregate.aggregateId !== participant.teamId ||
        aggregate.modelId !== TARGET_DISCOVERY_MODEL ||
        aggregate.aggregateKind !== "team" ||
        aggregate.schemaId !== TARGET_DISCOVERY_STATE_SCHEMA ||
        !Number.isSafeInteger(aggregate.stateVersion) ||
        aggregate.stateVersion < 0 ||
        aggregate.progression !== undefined ||
        !projected.valid
      ) {
        return Object.freeze({
          kind: "invalid",
          diagnostic: mechanicDiagnostic("projection-invalid", [
            aggregate.aggregateId,
            participant.teamId,
            TARGET_DISCOVERY_PROJECTION_SCHEMA,
          ]),
        });
      }
      return Object.freeze({
        kind: "projected",
        projection: Object.freeze({
          aggregateKind: "team",
          aggregateId: aggregate.aggregateId,
          schemaId: TARGET_DISCOVERY_PROJECTION_SCHEMA,
          schemaVersion: 1,
          stateVersion: aggregate.stateVersion,
          value: projected.value,
        }),
      });
    },
  };
  return Object.freeze(adapter);
}

export function targetDiscoveryConfigReleasePath(binding: TrustedMechanicBinding): string {
  const encoded = Array.from(new TextEncoder().encode(binding.configuration), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `content/${encoded}.json`;
}
