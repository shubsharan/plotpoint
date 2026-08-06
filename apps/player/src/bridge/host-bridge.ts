import {
  HOST_BRIDGE_VERSION,
  parseHostBridgeEnvelope,
  type CanonicalJsonObject,
  type CapabilityRequest,
  type CapabilityResult,
  type CapabilityVersion,
  type HostErrorEnvelope,
  type HostToWebBridgeEnvelope,
  type RuntimeBootstrap,
  type TransitionCommitEnvelope,
  type TransitionResult,
} from "@plotpoint/protocol";

export interface CapabilityRegistration {
  readonly capability: CapabilityVersion;
  validateInput(value: CanonicalJsonObject): boolean;
  invoke(input: CanonicalJsonObject): Promise<CanonicalJsonObject>;
  validateOutput(value: CanonicalJsonObject): boolean;
}

export function createCapabilityDispatcher(
  registrations: readonly CapabilityRegistration[],
): (payload: CapabilityRequest) => Promise<CapabilityResult> {
  const identities = new Set<string>();
  for (const registration of registrations) {
    const identity = `${registration.capability.id}@${registration.capability.major}`;
    if (identities.has(identity)) throw new Error(`capability-registration-duplicate:${identity}`);
    identities.add(identity);
  }

  return async (payload) => {
    const registration = registrations.find(
      ({ capability }) =>
        capability.id === payload.capability.id &&
        capability.major === payload.capability.major &&
        payload.capability.minor <= capability.minor,
    );
    if (registration === undefined) throw new Error("capability-unsupported");
    if (!registration.validateInput(payload.input)) throw new Error("capability-input-invalid");
    const output = await registration.invoke(payload.input);
    if (!registration.validateOutput(output)) throw new Error("capability-output-invalid");
    return { capability: payload.capability, output };
  };
}

export interface HostBridgeHandlers {
  runtimeReady(): Promise<RuntimeBootstrap>;
  commitTransition(payload: TransitionCommitEnvelope["payload"]): Promise<TransitionResult>;
  requestCapability(payload: CapabilityRequest): Promise<CapabilityResult>;
}

export async function routeHostBridgeMessage(
  raw: string,
  handlers: HostBridgeHandlers,
): Promise<HostToWebBridgeEnvelope> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return errorEnvelope("host-invalid-json", "unknown");
  }
  const parsed = parseHostBridgeEnvelope(decoded, "web-to-host");
  if (parsed.kind === "invalid") return errorEnvelope(parsed.code, "unknown");
  const request = parsed.envelope;
  try {
    if (request.type === "runtime.ready") {
      const payload = await handlers.runtimeReady();
      return {
        version: HOST_BRIDGE_VERSION,
        requestId: request.requestId,
        type: "runtime.bootstrap",
        payload,
      };
    }
    if (request.type === "transition.commit") {
      const payload = await handlers.commitTransition(request.payload);
      return {
        version: HOST_BRIDGE_VERSION,
        requestId: request.requestId,
        type: "transition.result",
        payload,
      };
    }
    const payload = await handlers.requestCapability(request.payload);
    return {
      version: HOST_BRIDGE_VERSION,
      requestId: request.requestId,
      type: "capability.result",
      payload,
    };
  } catch (error) {
    return errorEnvelope(
      error instanceof Error ? error.message : "host-operation-failed",
      request.requestId,
    );
  }
}

function errorEnvelope(code: string, requestId: string): HostErrorEnvelope {
  return {
    version: HOST_BRIDGE_VERSION,
    requestId,
    type: "host.error",
    payload: { code },
  };
}
