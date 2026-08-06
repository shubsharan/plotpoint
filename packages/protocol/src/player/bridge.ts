import type { CanonicalJsonObject } from "../release/types.js";

export const HOST_API_VERSION = Object.freeze({ major: 1, minor: 1 } as const);
export const HOST_BRIDGE_VERSION = 1 as const;

export type HostBridgeDirection = "web-to-host" | "host-to-web";
export type WebToHostMessageType = "runtime.ready" | "transition.commit" | "capability.request";
export type HostToWebMessageType =
  | "runtime.bootstrap"
  | "transition.result"
  | "capability.result"
  | "host.error";
export type HostBridgeMessageType = WebToHostMessageType | HostToWebMessageType;

export interface HostBridgeEnvelope<Type extends string, Payload> {
  readonly version: typeof HOST_BRIDGE_VERSION;
  readonly requestId: string;
  readonly type: Type;
  readonly payload: Payload;
}

export interface AggregateTarget {
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
}

export type ProgressionStatus = "locked" | "available" | "active" | "completed" | "skipped";

export interface ProgressionNodeState {
  readonly nodeId: string;
  readonly status: ProgressionStatus;
}

export interface ProgressionInstance {
  readonly graphId: string;
  readonly nodes: readonly ProgressionNodeState[];
}

export type TypedRecord = CanonicalJsonObject & { readonly type: string };
export type ProgressionTransitionRecord = CanonicalJsonObject;

interface TransitionCandidateBase {
  readonly commandId: string;
  readonly modelId: string;
  readonly commandType: string;
  readonly payload: CanonicalJsonObject;
  readonly target: AggregateTarget;
  readonly expectedStateVersion: number;
  readonly observationIds: readonly string[];
  readonly consumedObservationIds?: readonly string[];
}

export type TransitionCandidate =
  | (TransitionCandidateBase & {
      readonly terminal: "accepted";
      readonly nextState?: CanonicalJsonObject;
      readonly nextProgression?: ProgressionInstance;
      readonly outcome: CanonicalJsonObject;
      readonly domainEvents: readonly TypedRecord[];
      readonly effectIntents: readonly TypedRecord[];
      readonly progressionTrace: readonly ProgressionTransitionRecord[];
    })
  | (TransitionCandidateBase & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: CanonicalJsonObject;
    })
  | (TransitionCandidateBase & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
      readonly attemptedProgressionTrace: readonly ProgressionTransitionRecord[];
    });

export interface LocalAggregateView {
  readonly modelId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly stateVersion: number;
  readonly state: CanonicalJsonObject;
  readonly progression?: ProgressionInstance;
}

export interface RuntimeBootstrap {
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly aggregate: LocalAggregateView;
}

export type TransitionResult =
  | {
      readonly commandId: string;
      readonly disposition: "committed" | "duplicate";
      readonly terminal: "accepted" | "no-op" | "rejected";
      readonly resultingStateVersion: number;
      readonly outcome: CanonicalJsonObject;
    }
  | {
      readonly commandId: string;
      readonly disposition: "committed" | "duplicate";
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly resultingStateVersion: number;
      readonly diagnosticCodes: readonly string[];
    };

export type CapabilityVersion = CanonicalJsonObject & {
  readonly id: string;
  readonly major: number;
  readonly minor: number;
};

export type CapabilityRequest<Input extends CanonicalJsonObject = CanonicalJsonObject> =
  CanonicalJsonObject & {
    readonly capability: CapabilityVersion;
    readonly input: Input;
  };

export type CapabilityResult<Output extends CanonicalJsonObject = CanonicalJsonObject> =
  CanonicalJsonObject & {
    readonly capability: CapabilityVersion;
    readonly output: Output;
  };

export type HostError = CanonicalJsonObject & {
  readonly code: string;
  readonly commandId?: string;
  readonly currentVersion?: number;
};

