import type {
  ComponentDescriptor,
  GameComposition,
  LocalAggregateView,
  SharedPlayView,
} from "@plotpoint/protocol";

import type { LocalCommandInvoker } from "./local-model-adapter";
import { createMountScope, MountScopeCleanupError, type MountCleanup } from "./mount-scope";

export interface SharedCommandInvoker {
  execute(input: object): Promise<unknown>;
}

export interface CapabilityClient {
  request(input: object): Promise<object>;
}

export interface ComponentContext {
  readonly lifecycle: { defer(cleanup: MountCleanup): void };
  readonly local: {
    getView(): Promise<LocalAggregateView>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, LocalCommandInvoker>>;
  };
  readonly shared?: {
    getView(): Promise<SharedPlayView>;
    onSyncChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, SharedCommandInvoker>>;
  };
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<Record<string, CapabilityClient>>;
}

export type ComponentImplementation = (context: ComponentContext) => HTMLElement;

export interface GameApplicationDefinition {
  mount(context: {
    readonly root: HTMLElement;
    readonly components: Readonly<Record<string, () => HTMLElement>>;
  }): GameApplicationHandle | Promise<GameApplicationHandle>;
}

export interface GameApplicationHandle {
  unmount(): void | Promise<void>;
}

export interface RuntimeComponentProviders {
  readonly local: {
    getView(): Promise<LocalAggregateView>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, LocalCommandInvoker>>;
  };
  readonly shared?: {
    getView(): Promise<SharedPlayView>;
    onSyncChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, SharedCommandInvoker>>;
  };
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<Record<string, CapabilityClient>>;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

export function isGameApplicationDefinition(value: unknown): value is GameApplicationDefinition {
  return record(value) && exactKeys(value, ["mount"]) && typeof value.mount === "function";
}

export function isGameApplicationHandle(value: unknown): value is GameApplicationHandle {
  return record(value) && exactKeys(value, ["unmount"]) && typeof value.unmount === "function";
}

function selectMap<Value>(
  source: Readonly<Record<string, Value>>,
  ids: readonly string[],
  missingCode: string,
): Readonly<Record<string, Value>> {
  return Object.freeze(
    Object.fromEntries(
      ids.map((id) => {
        if (!Object.hasOwn(source, id)) throw new Error(`${missingCode}:${id}`);
        return [id, source[id] as Value];
      }),
    ),
  );
}

function componentContext(
  descriptor: ComponentDescriptor,
  composition: GameComposition,
  providers: RuntimeComponentProviders,
  lifecycle: ComponentContext["lifecycle"],
): ComponentContext {
  const localCommandIds: string[] = [];
  const sharedCommandIds: string[] = [];
  for (const commandId of descriptor.commands) {
    const command = composition.commands.find(({ id }) => id === commandId);
    if (command === undefined) throw new Error(`runtime-component-command-undeclared:${commandId}`);
    (command.execution === "local" ? localCommandIds : sharedCommandIds).push(commandId);
  }
  if (sharedCommandIds.length > 0 && descriptor.sharedProjection === undefined) {
    throw new Error(`runtime-component-shared-projection-missing:${descriptor.id}`);
  }

  const local = Object.freeze({
    getView: providers.local.getView,
    onChanged: providers.local.onChanged,
    commands: selectMap(
      providers.local.commands,
      localCommandIds,
      `runtime-component-local-command-missing:${descriptor.id}`,
    ),
  });
  let shared: ComponentContext["shared"];
  if (descriptor.sharedProjection !== undefined) {
    if (providers.shared === undefined) {
      throw new Error(`runtime-component-shared-binding-missing:${descriptor.id}`);
    }
    shared = Object.freeze({
      getView: providers.shared.getView,
      onSyncChanged: providers.shared.onSyncChanged,
      commands: selectMap(
        providers.shared.commands,
        sharedCommandIds,
        `runtime-component-shared-command-missing:${descriptor.id}`,
      ),
    });
  }

  return Object.freeze({
    lifecycle,
    local,
    ...(shared === undefined ? {} : { shared }),
    content: selectMap(
      providers.content,
      descriptor.content,
      `runtime-component-content-missing:${descriptor.id}`,
    ),
    assets: selectMap(
      providers.assets,
      descriptor.assets,
      `runtime-component-asset-missing:${descriptor.id}`,
    ),
    capabilities: selectMap(
      providers.capabilities,
      descriptor.capabilities.map(({ id }) => id),
      `runtime-component-capability-missing:${descriptor.id}`,
    ),
  });
}

function validateComponentRegistry(
  composition: GameComposition,
  implementations: Readonly<Record<string, ComponentImplementation>>,
): void {
  const expected = composition.components.map(({ id }) => id).sort();
  const actual = Object.keys(implementations).sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => id !== actual[index]) ||
    Object.values(implementations).some((implementation) => typeof implementation !== "function")
  ) {
    throw new Error("runtime-component-registry-mismatch");
  }
}

