import type { CanonicalJsonObject } from "../release/types.js";

export const HOST_BRIDGE_VERSION = 1 as const;

export type WebToHostMessageType = "runtime.ready" | "transition.commit" | "capability.request";
export type HostToWebMessageType =
  | "runtime.bootstrap"
  | "transition.result"
  | "capability.result"
  | "host.error";
export type HostBridgeMessageType = WebToHostMessageType | HostToWebMessageType;

export interface HostBridgeEnvelope<T extends HostBridgeMessageType = HostBridgeMessageType> {
  readonly version: 1;
  readonly requestId: string;
  readonly type: T;
  readonly payload: CanonicalJsonObject;
}

export type HostBridgeParseResult =
  | { readonly kind: "valid"; readonly envelope: HostBridgeEnvelope }
  | { readonly kind: "invalid"; readonly code: string };

const MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "runtime.ready",
  "transition.commit",
  "capability.request",
  "runtime.bootstrap",
  "transition.result",
  "capability.result",
  "host.error",
]);

function isCanonicalObject(value: unknown): value is CanonicalJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
    if (typeof entry === "number") return Number.isFinite(entry) && !Object.is(entry, -0);
    if (Array.isArray(entry)) return entry.every((item) => isCanonicalValue(item));
    return isCanonicalObject(entry);
  });
}

function isCanonicalValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(isCanonicalValue);
  return isCanonicalObject(value);
}

export function parseHostBridgeEnvelope(value: unknown): HostBridgeParseResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "invalid", code: "bridge-envelope-invalid" };
  }
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope).sort().join(",");
  if (keys !== "payload,requestId,type,version") {
    return { kind: "invalid", code: "bridge-envelope-fields-invalid" };
  }
  if (envelope.version !== HOST_BRIDGE_VERSION) {
    return { kind: "invalid", code: "bridge-version-unsupported" };
  }
  if (typeof envelope.requestId !== "string" || envelope.requestId.length === 0) {
    return { kind: "invalid", code: "bridge-request-id-invalid" };
  }
  if (typeof envelope.type !== "string" || !MESSAGE_TYPES.has(envelope.type)) {
    return { kind: "invalid", code: "bridge-message-type-unknown" };
  }
  if (!isCanonicalObject(envelope.payload)) {
    return { kind: "invalid", code: "bridge-payload-invalid" };
  }
  return {
    kind: "valid",
    envelope: Object.freeze({
      version: HOST_BRIDGE_VERSION,
      requestId: envelope.requestId,
      type: envelope.type as HostBridgeMessageType,
      payload: envelope.payload,
    }),
  };
}
