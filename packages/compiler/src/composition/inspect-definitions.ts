import { spawn } from "node:child_process";

import { canonicalizeValue } from "@plotpoint/runtime";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type { CompilerDiagnostic } from "../project/config.js";

export interface InspectedCommandMetadata {
  readonly registrationId: string;
  readonly definitionId: string;
  readonly commandType: string;
  readonly aggregateKind: "player" | "team" | "session";
}

export interface InspectedApplicationMetadata {
  readonly keys: readonly string[];
  readonly mountType: string;
}

export interface InspectedAggregateModelMetadata {
  readonly registrationId: string;
  readonly initializerType: string;
}

export interface InspectedProgressionMetadata {
  readonly registrationId: string;
  readonly graphId: string;
  readonly aggregateKind: "player" | "team" | "session";
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly initialStatus: string;
  }[];
  readonly transitions: readonly {
    readonly transitionId: string;
    readonly targetNodeId: string;
    readonly from: readonly string[];
    readonly to: string;
    readonly priority: number;
    readonly trigger: "automatic" | "intent";
  }[];
}

export interface InspectedComponentMetadata {
  readonly registrationId: string;
  readonly implementationType: string;
}

export interface DefinitionInspectionMetadata {
  readonly application: InspectedApplicationMetadata;
  readonly aggregateModels: readonly InspectedAggregateModelMetadata[];
  readonly commands: readonly InspectedCommandMetadata[];
  readonly progressions: readonly InspectedProgressionMetadata[];
  readonly components: readonly InspectedComponentMetadata[];
}

