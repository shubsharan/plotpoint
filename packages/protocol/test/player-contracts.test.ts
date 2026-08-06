import { describe, expect, it } from "vitest";

import {
  accuracyBand,
  isEligibleInstallUrl,
  isLocationObservation,
  isLocationRequestInput,
  parseHostBridgeEnvelope,
  parseInstallDescriptor,
  parseReportSafeDiagnosticCode,
  projectLocationObservation,
  recencyBand,
  type CapabilityRequestEnvelope,
  type CapabilityResultEnvelope,
} from "../src/index.js";
import * as protocol from "../src/index.js";

const releaseId = `sha256:${"a".repeat(64)}`;

describe("install descriptor", () => {
  it("accepts only closed private-network HTTP descriptors", () => {
    expect(
      parseInstallDescriptor({
        releaseUrl: "http://192.168.1.4:4100/release.pprelease",
        expectedReleaseId: releaseId,
      }).kind,
    ).toBe("valid");
    expect(isEligibleInstallUrl("https://192.168.1.4/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://8.8.8.8/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://user:pass@127.0.0.1/release.pprelease")).toBe(false);
    expect(
      parseInstallDescriptor({
        releaseUrl: "http://127.0.0.1/release.pprelease",
        expectedReleaseId: releaseId,
        label: "unexpected",
      }).kind,
    ).toBe("invalid");
  });
});