export type RuntimeReadyEnvelope = HostBridgeEnvelope<"runtime.ready", Record<string, never>>;
export type TransitionCommitEnvelope = HostBridgeEnvelope<
  "transition.commit",
  { readonly candidate: TransitionCandidate }
>;
export type CapabilityRequestEnvelope<Input extends CanonicalJsonObject = CanonicalJsonObject> =
  HostBridgeEnvelope<"capability.request", CapabilityRequest<Input>>;
export type RuntimeBootstrapEnvelope = HostBridgeEnvelope<"runtime.bootstrap", RuntimeBootstrap>;
export type TransitionResultEnvelope = HostBridgeEnvelope<"transition.result", TransitionResult>;
export type CapabilityResultEnvelope<Output extends CanonicalJsonObject = CanonicalJsonObject> =
  HostBridgeEnvelope<"capability.result", CapabilityResult<Output>>;
export type HostErrorEnvelope = HostBridgeEnvelope<"host.error", HostError>;

export type WebToHostBridgeEnvelope =
  | RuntimeReadyEnvelope
  | TransitionCommitEnvelope
  | CapabilityRequestEnvelope;
export type HostToWebBridgeEnvelope =
  | RuntimeBootstrapEnvelope
  | TransitionResultEnvelope
  | CapabilityResultEnvelope
  | HostErrorEnvelope;
export type AnyHostBridgeEnvelope = WebToHostBridgeEnvelope | HostToWebBridgeEnvelope;

export type HostBridgeParseResult<Envelope extends AnyHostBridgeEnvelope = AnyHostBridgeEnvelope> =
  | { readonly kind: "valid"; readonly envelope: Envelope }
  | { readonly kind: "invalid"; readonly code: string };

export interface HostBridgeTransport {
  send(type: WebToHostMessageType, payload: object): Promise<unknown>;
}

export type HostCapabilityOutputValidator<Output extends object> = (
  value: unknown,
) => value is Output;

export interface HostRuntimeClient {
  commitTransition(candidate: TransitionCandidate): Promise<TransitionResult>;
  requestCapability<Input extends CanonicalJsonObject, Output extends object>(
    capability: CapabilityVersion,
    input: Input,
    validateOutput: HostCapabilityOutputValidator<Output>,
  ): Promise<Output>;
}

const WEB_TO_HOST_TYPES: ReadonlySet<string> = new Set([
  "runtime.ready",
  "transition.commit",
  "capability.request",
]);
const HOST_TO_WEB_TYPES: ReadonlySet<string> = new Set([
  "runtime.bootstrap",
  "transition.result",
  "capability.result",
  "host.error",
]);
const MESSAGE_TYPES: ReadonlySet<string> = new Set([...WEB_TO_HOST_TYPES, ...HOST_TO_WEB_TYPES]);

function isCanonicalObject(value: unknown): value is CanonicalJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isCanonicalValue);
}

function isCanonicalValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(isCanonicalValue);
  return isCanonicalObject(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasOnlyOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isStringArray(value: unknown, unique = false): value is readonly string[] {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) return false;
  return !unique || new Set(value).size === value.length;
}

function isAggregateTarget(value: unknown): value is AggregateTarget {
  if (!isCanonicalObject(value)) return false;
  return (
    hasExactKeys(value, ["aggregateId", "aggregateKind", "schemaId"]) &&
    isNonEmptyString(value.aggregateId) &&
    value.aggregateKind === "player" &&
    isNonEmptyString(value.schemaId)
  );
}

const PROGRESSION_STATUSES: ReadonlySet<string> = new Set([
  "locked",
  "available",
  "active",
  "completed",
  "skipped",
]);

