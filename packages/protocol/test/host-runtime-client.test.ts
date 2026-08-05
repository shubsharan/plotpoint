import { describe, expect, it, vi } from "vitest";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  createHostRuntimeClient,
  isLocationObservation,
  type HostBridgeTransport,
  type HostCapabilityOutputValidator,
  type TransitionCandidate,
  type TransitionResult,
} from "../src/index.js";

function candidate(terminal: TransitionCandidate["terminal"]): TransitionCandidate {
  const base = {
    commandId: `command-${terminal}`,
    target: {
      aggregateId: "player-1",
      aggregateKind: "player" as const,
      schemaId: "player-state",
      schemaVersion: 1,
    },
    expectedVersion: 2,
    observationIds: [],
  };
  if (terminal === "accepted") {
    return {
      ...base,
      terminal,
      nextState: { phase: "complete" },
      outcome: { result: "advanced" },
      progressionChanges: ["complete"],
    };
  }
  if (terminal === "invalid") {
    return { ...base, terminal, diagnosticCodes: ["runtime-result-invalid"] };
  }
  return { ...base, terminal, outcome: { result: terminal } };
}

function result(
  transition: TransitionCandidate,
  disposition: TransitionResult["disposition"],
): TransitionResult {
  const base = {
    commandId: transition.commandId,
    disposition,
    terminal: transition.terminal,
    resultingVersion:
      transition.terminal === "accepted"
        ? transition.expectedVersion + 1
        : transition.expectedVersion,
  };
  return transition.terminal === "invalid"
    ? { ...base, terminal: "invalid", diagnosticCodes: transition.diagnosticCodes }
    : { ...base, terminal: transition.terminal, outcome: transition.outcome };
}

function transport(
  response: unknown,
): HostBridgeTransport & { readonly send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => response) };
}

const acceptsObject: HostCapabilityOutputValidator<object> = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

describe("Host Runtime Client ", () => {
  it.each(["committed", "duplicate"] as const)(
    "returns every closed transition terminal for a %s result",
    async (disposition) => {
      for (const terminal of ["accepted", "no-op", "rejected", "invalid"] as const) {
        const transition = candidate(terminal);
        const raw = transport(result(transition, disposition));
        const client = createHostRuntimeClient(raw);

        await expect(client.commitTransition(transition)).resolves.toEqual(
          result(transition, disposition),
        );
        expect(raw.send).toHaveBeenLastCalledWith("transition.commit", {
          candidate: transition,
        });
      }
    },
  );

  it("unwraps a capability output only after identity and output validation", async () => {
    const output = {
      version: 1,
      observationId: "location-1",
      recordedAt: "2030-01-01T00:00:00.000Z",
      availability: "unavailable",
    } as const;
    const raw = transport({ capability: FOREGROUND_LOCATION_CAPABILITY, output });
    const client = createHostRuntimeClient(raw);

    await expect(
      client.requestCapability(FOREGROUND_LOCATION_CAPABILITY, {}, isLocationObservation),
    ).resolves.toEqual(output);
    expect(raw.send).toHaveBeenCalledWith("capability.request", {
      capability: FOREGROUND_LOCATION_CAPABILITY,
      input: {},
    });
  });

  it.each([
    {
      name: "invalid transition result",
      response: { kind: "accepted" },
      expected: "host-transition-result-invalid",
    },
    {
      name: "wrong command correlation",
      response: {
        commandId: "another-command",
        disposition: "committed",
        terminal: "accepted",
        resultingVersion: 3,
        outcome: { result: "advanced" },
      },
      expected: "host-transition-command-mismatch",
    },
    {
      name: "wrong transition terminal",
      response: {
        commandId: "command-accepted",
        disposition: "duplicate",
        terminal: "rejected",
        resultingVersion: 2,
        outcome: { result: "outside" },
      },
      expected: "host-transition-terminal-mismatch",
    },
  ])("rejects $name", async ({ response, expected }) => {
    const client = createHostRuntimeClient(transport(response));
    await expect(client.commitTransition(candidate("accepted"))).rejects.toThrow(expected);
  });

  it.each([
    {
      name: "invalid result shape",
      response: { output: {} },
      expected: "host-capability-result-invalid",
      validate: acceptsObject,
    },
    {
      name: "wrong capability identity",
      response: {
        capability: { ...FOREGROUND_LOCATION_CAPABILITY, minor: 1 },
        output: {},
      },
      expected: "host-capability-identity-mismatch",
      validate: acceptsObject,
    },
    {
      name: "invalid capability output",
      response: { capability: FOREGROUND_LOCATION_CAPABILITY, output: { unexpected: true } },
      expected: "host-capability-output-invalid",
      validate: isLocationObservation,
    },
  ] satisfies readonly {
    readonly name: string;
    readonly response: unknown;
    readonly expected: string;
    readonly validate: HostCapabilityOutputValidator<object>;
  }[])("rejects $name", async ({ response, expected, validate }) => {
    const client = createHostRuntimeClient(transport(response));
    await expect(
      client.requestCapability(FOREGROUND_LOCATION_CAPABILITY, {}, validate),
    ).rejects.toThrow(expected);
  });
});