describe("host bridge", () => {
  const target = {
    aggregateId: "player-1",
    aggregateKind: "player",
    schemaId: "plotpoint.player",
  } as const;

  function transition(terminal: "accepted" | "no-op" | "rejected" | "invalid") {
    const base = {
      commandId: `command-${terminal}`,
      modelId: "field-player",
      commandType: "complete-checkpoint",
      payload: { checkpoint: 2 },
      target,
      expectedStateVersion: 2,
      observationIds: ["observation-1"],
      terminal,
    };
    if (terminal === "accepted") {
      return {
        ...base,
        terminal,
        nextState: { checkpoint: 2 },
        outcome: { code: "advanced" },
        domainEvents: [{ type: "checkpoint-reached", payload: { checkpointId: "checkpoint-2" } }],
        effectIntents: [],
        progressionTrace: [],
      };
    }
    if (terminal === "invalid") {
      return {
        ...base,
        terminal,
        phase: "execution",
        diagnosticCodes: ["runtime-result-invalid"],
        attemptedProgressionTrace: [],
      };
    }
    return { ...base, terminal, outcome: { code: terminal } };
  }

  it("accepts bootstrap and every closed transition candidate terminal", () => {
    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "request-1",
          type: "runtime.ready",
          payload: {},
        },
        "web-to-host",
      ).kind,
    ).toBe("valid");

    for (const terminal of ["accepted", "no-op", "rejected", "invalid"] as const) {
      expect(
        parseHostBridgeEnvelope(
          {
            version: 1,
            requestId: `request-${terminal}`,
            type: "transition.commit",
            payload: { candidate: transition(terminal) },
          },
          "web-to-host",
        ).kind,
      ).toBe("valid");
    }

    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "request-bootstrap",
          type: "runtime.bootstrap",
          payload: {
            runId: "run-1",
            releaseId,
            aggregate: {
              ...target,
              modelId: "field-player",
              stateVersion: 2,
              state: { checkpoint: 1 },
            },
          },
        },
        "host-to-web",
      ).kind,
    ).toBe("valid");
  });

  it("accepts committed and duplicate results for every recorded terminal", () => {
    for (const disposition of ["committed", "duplicate"] as const) {
      for (const terminal of ["accepted", "no-op", "rejected", "invalid"] as const) {
        const terminalPayload =
          terminal === "invalid"
            ? { phase: "execution", diagnosticCodes: ["runtime-result-invalid"] }
            : { outcome: { code: terminal } };
        expect(
          parseHostBridgeEnvelope(
            {
              version: 1,
              requestId: `${disposition}-${terminal}`,
              type: "transition.result",
              payload: {
                commandId: `command-${terminal}`,
                disposition,
                terminal,
                resultingStateVersion: terminal === "accepted" ? 3 : 2,
                ...terminalPayload,
              },
            },
            "host-to-web",
          ).kind,
        ).toBe("valid");
      }
    }
  });

  it("rejects malformed terminal shapes and noncanonical values", () => {
    const acceptedWithoutState = {
      commandId: "command-accepted",
      modelId: "field-player",
      commandType: "complete-checkpoint",
      payload: { checkpoint: 2 },
      target,
      expectedStateVersion: 2,
      observationIds: ["observation-1"],
      terminal: "accepted",
      outcome: { code: "advanced" },
      domainEvents: [],
      effectIntents: [],
      progressionTrace: [],
    };
    const malformed = [
      { ...transition("no-op"), nextState: {} },
      acceptedWithoutState,
      { ...transition("invalid"), outcome: {} },
      { ...transition("invalid"), phase: "preflight" },
      { ...transition("rejected"), diagnosticCodes: ["unexpected"] },
      { ...transition("accepted"), observationIds: ["duplicate", "duplicate"] },
      { ...transition("accepted"), outcome: { invalid: Number.NaN } },
      { ...transition("accepted"), expectedVersion: 2 },
      { ...transition("accepted"), schemaVersion: 1 },
      { ...transition("accepted"), progressionChanges: ["checkpoint-2"] },
    ];
    for (const [index, candidate] of malformed.entries()) {
      expect(
        parseHostBridgeEnvelope(
          {
            version: 1,
            requestId: `malformed-${index}`,
            type: "transition.commit",
            payload: { candidate },
          },
          "web-to-host",
        ).kind,
      ).toBe("invalid");
    }
  });

  it("rejects unsupported versions, unknown fields, and wrong-direction messages", () => {
    expect(
      parseHostBridgeEnvelope({
        version: 2,
        requestId: "request-1",
        type: "runtime.ready",
        payload: {},
      }),
    ).toEqual({ kind: "invalid", code: "bridge-version-unsupported" });

    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "request-extra",
          type: "runtime.ready",
          payload: { extra: true },
        },
        "web-to-host",
      ),
    ).toEqual({ kind: "invalid", code: "bridge-payload-fields-invalid" });

    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "request-wrong-direction",
          type: "runtime.bootstrap",
          payload: {
            runId: "run-1",
            releaseId,
            aggregate: {
              ...target,
              modelId: "field-player",
              stateVersion: 2,
              state: {},
            },
          },
        },
        "web-to-host",
      ),
    ).toEqual({ kind: "invalid", code: "bridge-direction-invalid" });

    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "request-wrong-direction",
          type: "transition.commit",
          payload: { candidate: transition("accepted") },
        },
        "host-to-web",
      ),
    ).toEqual({ kind: "invalid", code: "bridge-direction-invalid" });
  });

  it("rejects repeated version fields inside corrected bootstrap and transition payloads", () => {
    const bootstrap = {
      runId: "run-1",
      releaseId,
      aggregate: {
        ...target,
        modelId: "field-player",
        stateVersion: 2,
        state: { checkpoint: 1 },
      },
    };

    for (const payload of [
      { ...bootstrap, version: 1 },
      { ...bootstrap, aggregate: { ...bootstrap.aggregate, schemaVersion: 1 } },
    ]) {
      expect(
        parseHostBridgeEnvelope(
          { version: 1, requestId: "versioned-bootstrap", type: "runtime.bootstrap", payload },
          "host-to-web",
        ).kind,
      ).toBe("invalid");
    }
  });

  it("keeps capability dispatch generic, closed, and compatibility-checked", () => {
    type GeocodeInput = { readonly query: string };
    type GeocodeOutput = { readonly matchCount: number };
    const request: CapabilityRequestEnvelope<GeocodeInput> = {
      version: 1,
      requestId: "capability-request",
      type: "capability.request",
      payload: {
        capability: { id: "example.geocode", major: 2, minor: 3 },
        input: { query: "checkpoint" },
      },
    };
    const result: CapabilityResultEnvelope<GeocodeOutput> = {
      version: 1,
      requestId: request.requestId,
      type: "capability.result",
      payload: {
        capability: request.payload.capability,
        output: { matchCount: 1 },
      },
    };

    expect(parseHostBridgeEnvelope(request, "web-to-host").kind).toBe("valid");
    expect(parseHostBridgeEnvelope(result, "host-to-web").kind).toBe("valid");
    expect(
      parseHostBridgeEnvelope(
        {
          ...request,
          payload: { ...request.payload, catalog: ["example.geocode"] },
        },
        "web-to-host",
      ).kind,
    ).toBe("invalid");
    expect(
      parseHostBridgeEnvelope(
        {
          ...request,
          payload: {
            ...request.payload,
            capability: { ...request.payload.capability, patch: 1 },
          },
        },
        "web-to-host",
      ).kind,
    ).toBe("invalid");
  });

  it("accepts exact host errors and rejects malformed optional fields", () => {
    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "host-error",
          type: "host.error",
          payload: { code: "aggregate-version-stale", commandId: "command-1", currentVersion: 3 },
        },
        "host-to-web",
      ).kind,
    ).toBe("valid");
    expect(
      parseHostBridgeEnvelope(
        {
          version: 1,
          requestId: "host-error-invalid",
          type: "host.error",
          payload: { code: "aggregate-version-stale", currentVersion: -1 },
        },
        "host-to-web",
      ).kind,
    ).toBe("invalid");
  });
});

