import {
  HOST_BRIDGE_VERSION,
  isSharedCommandIntent,
  type CanonicalJsonObject,
  type SharedCommandIntent,
  type SharedCommandStatus,
  type SharedPlayView,
} from "@plotpoint/protocol";

interface SharedRequest {
  readonly version: typeof HOST_BRIDGE_VERSION;
  readonly requestId: string;
  readonly type: "shared.view.get" | "shared.command.enqueue";
  readonly payload: CanonicalJsonObject;
}

export interface SharedBridgeHandlers {
  getView(): Promise<SharedPlayView>;
  enqueue(command: SharedCommandIntent): Promise<SharedCommandStatus>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parse(raw: string): SharedRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !object(value) ||
    Object.keys(value).some((key) => !["version", "requestId", "type", "payload"].includes(key)) ||
    value.version !== HOST_BRIDGE_VERSION ||
    typeof value.requestId !== "string" ||
    !["shared.view.get", "shared.command.enqueue"].includes(value.type as string) ||
    !object(value.payload)
  )
    return null;
  if (value.type === "shared.view.get" && Object.keys(value.payload).length !== 0) return null;
  if (
    value.type === "shared.command.enqueue" &&
    (Object.keys(value.payload).length !== 1 ||
      !Object.hasOwn(value.payload, "command") ||
      !isSharedCommandIntent(value.payload.command))
  )
    return null;
  return value as unknown as SharedRequest;
}

export async function routeSharedBridgeMessage(
  raw: string,
  handlers: SharedBridgeHandlers,
): Promise<CanonicalJsonObject> {
  const request = parse(raw);
  if (request === null)
    return {
      version: HOST_BRIDGE_VERSION,
      requestId: "unknown",
      type: "host.error",
      payload: { code: "shared-message-invalid" },
    };
  try {
    let payload: SharedPlayView | SharedCommandStatus;
    if (request.type === "shared.view.get") payload = await handlers.getView();
    else {
      const command = request.payload.command;
      if (!isSharedCommandIntent(command)) throw new Error("shared-command-invalid");
      payload = await handlers.enqueue(command);
    }
    return {
      version: HOST_BRIDGE_VERSION,
      requestId: request.requestId,
      type: request.type === "shared.view.get" ? "shared.view.result" : "shared.command.result",
      payload: payload as unknown as CanonicalJsonObject,
    };
  } catch (error) {
    return {
      version: HOST_BRIDGE_VERSION,
      requestId: request.requestId,
      type: "host.error",
      payload: { code: error instanceof Error ? error.message : "shared-operation-failed" },
    };
  }
}
