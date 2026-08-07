import {
  HOST_BRIDGE_VERSION,
  isSharedCommandIntent,
  type CanonicalJsonObject,
  type GameComposition,
  type ReleaseId,
  type SharedCommandIntent,
  type SharedCommandStatus,
  type SharedPlayView,
  type SharedProjection,
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

export interface SharedProjectionContract {
  readonly schemaId: string;
  validate(value: SharedProjection["value"]): boolean;
}

export interface SharedProjectionSource {
  readonly releaseId: ReleaseId;
  readonly sessionId: string;
  readonly teamId: string;
  readonly projections: readonly SharedProjection[];
}

export type SharedProjectionResolution =
  | { readonly kind: "resolved"; readonly projection: SharedProjection }
  | { readonly kind: "invalid"; readonly code: string };

export type SharedRuntimeSurface =
  | { readonly kind: "local-only"; readonly sharedBindingAvailable: false }
  | { readonly kind: "join"; readonly sharedBindingAvailable: false }
  | {
      readonly kind: "bound";
      readonly sharedBindingAvailable: true;
      readonly view: SharedPlayView;
    }
  | {
      readonly kind: "recovery";
      readonly sharedBindingAvailable: false;
      readonly code: string;
    };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recovery(code: string): SharedRuntimeSurface {
  return { kind: "recovery", sharedBindingAvailable: false, code };
}

export function resolveSharedProjection(
  composition: GameComposition,
  source: SharedProjectionSource,
  expectedReleaseId: ReleaseId,
  projectionContract: SharedProjectionContract | null,
): SharedProjectionResolution {
  const mechanic = composition.trustedMechanic;
  if (mechanic === undefined) return { kind: "invalid", code: "shared-composition-invalid" };
  if (projectionContract === null || projectionContract.schemaId !== mechanic.projectionSchema.id) {
    return { kind: "invalid", code: "shared-projection-contract-invalid" };
  }
  if (source.releaseId !== expectedReleaseId) {
    return { kind: "invalid", code: "shared-release-mismatch" };
  }
  const model = composition.aggregateModels.find(({ id }) => id === mechanic.aggregateModel);
  if (model?.authority !== "server") {
    return { kind: "invalid", code: "shared-composition-invalid" };
  }
  if (source.projections.length !== 1) {
    return { kind: "invalid", code: "shared-projection-binding-invalid" };
  }
  const projection = source.projections[0];
  const expectedAggregateId = model.kind === "team" ? source.teamId : source.sessionId;
  if (
    projection === undefined ||
    projection.schemaId !== mechanic.projectionSchema.id ||
    projection.aggregateKind !== model.kind ||
    projection.aggregateId !== expectedAggregateId
  ) {
    return { kind: "invalid", code: "shared-projection-binding-invalid" };
  }
  if (!projectionContract.validate(projection.value)) {
    return { kind: "invalid", code: "shared-projection-payload-invalid" };
  }
  return { kind: "resolved", projection };
}

export function deriveSharedRuntimeSurface(
  composition: GameComposition,
  view: SharedPlayView | null,
  expectedReleaseId: ReleaseId,
  projectionContract: SharedProjectionContract | null,
): SharedRuntimeSurface {
  const mechanic = composition.trustedMechanic;
  if (mechanic === undefined) {
    return projectionContract === null
      ? { kind: "local-only", sharedBindingAvailable: false }
      : recovery("shared-composition-invalid");
  }
  if (projectionContract === null || projectionContract.schemaId !== mechanic.projectionSchema.id) {
    return recovery("shared-projection-contract-invalid");
  }
  if (view === null) return { kind: "join", sharedBindingAvailable: false };
  if (view.membership.status === "revoked" || view.synchronization === "revoked") {
    return recovery("shared-membership-revoked");
  }
  if (view.synchronization === "recovery-required" || view.confirmedAt === null) {
    return recovery("shared-recovery-required");
  }
  const resolution = resolveSharedProjection(
    composition,
    {
      releaseId: view.releaseId,
      sessionId: view.sessionId,
      teamId: view.membership.teamId,
      projections: view.projections,
    },
    expectedReleaseId,
    projectionContract,
  );
  if (resolution.kind === "invalid") return recovery(resolution.code);
  return {
    kind: "bound",
    sharedBindingAvailable: true,
    view: Object.freeze({ ...view, projections: Object.freeze([resolution.projection]) }),
  };
}

export function createCompositionSharedBridgeHandlers(input: {
  readonly composition: GameComposition;
  readonly expectedReleaseId: ReleaseId;
  readonly projectionContract: SharedProjectionContract;
  getView(): Promise<SharedPlayView>;
  enqueue(command: SharedCommandIntent): Promise<SharedCommandStatus>;
}): SharedBridgeHandlers {
  const boundView = async (): Promise<SharedPlayView> => {
    const surface = deriveSharedRuntimeSurface(
      input.composition,
      await input.getView(),
      input.expectedReleaseId,
      input.projectionContract,
    );
    if (surface.kind === "bound") return surface.view;
    if (surface.kind === "recovery") throw new Error(surface.code);
    throw new Error(surface.kind === "join" ? "shared-session-missing" : "shared-unavailable");
  };
  return Object.freeze({
    getView: boundView,
    async enqueue(command: SharedCommandIntent) {
      const view = await boundView();
      const mechanic = input.composition.trustedMechanic;
      if (mechanic === undefined) throw new Error("shared-unavailable");
      const model = input.composition.aggregateModels.find(
        ({ id }) => id === mechanic.aggregateModel,
      );
      if (model?.authority !== "server") throw new Error("shared-composition-invalid");
      const descriptor = input.composition.commands.find(
        (candidate) =>
          mechanic.commands.includes(candidate.id) &&
          candidate.execution === "trusted-mechanic" &&
          candidate.aggregateModel === model.id &&
          candidate.type === command.type,
      );
      if (descriptor === undefined) throw new Error("shared-command-undeclared");
      const projection = view.projections[0];
      if (
        projection === undefined ||
        command.target.aggregateKind !== model.kind ||
        command.target.aggregateId !== projection.aggregateId ||
        command.target.schemaId !== model.stateSchema.id
      ) {
        throw new Error("shared-command-target-mismatch");
      }
      return input.enqueue(command);
    },
  });
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !hasLoneSurrogate(value);
}

function parse(value: unknown): SharedRequest | null {
  if (
    !object(value) ||
    Object.keys(value).length !== 4 ||
    !["payload", "requestId", "type", "version"].every((key) => Object.hasOwn(value, key)) ||
    value.version !== HOST_BRIDGE_VERSION ||
    !isValidRequestId(value.requestId) ||
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

function errorResponse(requestId: string, code: string): CanonicalJsonObject {
  return {
    version: HOST_BRIDGE_VERSION,
    requestId,
    type: "host.error",
    payload: { code },
  };
}

export async function routeSharedBridgeMessage(
  raw: string,
  handlers: SharedBridgeHandlers,
): Promise<CanonicalJsonObject> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse("unknown", "shared-message-invalid");
  }
  const requestId =
    object(decoded) && isValidRequestId(decoded.requestId) ? decoded.requestId : "unknown";
  const request = parse(decoded);
  if (request === null) return errorResponse(requestId, "shared-message-invalid");
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
    return errorResponse(
      request.requestId,
      error instanceof Error ? error.message : "shared-operation-failed",
    );
  }
}