describe("report policy", () => {
  it("maps precision to redacted bands", () => {
    expect(accuracyBand(4)).toBe("excellent");
    expect(accuracyBand(25)).toBe("good");
    expect(accuracyBand(80)).toBe("degraded");
    expect(accuracyBand(undefined)).toBe("unknown");
  });
});

describe("GamePlayReport", () => {
  const report = {
    releaseId,
    platform: "ios",
    durationMs: 500,
    shared: { membership: "revoked" },
    events: [
      {
        kind: "lifecycle",
        elapsedMs: 0,
        disposition: "mounted",
      },
      {
        kind: "command",
        elapsedMs: 100,
        scope: "local",
        commandAlias: "command-1",
        terminal: "accepted",
        expectedStateVersion: 0,
        resultingStateVersion: 1,
      },
      {
        kind: "capability",
        elapsedMs: 200,
        capabilityId: "plotpoint.location.foreground",
        disposition: "consumed",
      },
      {
        kind: "synchronization",
        elapsedMs: 300,
        phase: "revoked",
        disposition: "membership-revoked",
      },
      {
        kind: "recovery",
        elapsedMs: 400,
        disposition: "snapshot-replaced",
      },
    ],
  } as const;

  function validate(value: unknown): boolean {
    const validator = (
      protocol as unknown as {
        readonly isGamePlayReport?: (candidate: unknown) => boolean;
      }
    ).isGamePlayReport;
    expect(validator, "plain Game Play Report validator export").toBeTypeOf("function");
    return validator?.(value) ?? false;
  }

  it("accepts the plain generic report with local and shared evidence", () => {
    expect(validate(report)).toBe(true);
  });

  it("rejects the superseded versioned and run-identified report shapes", () => {
    for (const invalid of [
      { ...report, version: 1 },
      { ...report, runId: "run-1" },
      { ...report, gameId: "co-op-game" },
      {
        ...report,
        events: [
          {
            kind: "command",
            elapsedMs: 100,
            commandId: "command-1",
            terminal: "accepted",
            expectedVersion: 0,
            resultingVersion: 1,
            progressionChanges: [],
          },
        ],
      },
    ]) {
      expect(validate(invalid)).toBe(false);
    }
  });

  it("rejects game-specific, identity-bearing, and raw evidence fields", () => {
    const forbiddenReports = [
      { ...report, rawState: { phase: "complete" } },
      {
        ...report,
        events: [
          {
            ...report.events[1],
            commandPayload: { answer: "map" },
          },
        ],
      },
      { ...report, shared: { membership: "revoked", sessionId: "session-1" } },
      { ...report, events: [{ ...report.events[2], latitude: 37.7 }] },
      { ...report, events: [{ ...report.events[3], serviceOrigin: "https://example.invalid" }] },
      { ...report, events: [{ ...report.events[4], hostPath: "/private/run.db" }] },
    ];
    for (const invalid of forbiddenReports) {
      expect(validate(invalid)).toBe(false);
    }
  });

  it("allows only closed host-owned diagnostic codes", () => {
    expect(parseReportSafeDiagnosticCode("runtime-mount-failed")).toBe("runtime-mount-failed");
    expect(parseReportSafeDiagnosticCode("shared-sync-failed")).toBe("shared-sync-failed");
    expect(parseReportSafeDiagnosticCode("provider said credential=secret")).toBeNull();
    expect(parseReportSafeDiagnosticCode("/private/run.db")).toBeNull();
  });

  it("rejects adversarial aliases, outcomes, configuration, and durable evidence", () => {
    const command = report.events[1];
    if (command?.kind !== "command") throw new Error("command-fixture-missing");
    for (const extra of [
      { commandId: "sensitive-command" },
      { outcomeCode: "target-discovered" },
      { payload: { targetId: "target-secret" } },
      { configuration: { maximumAgeMs: 15_000 } },
      { projection: { complete: true } },
      { credentialKey: "secure-store-key" },
    ]) {
      expect(
        validate({
          ...report,
          events: [{ ...command, ...extra }],
        }),
      ).toBe(false);
    }
    for (const extra of [
      { version: 1 },
      { runAlias: "run" },
      { sessionAlias: "session" },
      { participantAlias: "self" },
      { teamAlias: "team" },
    ]) {
      expect(validate({ ...report, ...extra })).toBe(false);
    }
  });
});

