import { HOST_BRIDGE_VERSION, parseHostBridgeEnvelope } from "@plotpoint/protocol";

import type { CandidateTransition } from "../model";

export type CandidateValidation =
  | { readonly kind: "valid"; readonly candidate: CandidateTransition }
  | { readonly kind: "invalid"; readonly code: string };

export function validateCandidateTransition(value: unknown): CandidateValidation {
  const commandId =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "commandId" in value &&
    typeof value.commandId === "string"
      ? value.commandId
      : "unknown";
  const parsed = parseHostBridgeEnvelope(
    {
      version: HOST_BRIDGE_VERSION,
      requestId: commandId,
      type: "transition.commit",
      payload: { candidate: value },
    },
    "web-to-host",
  );
  if (parsed.kind === "invalid" || parsed.envelope.type !== "transition.commit") {
    return { kind: "invalid", code: "transition-candidate-invalid" };
  }
  return { kind: "valid", candidate: parsed.envelope.payload.candidate };
}
