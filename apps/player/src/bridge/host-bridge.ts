import {
  parseHostBridgeEnvelope,
  type CanonicalJsonObject,
  type CapabilityRequestV1,
  type CapabilityResultV1,
  type CapabilityVersionV1,
  type HostErrorEnvelopeV1,
  type HostToWebBridgeEnvelope,
  type RuntimeBootstrapV1,
  type TransitionCommitEnvelopeV1,
  type TransitionResultV1,
} from "@plotpoint/protocol";

export interface CapabilityRegistration {
  readonly capability: CapabilityVersionV1;
  validateInput(value: CanonicalJsonObject): boolean;
  invoke(input: CanonicalJsonObject): Promise<CanonicalJsonObject>;
  validateOutput(value: CanonicalJsonObject): boolean;
}

export function createCapabilityDispatcher(
  registrations: readonly CapabilityRegistration[],
): (payload: CapabilityRequestV1) => Promise<CapabilityResultV1> {
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
  runtimeReady(): Promise<RuntimeBootstrapV1>;
  commitTransition(payload: TransitionCommitEnvelopeV1["payload"]): Promise<TransitionResultV1>;
  requestCapability(payload: CapabilityRequestV1): Promise<CapabilityResultV1>;
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
      return { version: 1, requestId: request.requestId, type: "runtime.bootstrap", payload };
    }
    if (request.type === "transition.commit") {
      const payload = await handlers.commitTransition(request.payload);
      return { version: 1, requestId: request.requestId, type: "transition.result", payload };
    }
    const payload = await handlers.requestCapability(request.payload);
    return { version: 1, requestId: request.requestId, type: "capability.result", payload };
  } catch (error) {
    return errorEnvelope(
      error instanceof Error ? error.message : "host-operation-failed",
      request.requestId,
    );
  }
}

function errorEnvelope(code: string, requestId: string): HostErrorEnvelopeV1 {
  return { version: 1, requestId, type: "host.error", payload: { code } };
}
