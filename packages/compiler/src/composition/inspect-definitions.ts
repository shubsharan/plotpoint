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

export interface InspectedProgressionMetadata {
  readonly registrationId: string;
  readonly graphId: string;
  readonly graphVersion: number;
  readonly aggregateKind: "player" | "team" | "session";
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly initialStatus: string;
  }[];
  readonly automaticRules: readonly {
    readonly ruleId: string;
    readonly targetNodeId: string;
    readonly from: readonly string[];
    readonly to: string;
    readonly priority: number;
  }[];
}

export interface DefinitionInspectionMetadata {
  readonly commands: readonly InspectedCommandMetadata[];
  readonly progressions: readonly InspectedProgressionMetadata[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAggregateKind(value: unknown): value is "player" | "team" | "session" {
  return value === "player" || value === "team" || value === "session";
}

function validMetadata(value: unknown): value is DefinitionInspectionMetadata {
  if (!isRecord(value) || !Array.isArray(value.commands) || !Array.isArray(value.progressions)) {
    return false;
  }
  const commandsValid = value.commands.every(
    (command) =>
      isRecord(command) &&
      typeof command.registrationId === "string" &&
      typeof command.definitionId === "string" &&
      typeof command.commandType === "string" &&
      isAggregateKind(command.aggregateKind),
  );
  const progressionsValid = value.progressions.every((progression) => {
    if (
      !isRecord(progression) ||
      typeof progression.registrationId !== "string" ||
      typeof progression.graphId !== "string" ||
      !Number.isSafeInteger(progression.graphVersion) ||
      !isAggregateKind(progression.aggregateKind) ||
      !Array.isArray(progression.nodes) ||
      !Array.isArray(progression.automaticRules)
    ) {
      return false;
    }
    return (
      progression.nodes.every(
        (node) =>
          isRecord(node) &&
          typeof node.nodeId === "string" &&
          typeof node.initialStatus === "string",
      ) &&
      progression.automaticRules.every(
        (rule) =>
          isRecord(rule) &&
          typeof rule.ruleId === "string" &&
          typeof rule.targetNodeId === "string" &&
          Array.isArray(rule.from) &&
          rule.from.every((status) => typeof status === "string") &&
          typeof rule.to === "string" &&
          Number.isSafeInteger(rule.priority),
      )
    );
  });
  return commandsValid && progressionsValid;
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
        if (canonical.kind === "invalid" || !validMetadata(canonical.canonical.value)) {
          resolve(diagnostic("definition-inspection-output-invalid", "metadata-shape-invalid"));
          return;
        }
        resolve({ kind: "valid", metadata: canonical.canonical.value });
      } catch {
        resolve(diagnostic("definition-inspection-output-invalid", "invalid-json"));
      }
    });
    child.stdin.end(source);
  });
}