function isProgressionInstance(value: unknown): value is ProgressionInstance {
  if (!isCanonicalObject(value) || !hasExactKeys(value, ["graphId", "nodes"])) return false;
  if (!isNonEmptyString(value.graphId) || !Array.isArray(value.nodes)) return false;
  let previousNodeId: string | undefined;
  for (const node of value.nodes) {
    if (
      !isCanonicalObject(node) ||
      !hasExactKeys(node, ["nodeId", "status"]) ||
      !isNonEmptyString(node.nodeId) ||
      typeof node.status !== "string" ||
      !PROGRESSION_STATUSES.has(node.status) ||
      (previousNodeId !== undefined && previousNodeId >= node.nodeId)
    ) {
      return false;
    }
    previousNodeId = node.nodeId;
  }
  return true;
}

function isTypedRecord(value: unknown): value is TypedRecord {
  return isCanonicalObject(value) && isNonEmptyString(value.type);
}

function isCanonicalObjectArray(value: unknown): value is readonly CanonicalJsonObject[] {
  return Array.isArray(value) && value.every(isCanonicalObject);
}

function isTransitionCandidate(value: unknown): value is TransitionCandidate {
  if (!isCanonicalObject(value)) return false;
  const observationIds = value.observationIds;
  const consumedObservationIds = value.consumedObservationIds ?? [];
  const baseIsValid =
    isNonEmptyString(value.commandId) &&
    isNonEmptyString(value.modelId) &&
    isNonEmptyString(value.commandType) &&
    isCanonicalObject(value.payload) &&
    isAggregateTarget(value.target) &&
    isNonNegativeInteger(value.expectedStateVersion) &&
    isStringArray(observationIds, true) &&
    isStringArray(consumedObservationIds, true) &&
    consumedObservationIds.every((id) => observationIds.includes(id));
  if (!baseIsValid) return false;

  if (value.terminal === "accepted") {
    const required = [
      "commandId",
      "commandType",
      "domainEvents",
      "effectIntents",
      "expectedStateVersion",
      "modelId",
      "observationIds",
      "outcome",
      "payload",
      "progressionTrace",
      "target",
      "terminal",
    ];
    const keys = Object.keys(value);
    if (
      !required.every((key) => Object.hasOwn(value, key)) ||
      keys.some(
        (key) =>
          !required.includes(key) &&
          key !== "nextState" &&
          key !== "nextProgression" &&
          key !== "consumedObservationIds",
      ) ||
      (Object.hasOwn(value, "nextState") && !isCanonicalObject(value.nextState)) ||
      (Object.hasOwn(value, "nextProgression") && !isProgressionInstance(value.nextProgression)) ||
      !isCanonicalObject(value.outcome) ||
      !Array.isArray(value.domainEvents) ||
      !value.domainEvents.every(isTypedRecord) ||
      !Array.isArray(value.effectIntents) ||
      !value.effectIntents.every(isTypedRecord) ||
      !isCanonicalObjectArray(value.progressionTrace)
    ) {
      return false;
    }
    return (
      Object.hasOwn(value, "nextState") ||
      Object.hasOwn(value, "nextProgression") ||
      value.domainEvents.length > 0 ||
      value.effectIntents.length > 0 ||
      value.progressionTrace.length > 0
    );
  }
  if (value.terminal === "no-op" || value.terminal === "rejected") {
    return (
      hasOnlyOptionalKeys(
        value,
        [
          "commandId",
          "commandType",
          "expectedStateVersion",
          "modelId",
          "observationIds",
          "outcome",
          "payload",
          "target",
          "terminal",
        ],
        ["consumedObservationIds"],
      ) && isCanonicalObject(value.outcome)
    );
  }
  if (value.terminal === "invalid") {
    return (
      hasOnlyOptionalKeys(
        value,
        [
          "commandId",
          "commandType",
          "diagnosticCodes",
          "expectedStateVersion",
          "attemptedProgressionTrace",
          "modelId",
          "observationIds",
          "payload",
          "phase",
          "target",
          "terminal",
        ],
        ["consumedObservationIds"],
      ) &&
      value.phase === "execution" &&
      isStringArray(value.diagnosticCodes) &&
      isCanonicalObjectArray(value.attemptedProgressionTrace)
    );
  }
  return false;
}

