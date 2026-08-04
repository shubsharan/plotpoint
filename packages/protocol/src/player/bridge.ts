import type { CanonicalJsonObject } from "../release/types.js";

export const HOST_BRIDGE_VERSION = 1 as const;

export type HostBridgeDirection = "web-to-host" | "host-to-web";
export type WebToHostMessageType = "runtime.ready" | "transition.commit" | "capability.request";
export type HostToWebMessageType =
  | "runtime.bootstrap"
  | "transition.result"
  | "capability.result"
  | "host.error";
export type HostBridgeMessageType = WebToHostMessageType | HostToWebMessageType;

export interface HostBridgeEnvelopeV1<Type extends string, Payload> {
  readonly version: 1;
  readonly requestId: string;
  readonly type: Type;
  readonly payload: Payload & CanonicalJsonObject;
}

/** @deprecated Prefer the closed direction-specific envelope unions for parsed messages. */
export interface HostBridgeEnvelope<Type extends HostBridgeMessageType = HostBridgeMessageType> {
  readonly version: 1;
  readonly requestId: string;
  readonly type: Type;
  readonly payload: CanonicalJsonObject;
}

export type AggregateTargetV1 = CanonicalJsonObject & {
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
};

type TransitionCandidateBaseV1 = CanonicalJsonObject & {
  readonly commandId: string;
  readonly target: AggregateTargetV1;
  readonly expectedVersion: number;
  readonly observationIds: readonly string[];
};

export type TransitionCandidateV1 =
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "accepted";
      readonly nextState: CanonicalJsonObject;
      readonly outcome: CanonicalJsonObject;
      readonly progressionChanges: readonly string[];
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: CanonicalJsonObject;
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "invalid";
      readonly diagnosticCodes: readonly string[];
    });

export type RuntimeBootstrapV1 = CanonicalJsonObject & {
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly aggregate:
    | null
    | (CanonicalJsonObject & {
        readonly aggregateId: string;
        readonly aggregateKind: "player";
        readonly schemaId: string;
        readonly schemaVersion: number;
        readonly stateVersion: number;
        readonly state: CanonicalJsonObject;
      });
};

export type TransitionResultV1 =
  | {
      readonly commandId: string;
      readonly disposition: "committed" | "duplicate";
      readonly terminal: "accepted" | "no-op" | "rejected";
      readonly resultingVersion: number;
      readonly outcome: CanonicalJsonObject;
    }
  | {
      readonly commandId: string;
      readonly disposition: "committed" | "duplicate";
      readonly terminal: "invalid";
      readonly resultingVersion: number;
      readonly diagnosticCodes: readonly string[];
    };

export type CapabilityVersionV1 = CanonicalJsonObject & {
  readonly id: string;
  readonly major: number;
  readonly minor: number;
};

export type CapabilityRequestV1<Input extends CanonicalJsonObject = CanonicalJsonObject> =
  CanonicalJsonObject & {
    readonly capability: CapabilityVersionV1;
    readonly input: Input;
  };

export type CapabilityResultV1<Output extends CanonicalJsonObject = CanonicalJsonObject> =
  CanonicalJsonObject & {
    readonly capability: CapabilityVersionV1;
    readonly output: Output;
  };

export type HostErrorV1 = CanonicalJsonObject & {
  readonly code: string;
  readonly commandId?: string;
  readonly currentVersion?: number;
};

export type RuntimeReadyEnvelopeV1 = HostBridgeEnvelopeV1<"runtime.ready", Record<string, never>>;
export type TransitionCommitEnvelopeV1 = HostBridgeEnvelopeV1<
  "transition.commit",
  { readonly candidate: TransitionCandidateV1 }
>;
export type CapabilityRequestEnvelopeV1<Input extends CanonicalJsonObject = CanonicalJsonObject> =
  HostBridgeEnvelopeV1<"capability.request", CapabilityRequestV1<Input>>;
export type RuntimeBootstrapEnvelopeV1 = HostBridgeEnvelopeV1<
  "runtime.bootstrap",
  RuntimeBootstrapV1
>;
export type TransitionResultEnvelopeV1 = HostBridgeEnvelopeV1<
  "transition.result",
  TransitionResultV1
>;
export type CapabilityResultEnvelopeV1<Output extends CanonicalJsonObject = CanonicalJsonObject> =
  HostBridgeEnvelopeV1<"capability.result", CapabilityResultV1<Output>>;
export type HostErrorEnvelopeV1 = HostBridgeEnvelopeV1<"host.error", HostErrorV1>;

export type WebToHostBridgeEnvelope =
  | RuntimeReadyEnvelopeV1
  | TransitionCommitEnvelopeV1
  | CapabilityRequestEnvelopeV1;