export interface InspectDefinitionBundleOptions {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export type InspectDefinitionBundleResult =
  | { readonly kind: "valid"; readonly metadata: DefinitionInspectionMetadata }
  | { readonly kind: "invalid"; readonly diagnostic: CompilerDiagnostic };

function diagnostic(
  code:
    | "definition-inspection-timeout"
    | "definition-inspection-failed"
    | "definition-inspection-output-invalid",
  reason: string,
): InspectDefinitionBundleResult {
  return {
    kind: "invalid",
    diagnostic: createCompilerDiagnostic({
      code,
      location: { kind: "artifact", path: "definition-inspection" },
      details: { reason },
    }),
  };
}

function definitionMismatch(
  registration: "application" | "aggregateModels" | "components",
  id: string,
  field: "definition" | "initializer" | "implementation",
  reason: string,
): InspectDefinitionBundleResult {
  return {
    kind: "invalid",
    diagnostic: createCompilerDiagnostic({
      code: "definition-metadata-mismatch",
      location: { kind: "registration", registration, id, field },
      details: { reason },
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAggregateKind(value: unknown): value is "player" | "team" | "session" {
  return value === "player" || value === "team" || value === "session";
}

function isAggregateModelMetadata(value: unknown): value is InspectedAggregateModelMetadata {
  return (
    isRecord(value) &&
    typeof value.registrationId === "string" &&
    typeof value.initializerType === "string"
  );
}

function isCommandMetadata(value: unknown): value is InspectedCommandMetadata {
  return (
    isRecord(value) &&
    typeof value.registrationId === "string" &&
    typeof value.definitionId === "string" &&
    typeof value.commandType === "string" &&
    isAggregateKind(value.aggregateKind)
  );
}

function isProgressionMetadata(value: unknown): value is InspectedProgressionMetadata {
  if (
    !isRecord(value) ||
    typeof value.registrationId !== "string" ||
    typeof value.graphId !== "string" ||
    !isAggregateKind(value.aggregateKind) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.transitions)
  ) {
    return false;
  }
  return (
    value.nodes.every(
      (node) =>
        isRecord(node) && typeof node.nodeId === "string" && typeof node.initialStatus === "string",
    ) &&
    value.transitions.every(
      (transition) =>
        isRecord(transition) &&
        typeof transition.transitionId === "string" &&
        typeof transition.targetNodeId === "string" &&
        Array.isArray(transition.from) &&
        transition.from.every((status) => typeof status === "string") &&
        typeof transition.to === "string" &&
        Number.isSafeInteger(transition.priority) &&
        (transition.trigger === "automatic" || transition.trigger === "intent"),
    )
  );
}

function isComponentMetadata(value: unknown): value is InspectedComponentMetadata {
  return (
    isRecord(value) &&
    typeof value.registrationId === "string" &&
    typeof value.implementationType === "string"
  );
}

function inspectMetadata(value: unknown): InspectDefinitionBundleResult {
  if (
    !isRecord(value) ||
    !isRecord(value.application) ||
    !Array.isArray(value.application.keys) ||
    !value.application.keys.every((key) => typeof key === "string") ||
    typeof value.application.mountType !== "string" ||
    !Array.isArray(value.aggregateModels) ||
    !Array.isArray(value.commands) ||
    !Array.isArray(value.progressions) ||
    !Array.isArray(value.components)
  ) {
    return diagnostic("definition-inspection-output-invalid", "metadata-shape-invalid");
  }
  if (
    value.application.keys.length !== 1 ||
    value.application.keys[0] !== "mount" ||
    value.application.mountType !== "function"
  ) {
    return definitionMismatch(
      "application",
      "application",
      "definition",
      "application-must-expose-only-mount",
    );
  }
  if (!value.aggregateModels.every(isAggregateModelMetadata)) {
    return diagnostic("definition-inspection-output-invalid", "metadata-shape-invalid");
  }
  const invalidModel = value.aggregateModels.find((model) => model.initializerType !== "function");
  if (invalidModel !== undefined) {
    return definitionMismatch(
      "aggregateModels",
      invalidModel.registrationId,
      "initializer",
      "initializer-must-be-function",
    );
  }
  if (
    !value.commands.every(isCommandMetadata) ||
    !value.progressions.every(isProgressionMetadata) ||
    !value.components.every(isComponentMetadata)
  ) {
    return diagnostic("definition-inspection-output-invalid", "metadata-shape-invalid");
  }
  const invalidComponent = value.components.find(
    (component) => component.implementationType !== "function",
  );
  if (invalidComponent !== undefined) {
    return definitionMismatch(
      "components",
      invalidComponent.registrationId,
      "implementation",
      "component-must-be-function",
    );
  }
  return {
    kind: "valid",
    metadata: {
      application: {
        keys: value.application.keys,
        mountType: value.application.mountType,
      },
      aggregateModels: value.aggregateModels,
      commands: value.commands,
      progressions: value.progressions,
      components: value.components,
    },
  };
}

export async function inspectDefinitionBundle(
  bundle: string | Uint8Array,
  options: InspectDefinitionBundleOptions = {},
): Promise<InspectDefinitionBundleResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxOutputBytes = options.maxOutputBytes ?? 256 * 1_024;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1
  ) {
    throw new TypeError("Definition inspection limits must be positive safe integers");
  }
  const source =
    typeof bundle === "string" ? bundle : new TextDecoder("utf-8", { fatal: true }).decode(bundle);

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--disable-proto=throw", "--no-warnings", "--input-type=module", "-"],
      {
        env: {},
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminal: InspectDefinitionBundleResult | undefined;
    const finish = (result: InspectDefinitionBundleResult): void => {
      if (terminal !== undefined) return;
      terminal = result;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      finish(diagnostic("definition-inspection-timeout", "deadline-exceeded"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        finish(diagnostic("definition-inspection-output-invalid", "stdout-limit-exceeded"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        finish(diagnostic("definition-inspection-output-invalid", "stderr-limit-exceeded"));
      }
    });
    child.on("error", () => {
      finish(diagnostic("definition-inspection-failed", "subprocess-error"));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (terminal !== undefined) {
        resolve(terminal);
        return;
      }
      if (code !== 0 || signal !== null) {
        resolve(diagnostic("definition-inspection-failed", "abnormal-exit"));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        const canonical = canonicalizeValue(parsed);
        if (canonical.kind === "invalid") {
          resolve(diagnostic("definition-inspection-output-invalid", "metadata-shape-invalid"));
          return;
        }
        resolve(inspectMetadata(canonical.canonical.value));
      } catch {
        resolve(diagnostic("definition-inspection-output-invalid", "invalid-json"));
      }
    });
    child.stdin.end(source);
  });
}