function isRuntimeBootstrap(value: CanonicalJsonObject): boolean {
  if (!hasExactKeys(value, ["aggregate", "releaseId", "runId"])) return false;
  if (
    !isNonEmptyString(value.runId) ||
    typeof value.releaseId !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.releaseId)
  ) {
    return false;
  }
  if (!isCanonicalObject(value.aggregate)) return false;
  const required = ["aggregateId", "aggregateKind", "modelId", "schemaId", "state", "stateVersion"];
  const keys = Object.keys(value.aggregate);
  return (
    required.every((key) => Object.hasOwn(value.aggregate as CanonicalJsonObject, key)) &&
    keys.every((key) => required.includes(key) || key === "progression") &&
    isNonEmptyString(value.aggregate.modelId) &&
    isNonEmptyString(value.aggregate.aggregateId) &&
    value.aggregate.aggregateKind === "player" &&
    isNonEmptyString(value.aggregate.schemaId) &&
    isNonNegativeInteger(value.aggregate.stateVersion) &&
    isCanonicalObject(value.aggregate.state) &&
    (!Object.hasOwn(value.aggregate, "progression") ||
      isProgressionInstance(value.aggregate.progression))
  );
}

function isTransitionResult(value: CanonicalJsonObject): value is TransitionResult {
  const baseIsValid =
    isNonEmptyString(value.commandId) &&
    (value.disposition === "committed" || value.disposition === "duplicate") &&
    isNonNegativeInteger(value.resultingStateVersion);
  if (!baseIsValid) return false;
  if (
    value.terminal === "accepted" ||
    value.terminal === "no-op" ||
    value.terminal === "rejected"
  ) {
    return (
      hasExactKeys(value, [
        "commandId",
        "disposition",
        "outcome",
        "resultingStateVersion",
        "terminal",
      ]) && isCanonicalObject(value.outcome)
    );
  }
  if (value.terminal === "invalid") {
    return (
      hasExactKeys(value, [
        "commandId",
        "diagnosticCodes",
        "disposition",
        "phase",
        "resultingStateVersion",
        "terminal",
      ]) &&
      value.phase === "execution" &&
      isStringArray(value.diagnosticCodes)
    );
  }
  return false;
}

function isCapabilityVersion(value: unknown): value is CapabilityVersion {
  if (!isCanonicalObject(value)) return false;
  return (
    hasExactKeys(value, ["id", "major", "minor"]) &&
    isNonEmptyString(value.id) &&
    isPositiveInteger(value.major) &&
    isNonNegativeInteger(value.minor)
  );
}

function isCapabilityRequest(value: CanonicalJsonObject): boolean {
  return (
    hasExactKeys(value, ["capability", "input"]) &&
    isCapabilityVersion(value.capability) &&
    isCanonicalObject(value.input)
  );
}

function isCapabilityResult(value: CanonicalJsonObject): value is CapabilityResult {
  return (
    hasExactKeys(value, ["capability", "output"]) &&
    isCapabilityVersion(value.capability) &&
    isCanonicalObject(value.output)
  );
}

function sameCapability(left: CapabilityVersion, right: CapabilityVersion): boolean {
  return left.id === right.id && left.major === right.major && left.minor === right.minor;
}

export function createHostRuntimeClient(transport: HostBridgeTransport): HostRuntimeClient {
  const client: HostRuntimeClient = {
    async commitTransition(candidate: TransitionCandidate) {
      const raw = await transport.send("transition.commit", { candidate });
      if (!isCanonicalObject(raw) || !isTransitionResult(raw)) {
        throw new Error("host-transition-result-invalid");
      }
      if (raw.commandId !== candidate.commandId) {
        throw new Error("host-transition-command-mismatch");
      }
      if (raw.terminal !== candidate.terminal) {
        throw new Error("host-transition-terminal-mismatch");
      }
      return raw;
    },
    async requestCapability<Input extends CanonicalJsonObject, Output extends object>(
      capability: CapabilityVersion,
      input: Input,
      validateOutput: HostCapabilityOutputValidator<Output>,
    ): Promise<Output> {
      const raw = await transport.send("capability.request", { capability, input });
      if (!isCanonicalObject(raw) || !isCapabilityResult(raw)) {
        throw new Error("host-capability-result-invalid");
      }
      if (!sameCapability(raw.capability, capability)) {
        throw new Error("host-capability-identity-mismatch");
      }
      if (!validateOutput(raw.output)) {
        throw new Error("host-capability-output-invalid");
      }
      return raw.output;
    },
  };
  return Object.freeze(client);
}