export type HostToWebBridgeEnvelope =
  | RuntimeBootstrapEnvelopeV1
  | TransitionResultEnvelopeV1
  | CapabilityResultEnvelopeV1
  | HostErrorEnvelopeV1;
export type AnyHostBridgeEnvelope = WebToHostBridgeEnvelope | HostToWebBridgeEnvelope;

export type HostBridgeParseResult<Envelope extends AnyHostBridgeEnvelope = AnyHostBridgeEnvelope> =
  | { readonly kind: "valid"; readonly envelope: Envelope }
  | { readonly kind: "invalid"; readonly code: string };

export interface HostBridgeTransportV1 {
  send(type: WebToHostMessageType, payload: CanonicalJsonObject): Promise<unknown>;
}

export type HostCapabilityOutputValidator<Output extends object> = (
  value: unknown,
) => value is Output;

export interface HostRuntimeClientV1 {
  commitTransition(candidate: TransitionCandidateV1): Promise<TransitionResultV1>;
  requestCapability<Input extends CanonicalJsonObject, Output extends object>(
    capability: CapabilityVersionV1,
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

function isAggregateTarget(value: unknown): value is AggregateTargetV1 {
  if (!isCanonicalObject(value)) return false;
  return (
    hasExactKeys(value, ["aggregateId", "aggregateKind", "schemaId", "schemaVersion"]) &&
    isNonEmptyString(value.aggregateId) &&
    value.aggregateKind === "player" &&
    isNonEmptyString(value.schemaId) &&
    isPositiveInteger(value.schemaVersion)
  );
}

function isTransitionCandidate(value: unknown): value is TransitionCandidateV1 {
  if (!isCanonicalObject(value)) return false;
  const baseIsValid =
    isNonEmptyString(value.commandId) &&
    isAggregateTarget(value.target) &&
    isNonNegativeInteger(value.expectedVersion) &&
    isStringArray(value.observationIds, true);
  if (!baseIsValid) return false;

  if (value.terminal === "accepted") {
    return (
      hasExactKeys(value, [
        "commandId",
        "expectedVersion",
        "nextState",
        "observationIds",
        "outcome",
        "progressionChanges",
        "target",
        "terminal",
      ]) &&
      isCanonicalObject(value.nextState) &&
      isCanonicalObject(value.outcome) &&
      isStringArray(value.progressionChanges)
    );
  }
  if (value.terminal === "no-op" || value.terminal === "rejected") {
    return (
      hasExactKeys(value, [
        "commandId",
        "expectedVersion",
        "observationIds",
        "outcome",
        "target",
        "terminal",
      ]) && isCanonicalObject(value.outcome)
    );
  }
  if (value.terminal === "invalid") {
    return (
      hasExactKeys(value, [
        "commandId",
        "diagnosticCodes",
        "expectedVersion",
        "observationIds",
        "target",
        "terminal",
      ]) && isStringArray(value.diagnosticCodes)
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
  if (value.aggregate === null) return true;
  if (!isCanonicalObject(value.aggregate)) return false;
  return (
    hasExactKeys(value.aggregate, [
      "aggregateId",
      "aggregateKind",
      "schemaId",
      "schemaVersion",
      "state",
      "stateVersion",
    ]) &&
    isNonEmptyString(value.aggregate.aggregateId) &&
    value.aggregate.aggregateKind === "player" &&
    isNonEmptyString(value.aggregate.schemaId) &&
    isPositiveInteger(value.aggregate.schemaVersion) &&
    isNonNegativeInteger(value.aggregate.stateVersion) &&
    isCanonicalObject(value.aggregate.state)
  );
}

function isTransitionResult(value: CanonicalJsonObject): value is TransitionResultV1 {
  const baseIsValid =
    isNonEmptyString(value.commandId) &&
    (value.disposition === "committed" || value.disposition === "duplicate") &&
    isNonNegativeInteger(value.resultingVersion);
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
        "resultingVersion",
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
        "resultingVersion",
        "terminal",
      ]) && isStringArray(value.diagnosticCodes)
    );
  }
  return false;
}

function isCapabilityVersion(value: unknown): value is CapabilityVersionV1 {
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

function isCapabilityResult(value: CanonicalJsonObject): value is CapabilityResultV1 {
  return (
    hasExactKeys(value, ["capability", "output"]) &&
    isCapabilityVersion(value.capability) &&
    isCanonicalObject(value.output)
  );
}

function sameCapability(left: CapabilityVersionV1, right: CapabilityVersionV1): boolean {
  return left.id === right.id && left.major === right.major && left.minor === right.minor;
}

export function createHostRuntimeClientV1(transport: HostBridgeTransportV1): HostRuntimeClientV1 {
  const client: HostRuntimeClientV1 = {
    async commitTransition(candidate: TransitionCandidateV1) {
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
      capability: CapabilityVersionV1,
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