export class RuntimeMountError extends Error {
  readonly failures: readonly unknown[];

  constructor(code: string, failures: readonly unknown[]) {
    super(code);
    this.failures = Object.freeze([...failures]);
  }
}

export async function mountGameComposition(input: {
  readonly root: HTMLElement;
  readonly composition: GameComposition;
  readonly application: unknown;
  readonly components: Readonly<Record<string, ComponentImplementation>>;
  readonly providers: RuntimeComponentProviders;
  readonly isElement?: (value: unknown) => value is HTMLElement;
}): Promise<GameApplicationHandle> {
  if (!isGameApplicationDefinition(input.application)) {
    throw new Error("runtime-application-definition-invalid");
  }
  validateComponentRegistry(input.composition, input.components);
  const scope = createMountScope();
  const isElement =
    input.isElement ??
    ((value: unknown): value is HTMLElement =>
      typeof HTMLElement !== "undefined" && value instanceof HTMLElement);
  const factories: Record<string, () => HTMLElement> = Object.create(null);
  for (const componentId of input.composition.application.components) {
    const descriptor = input.composition.components.find(({ id }) => id === componentId);
    const implementation = input.components[componentId];
    if (descriptor === undefined || implementation === undefined) {
      throw new Error(`runtime-application-component-missing:${componentId}`);
    }
    factories[componentId] = () => {
      let mounting = true;
      const lifecycle = Object.freeze({
        defer(cleanup: MountCleanup): void {
          if (!mounting) throw new Error("runtime-component-mount-scope-closed");
          scope.lifecycle.defer(cleanup);
        },
      });
      let element: HTMLElement;
      try {
        element = implementation(
          componentContext(descriptor, input.composition, input.providers, lifecycle),
        );
      } finally {
        mounting = false;
      }
      if (!isElement(element)) throw new Error(`runtime-component-element-invalid:${componentId}`);
      return element;
    };
  }

  let applicationHandle: GameApplicationHandle;
  try {
    const candidate = await input.application.mount(
      Object.freeze({ root: input.root, components: Object.freeze(factories) }),
    );
    if (!isGameApplicationHandle(candidate)) {
      throw new Error("runtime-application-handle-invalid");
    }
    applicationHandle = candidate;
    scope.closeRegistration();
  } catch (error) {
    try {
      await scope.dispose();
    } catch (cleanupError) {
      throw new RuntimeMountError("runtime-mount-rollback-failed", [error, cleanupError]);
    }
    throw error;
  }

  let disposal: Promise<void> | undefined;
  return Object.freeze({
    unmount(): Promise<void> {
      if (disposal !== undefined) return disposal;
      disposal = (async () => {
        const failures: unknown[] = [];
        try {
          await applicationHandle.unmount();
        } catch (error) {
          failures.push(error);
        }
        try {
          await scope.dispose();
        } catch (error) {
          if (error instanceof MountScopeCleanupError) failures.push(...error.failures);
          else failures.push(error);
        }
        if (failures.length > 0) {
          throw new RuntimeMountError("runtime-application-unmount-failed", failures);
        }
      })();
      return disposal;
    },
  });
}
