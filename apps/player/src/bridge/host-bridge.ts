import {
  parseHostBridgeEnvelope,
  type CanonicalJsonObject,
  type HostBridgeEnvelope,
} from "@plotpoint/protocol";

export interface HostBridgeHandlers {
  runtimeReady(): Promise<CanonicalJsonObject>;
  commitTransition(payload: CanonicalJsonObject): Promise<CanonicalJsonObject>;
  requestCapability(payload: CanonicalJsonObject): Promise<CanonicalJsonObject>;
}

export async function routeHostBridgeMessage(
  raw: string,
  handlers: HostBridgeHandlers,
): Promise<HostBridgeEnvelope> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return errorEnvelope("host-invalid-json", "unknown");
  }
  const parsed = parseHostBridgeEnvelope(decoded);
  if (parsed.kind === "invalid") return errorEnvelope(parsed.code, "unknown");
  const request = parsed.envelope;
  try {
    let payload: CanonicalJsonObject;
    if (request.type === "runtime.ready") payload = await handlers.runtimeReady();
    else if (request.type === "transition.commit") {
      payload = await handlers.commitTransition(request.payload);
    } else if (request.type === "capability.request") {
      payload = await handlers.requestCapability(request.payload);
    } else return errorEnvelope("host-message-direction-invalid", request.requestId);
    const type =
      request.type === "runtime.ready"
        ? "runtime.bootstrap"
        : request.type === "transition.commit"
          ? "transition.result"
          : "capability.result";
    return { version: 1, requestId: request.requestId, type, payload };
  } catch (error) {
    return errorEnvelope(
      error instanceof Error ? error.message : "host-operation-failed",
      request.requestId,
    );
  }
}

function errorEnvelope(code: string, requestId: string): HostBridgeEnvelope<"host.error"> {
  return { version: 1, requestId, type: "host.error", payload: { code } };
}