describe("foreground location capability", () => {
  const base = {
    observationId: "location-1",
    recordedAt: "2026-08-03T12:00:01.000Z",
  } as const;
  const available = {
    ...base,
    availability: "available",
    capturedAt: "2026-08-03T12:00:00.000Z",
    ageMs: 1_000,
    latitude: 37.76942,
    longitude: -122.48621,
    horizontalAccuracy: 8,
  } as const;

  it("accepts only the exact empty request and closed terminal outputs", () => {
    expect(isLocationRequestInput({})).toBe(true);
    expect(isLocationRequestInput({ continuous: true })).toBe(false);

    for (const observation of [
      available,
      { ...base, availability: "permission-denied" },
      { ...base, availability: "unavailable" },
      { ...base, availability: "failed", diagnosticCode: "location-provider-failed" },
    ]) {
      expect(isLocationObservation(observation)).toBe(true);
    }
    expect(isLocationObservation({ ...available, speed: 4 })).toBe(false);
    expect(
      isLocationObservation({
        ...base,
        availability: "unavailable",
        latitude: 0,
      }),
    ).toBe(false);
    expect(
      isLocationObservation({
        ...base,
        availability: "failed",
        diagnosticCode: "raw provider detail!",
      }),
    ).toBe(false);
  });

  it("validates signed age, geographic range, and horizontal accuracy", () => {
    expect(isLocationObservation({ ...available, ageMs: -500 })).toBe(true);
    expect(isLocationObservation({ ...available, ageMs: Number.MAX_SAFE_INTEGER })).toBe(true);
    for (const invalid of [
      { ...available, ageMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...available, ageMs: 1.5 },
      { ...available, latitude: -90.01 },
      { ...available, latitude: 90.01 },
      { ...available, longitude: -180.01 },
      { ...available, longitude: 180.01 },
      { ...available, horizontalAccuracy: -0.01 },
      { ...available, horizontalAccuracy: Number.POSITIVE_INFINITY },
    ]) {
      expect(isLocationObservation(invalid)).toBe(false);
    }
  });

  it("projects only redacted availability, recency, and accuracy bands", () => {
    expect(recencyBand(-1, 15_000)).toBe("future");
    expect(recencyBand(15_000, 15_000)).toBe("fresh");
    expect(recencyBand(15_001, 15_000)).toBe("stale");
    expect(projectLocationObservation(available, 15_000)).toEqual({
      availability: "available",
      recencyBand: "fresh",
      accuracyBand: "excellent",
    });
    expect(
      projectLocationObservation(
        { ...base, availability: "failed", diagnosticCode: "location-provider-failed" },
        15_000,
      ),
    ).toEqual({
      availability: "failed",
      recencyBand: "unknown",
      accuracyBand: "unknown",
    });
    expect(JSON.stringify(projectLocationObservation(available, 15_000))).not.toMatch(
      /latitude|longitude|capturedAt|recordedAt|ageMs|horizontalAccuracy|diagnosticCode/,
    );
  });
});
