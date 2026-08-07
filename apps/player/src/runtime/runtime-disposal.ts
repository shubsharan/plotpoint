export const RUNTIME_DISPOSED_MESSAGE_TYPE = "runtime.disposed" as const;

export type RuntimeGeneratedDisposalFailureCode =
  | "runtime-disposal-startup-failed"
  | "runtime-disposal-cleanup-failed";

export type RuntimeNativeDisposalFailureCode =
  | "runtime-webview-content-process-terminated"
  | "runtime-webview-render-process-gone";

export type RuntimeDisposalOutcome =
  | { readonly status: "disposed" }
  | {
      readonly status: "failed";
      readonly code: RuntimeGeneratedDisposalFailureCode | RuntimeNativeDisposalFailureCode;
    };

export interface RuntimeDisposalAcknowledgement {
  readonly version: 1;
  readonly requestId: string;
  readonly type: typeof RUNTIME_DISPOSED_MESSAGE_TYPE;
  readonly payload:
    | { readonly status: "disposed" }
    | { readonly status: "failed"; readonly code: RuntimeGeneratedDisposalFailureCode };
}

function isGeneratedFailureCode(value: string): value is RuntimeGeneratedDisposalFailureCode {
  return value === "runtime-disposal-startup-failed" || value === "runtime-disposal-cleanup-failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseRuntimeDisposalAcknowledgement(
  serialized: string,
): RuntimeDisposalAcknowledgement | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (
    !isRecord(decoded) ||
    !hasExactKeys(decoded, ["version", "requestId", "type", "payload"]) ||
    decoded.version !== 1 ||
    typeof decoded.requestId !== "string" ||
    decoded.requestId.length === 0 ||
    decoded.type !== RUNTIME_DISPOSED_MESSAGE_TYPE ||
    !isRecord(decoded.payload)
  ) {
    return null;
  }
  const payload = decoded.payload;
  if (hasExactKeys(payload, ["status"]) && payload.status === "disposed") {
    return {
      version: 1,
      requestId: decoded.requestId,
      type: RUNTIME_DISPOSED_MESSAGE_TYPE,
      payload: { status: "disposed" },
    };
  }
  if (
    hasExactKeys(payload, ["status", "code"]) &&
    payload.status === "failed" &&
    typeof payload.code === "string" &&
    isGeneratedFailureCode(payload.code)
  ) {
    return {
      version: 1,
      requestId: decoded.requestId,
      type: RUNTIME_DISPOSED_MESSAGE_TYPE,
      payload: { status: "failed", code: payload.code },
    };
  }
  return null;
}

export function buildRuntimeDisposalRequestScript(requestId: string): string {
  return `window.__plotpointRequestDispose(${JSON.stringify(requestId)});true;`;
}

interface ActiveDisposal {
  readonly requestId: string;
  readonly promise: Promise<RuntimeDisposalOutcome>;
  readonly resolve: (outcome: RuntimeDisposalOutcome) => void;
}

let nextDisposalRequest = 1;

export class RuntimeDisposalCoordinator {
  private active: ActiveDisposal | null = null;
  private settled: RuntimeDisposalOutcome | null = null;

  constructor(private readonly mountIdentity: string) {}

  request(inject: (script: string) => void): Promise<RuntimeDisposalOutcome> {
    if (this.settled !== null) return Promise.resolve(this.settled);
    if (this.active !== null) return this.active.promise;

    const requestId = `${this.mountIdentity}:dispose:${nextDisposalRequest++}`;
    let resolve!: (outcome: RuntimeDisposalOutcome) => void;
    const promise = new Promise<RuntimeDisposalOutcome>((settle) => {
      resolve = settle;
    });
    this.active = { requestId, promise, resolve };
    try {
      inject(buildRuntimeDisposalRequestScript(requestId));
    } catch {
      this.active = null;
      throw new Error("runtime-disposal-injection-failed");
    }
    return promise;
  }

  activeRequestId(): string | null {
    return this.active?.requestId ?? null;
  }

  consume(serialized: string): boolean {
    const acknowledgement = parseRuntimeDisposalAcknowledgement(serialized);
    if (
      acknowledgement === null ||
      this.active === null ||
      acknowledgement.requestId !== this.active.requestId
    ) {
      return false;
    }
    this.settle(acknowledgement.payload);
    return true;
  }

  processTerminated(code: RuntimeNativeDisposalFailureCode): boolean {
    if (this.settled !== null) return false;
    this.settle({ status: "failed", code });
    return true;
  }

  private settle(outcome: RuntimeDisposalOutcome): void {
    if (this.settled !== null) return;
    this.settled = Object.freeze(outcome);
    const active = this.active;
    this.active = null;
    active?.resolve(this.settled);
  }
}
