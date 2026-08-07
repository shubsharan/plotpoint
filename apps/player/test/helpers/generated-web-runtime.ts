export class GeneratedRuntimeElement {
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly children: GeneratedRuntimeElement[] = [];
  private readonly listeners = new Map<string, Set<() => unknown>>();
  disabled = false;
  textContent: string | null = null;
  parent: GeneratedRuntimeElement | null = null;
  type = "";
  value = "";

  addEventListener(type: string, listener: () => unknown): void {
    const registered = this.listeners.get(type) ?? new Set();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: () => unknown): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  async dispatchEvent(type: string): Promise<void> {
    for (const listener of this.listeners.get(type) ?? []) await listener();
  }

  append(...children: GeneratedRuntimeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: GeneratedRuntimeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length, ...children);
    for (const child of children) child.parent = this;
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

export async function mountGeneratedWebRuntime(
  html: string,
  routeMessage: (message: string) => Promise<unknown>,
) {
  const root = new GeneratedRuntimeElement();
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const elementDescriptor = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const runtimeDocument = {
    createElement: () => new GeneratedRuntimeElement(),
    getElementById: (id: string) => (id === "root" ? root : null),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: runtimeDocument });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: GeneratedRuntimeElement,
  });
  const restoreGlobals = () => {
    if (documentDescriptor === undefined) Reflect.deleteProperty(globalThis, "document");
    else Object.defineProperty(globalThis, "document", documentDescriptor);
    if (elementDescriptor === undefined) Reflect.deleteProperty(globalThis, "HTMLElement");
    else Object.defineProperty(globalThis, "HTMLElement", elementDescriptor);
  };
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (script === undefined) throw new Error("generated-runtime-script-missing");
  const executableScript = script
    .replace("import(logicUrl)", "__importModule(logicUrl)")
    .replace("import(presentationUrl)", "__importModule(presentationUrl)");
  const listeners = new Map<
    string,
    Set<(event: { readonly type: string; readonly detail?: unknown }) => void>
  >();
  const disposalWaiters = new Map<string, (acknowledgement: unknown) => void>();
  const runtimeWindow: Record<string, unknown> = {
    addEventListener(
      type: string,
      listener: (event: { readonly type: string; readonly detail?: unknown }) => void,
    ) {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(
      type: string,
      listener: (event: { readonly type: string; readonly detail?: unknown }) => void,
    ) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: { readonly type: string }) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
  };
  runtimeWindow.ReactNativeWebView = {
    postMessage(message: string) {
      const decoded = JSON.parse(message) as {
        readonly requestId?: unknown;
        readonly type?: unknown;
      };
      if (decoded.type === "runtime.disposed" && typeof decoded.requestId === "string") {
        const waiter = disposalWaiters.get(decoded.requestId);
        if (waiter !== undefined) {
          disposalWaiters.delete(decoded.requestId);
          waiter(decoded);
        }
        return;
      }
      void routeMessage(message).then((response) => {
        const receive = runtimeWindow.__plotpointReceive;
        if (typeof receive === "function") receive(response);
      });
    },
  };
  class RuntimeBlob {
    constructor(readonly parts: readonly string[]) {}
  }
  class RuntimeCustomEvent {
    readonly type: string;
    constructor(
      type: string,
      readonly input: { readonly detail?: unknown },
    ) {
      this.type = type;
    }
    get detail(): unknown {
      return this.input.detail;
    }
  }
  const execute = new Function(
    "Blob",
    "CustomEvent",
    "document",
    "HTMLElement",
    "__importModule",
    "URL",
    "window",
    "setTimeout",
    "clearTimeout",
    executableScript,
  );
  execute(
    RuntimeBlob,
    RuntimeCustomEvent,
    runtimeDocument,
    GeneratedRuntimeElement,
    (specifier: string) => import(specifier),
    {
      createObjectURL(blob: RuntimeBlob) {
        return `data:text/javascript,${encodeURIComponent(blob.parts.join(""))}`;
      },
    },
    runtimeWindow,
    (handler: () => void, timeoutMs: number) => globalThis.setTimeout(handler, timeoutMs),
    (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
  );
  for (let attempt = 0; attempt < 100 && root.children.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (root.children.length === 0) {
    restoreGlobals();
    throw new Error(root.textContent ?? "generated-runtime-mount-failed");
  }
  let disposalSequence = 0;
  const requestDisposal = (requestId = `generated-runtime-disposal-${++disposalSequence}`) => {
    const request = runtimeWindow.__plotpointRequestDispose;
    if (typeof request !== "function") throw new Error("generated-runtime-dispose-request-missing");
    const acknowledgement = new Promise<unknown>((resolve) => {
      disposalWaiters.set(requestId, resolve);
    });
    request(requestId);
    return acknowledgement;
  };
  let unmountPromise: Promise<void> | null = null;
  return {
    root,
    dispatchHostEvent(detail: unknown) {
      const dispatch = runtimeWindow.dispatchEvent;
      if (typeof dispatch !== "function")
        throw new Error("generated-runtime-host-dispatch-missing");
      dispatch(new RuntimeCustomEvent("plotpoint-host", { detail }));
    },
    requestDisposal,
    unmount() {
      if (unmountPromise !== null) return unmountPromise;
      unmountPromise = requestDisposal()
        .then((acknowledgement) => {
          const payload = (acknowledgement as { readonly payload?: unknown }).payload;
          if (
            payload === null ||
            typeof payload !== "object" ||
            !("status" in payload) ||
            payload.status !== "disposed"
          ) {
            const code =
              payload !== null &&
              typeof payload === "object" &&
              "code" in payload &&
              typeof payload.code === "string"
                ? payload.code
                : "generated-runtime-disposal-failed";
            throw new Error(code);
          }
        })
        .finally(restoreGlobals);
      return unmountPromise;
    },
  };
}