function isHostError(value: CanonicalJsonObject): boolean {
  const allowedKeys = ["code", "commandId", "currentVersion"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  if (!Object.hasOwn(value, "code") || !isNonEmptyString(value.code)) return false;
  if (Object.hasOwn(value, "commandId") && !isNonEmptyString(value.commandId)) return false;
  return !Object.hasOwn(value, "currentVersion") || isNonNegativeInteger(value.currentVersion);
}

function isPayloadForType(type: HostBridgeMessageType, payload: CanonicalJsonObject): boolean {
  switch (type) {
    case "runtime.ready":
      return hasExactKeys(payload, []);
    case "transition.commit":
      return hasExactKeys(payload, ["candidate"]) && isTransitionCandidate(payload.candidate);
    case "capability.request":
      return isCapabilityRequest(payload);
    case "runtime.bootstrap":
      return isRuntimeBootstrap(payload);
    case "transition.result":
      return isTransitionResult(payload);
    case "capability.result":
      return isCapabilityResult(payload);
    case "host.error":
      return isHostError(payload);
  }
}

export function parseHostBridgeEnvelope(
  value: unknown,
  direction: "web-to-host",
): HostBridgeParseResult<WebToHostBridgeEnvelope>;
export function parseHostBridgeEnvelope(
  value: unknown,
  direction: "host-to-web",
): HostBridgeParseResult<HostToWebBridgeEnvelope>;
export function parseHostBridgeEnvelope(value: unknown): HostBridgeParseResult;
export function parseHostBridgeEnvelope(
  value: unknown,
  direction?: HostBridgeDirection,
): HostBridgeParseResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "invalid", code: "bridge-envelope-invalid" };
  }
  const envelope = value as Record<string, unknown>;
  if (!hasExactKeys(envelope, ["payload", "requestId", "type", "version"])) {
    return { kind: "invalid", code: "bridge-envelope-fields-invalid" };
  }
  if (envelope.version !== HOST_BRIDGE_VERSION) {
    return { kind: "invalid", code: "bridge-version-unsupported" };
  }
  if (!isNonEmptyString(envelope.requestId)) {
    return { kind: "invalid", code: "bridge-request-id-invalid" };
  }
  if (typeof envelope.type !== "string" || !MESSAGE_TYPES.has(envelope.type)) {
    return { kind: "invalid", code: "bridge-message-type-unknown" };
  }
  if (
    (direction === "web-to-host" && !WEB_TO_HOST_TYPES.has(envelope.type)) ||
    (direction === "host-to-web" && !HOST_TO_WEB_TYPES.has(envelope.type))
  ) {
    return { kind: "invalid", code: "bridge-direction-invalid" };
  }
  if (!isCanonicalObject(envelope.payload)) {
    return { kind: "invalid", code: "bridge-payload-invalid" };
  }
  if (!isPayloadForType(envelope.type as HostBridgeMessageType, envelope.payload)) {
    return { kind: "invalid", code: "bridge-payload-fields-invalid" };
  }
  return {
    kind: "valid",
    envelope: Object.freeze({
      version: HOST_BRIDGE_VERSION,
      requestId: envelope.requestId,
      type: envelope.type,
      payload: envelope.payload,
    }) as AnyHostBridgeEnvelope,
  };
}
