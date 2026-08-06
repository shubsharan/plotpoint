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
  readonly schemaVersion: number;
  validate(value: SharedProjection["value"]): boolean;
}

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
  if (
    projectionContract === null ||
    projectionContract.schemaId !== mechanic.projectionSchema.id ||
    !Number.isSafeInteger(projectionContract.schemaVersion) ||
    projectionContract.schemaVersion <= 0
  ) {
    return recovery("shared-projection-contract-invalid");
  }
  if (view === null) return { kind: "join", sharedBindingAvailable: false };
  if (view.releaseId !== expectedReleaseId) return recovery("shared-release-mismatch");
  if (view.membership.status === "revoked" || view.synchronization === "revoked") {
    return recovery("shared-membership-revoked");
  }
  if (view.synchronization === "recovery-required" || view.confirmedAt === null) {
    return recovery("shared-recovery-required");
  }
  const model = composition.aggregateModels.find(({ id }) => id === mechanic.aggregateModel);
  if (model?.authority !== "server") return recovery("shared-composition-invalid");
  const projections = view.projections.filter(
    (projection) =>
      projection.schemaId === mechanic.projectionSchema.id &&
      projection.schemaVersion === projectionContract.schemaVersion &&
      projection.aggregateKind === model.kind,
  );
  if (projections.length !== 1) return recovery("shared-projection-binding-invalid");
  const projection = projections[0];
  const expectedAggregateId = model.kind === "team" ? view.membership.teamId : view.sessionId;
  if (projection?.aggregateId !== expectedAggregateId) {
    return recovery("shared-projection-binding-invalid");
  }
  if (!projectionContract.validate(projection.value)) {
    return recovery("shared-projection-payload-invalid");
  }
  return {
    kind: "bound",
    sharedBindingAvailable: true,
    view: Object.freeze({ ...view, projections: Object.freeze([projection]) }),
  };
}

export function createCompositionSharedBridgeHandlers(input: {
  readonly composition: GameComposition;
  readonly expectedReleaseId: ReleaseId;
  readonly aggregateSchemaVersions: Readonly<Record<string, number>>;
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
      const schemaVersion = input.aggregateSchemaVersions[model.stateSchema.id];
      if (
        projection === undefined ||
        !Number.isSafeInteger(schemaVersion) ||
        schemaVersion === undefined ||
        schemaVersion <= 0 ||
        command.target.aggregateKind !== model.kind ||
        command.target.aggregateId !== projection.aggregateId ||
        command.target.schemaId !== model.stateSchema.id ||
        command.target.schemaVersion !== schemaVersion
      ) {
        throw new Error("shared-command-target-mismatch");
      }
      if (command.expectedStateVersion !== projection.stateVersion) {
        throw new Error("shared-command-version-mismatch");
      }
      return input.enqueue(command);
    },
  });
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
