import { describe, expect, it } from "vitest";

import {
  accuracyBand,
  isEligibleInstallUrl,
  isLocationObservation,
  isLocationReportProjection,
  isLocationRequestInput,
  isPlayReport,
  LOCATION_REPORT_PROJECTION_VALIDATOR,
  parseHostBridgeEnvelope,
  parseInstallDescriptor,
  projectLocationObservation,
  recencyBand,
  type CapabilityRequestEnvelope,
  type CapabilityResultEnvelope,
} from "../src/index.js";

const releaseId = `sha256:${"a".repeat(64)}`;

describe("install descriptor", () => {
  it("accepts only closed private-network HTTP descriptors", () => {
    expect(
      parseInstallDescriptor({
        version: 1,
        releaseUrl: "http://192.168.1.4:4100/release.pprelease",
        expectedReleaseId: releaseId,
      }).kind,
    ).toBe("valid");
    expect(isEligibleInstallUrl("https://192.168.1.4/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://8.8.8.8/release.pprelease")).toBe(false);
    expect(isEligibleInstallUrl("http://user:pass@127.0.0.1/release.pprelease")).toBe(false);
    expect(
      parseInstallDescriptor({
        version: 1,
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
    schemaVersion: 1,
  } as const;

  function transition(terminal: "accepted" | "no-op" | "rejected" | "invalid") {
    const base = {
      commandId: `command-${terminal}`,
      target,
      expectedVersion: 2,
      observationIds: ["observation-1"],
      terminal,
    };
    if (terminal === "accepted") {
      return {
        ...base,
        terminal,
        nextState: { checkpoint: 2 },
        outcome: { code: "advanced" },
        progressionChanges: ["checkpoint-2"],
      };
    }
    if (terminal === "invalid") {
      return { ...base, terminal, diagnosticCodes: ["runtime-result-invalid"] };
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
            ? { diagnosticCodes: ["runtime-result-invalid"] }
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
                resultingVersion: terminal === "accepted" ? 3 : 2,
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
      target,
      expectedVersion: 2,
      observationIds: ["observation-1"],
      terminal: "accepted",
      outcome: { code: "advanced" },
      progressionChanges: ["checkpoint-2"],
    };
    const malformed = [
      { ...transition("no-op"), nextState: {} },
      acceptedWithoutState,
      { ...transition("invalid"), outcome: {} },
      { ...transition("rejected"), diagnosticCodes: ["unexpected"] },
      { ...transition("accepted"), observationIds: ["duplicate", "duplicate"] },
      { ...transition("accepted"), outcome: { invalid: Number.NaN } },
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
          payload: { runId: "run-1", releaseId, aggregate: null },
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

describe("PlayReport", () => {
  const report = {
    version: 1,
    releaseId,
    runId: "run-1",
    platform: "ios",
    durationMs: 400,
    events: [
      {
        kind: "command",
        elapsedMs: 100,
        commandId: "command-1",
        terminal: "accepted",
        expectedVersion: 0,
        resultingVersion: 1,
        outcomeCode: "checkpoint-advanced",
        progressionChanges: ["puzzle"],
      },
      {
        kind: "capability",
        elapsedMs: 200,
        capability: { id: "plotpoint.location.foreground", major: 1 },
        recordId: "location-1",
        outcomeCode: "available",
        projection: {
          availability: "available",
          recencyBand: "fresh",
          accuracyBand: "excellent",
        },
      },
      {
        kind: "lifecycle",
        elapsedMs: 200,
        phase: "view-created",
        disposition: "restored",
        commandId: "command-1",
      },
      {
        kind: "diagnostic",
        elapsedMs: 300,
        code: "delivery-interrupted",
        commandId: "command-1",
      },
    ],
  } as const;

  it("accepts one non-decreasing ordered timeline with exact event fields", () => {
    expect(isPlayReport(report, [LOCATION_REPORT_PROJECTION_VALIDATOR])).toBe(true);
    expect(isPlayReport(report)).toBe(false);

    const withEqualTie = {
      ...report,
      events: report.events.map((event) => ({ ...event, elapsedMs: 200 })),
    };
    expect(isPlayReport(withEqualTie, [LOCATION_REPORT_PROJECTION_VALIDATOR])).toBe(true);
  });

  it("rejects decreasing, excessive, negative, and non-integer relative times", () => {
    for (const invalid of [
      { ...report, events: [report.events[1], report.events[0]] },
      { ...report, events: [{ ...report.events[0], elapsedMs: 401 }] },
      { ...report, events: [{ ...report.events[0], elapsedMs: -1 }] },
      { ...report, events: [{ ...report.events[0], elapsedMs: 1.5 }] },
      { ...report, durationMs: -1 },
    ]) {
      expect(isPlayReport(invalid, [LOCATION_REPORT_PROJECTION_VALIDATOR])).toBe(false);
    }
  });

  it("keeps each command terminal, versions, outcome code, and progression together", () => {
    const command = report.events[0];
    for (const invalid of [
      { ...command, progressionChanges: undefined },
      { ...command, expectedVersion: undefined },
      { ...command, resultingVersion: undefined },
      { ...command, terminal: "partially-accepted" },
      { ...command, outcome: { raw: "secret" } },
      { ...command, outcomeCode: "raw provider detail!" },
    ]) {
      expect(
        isPlayReport({ ...report, events: [invalid] }, [LOCATION_REPORT_PROJECTION_VALIDATOR]),
      ).toBe(false);
    }
  });

  it("validates the location-owned projection and excludes forbidden sensor values", () => {
    const projection = report.events[1].projection;
    expect(isLocationReportProjection(projection)).toBe(true);
    for (const forbidden of [
      { ...projection, latitude: 37.7 },
      { ...projection, longitude: -122.4 },
      { ...projection, capturedAt: "2026-08-03T12:00:00.000Z" },
      { ...projection, horizontalAccuracy: 8 },
      { ...projection, diagnosticCode: "raw-provider-detail" },
    ]) {
      expect(isLocationReportProjection(forbidden)).toBe(false);
      expect(
        isPlayReport(
          {
            ...report,
            events: [{ ...report.events[1], projection: forbidden }],
          },
          [LOCATION_REPORT_PROJECTION_VALIDATOR],
        ),
      ).toBe(false);
    }
  });

  it("rejects raw state, command payloads, credentials, host paths, and stack traces", () => {
    const forbiddenReports = [
      { ...report, rawState: { phase: "complete" } },
      { ...report, events: [{ ...report.events[0], commandPayload: { answer: "map" } }] },
      { ...report, events: [{ ...report.events[2], hostPath: "/private/run.db" }] },
      { ...report, events: [{ ...report.events[3], stack: "Error at native.ts:1" }] },
      {
        ...report,
        events: [
          {
            ...report.events[1],
            projection: { ...report.events[1].projection, credential: "secret" },
          },
        ],
      },
    ];
    for (const invalid of forbiddenReports) {
      expect(isPlayReport(invalid, [LOCATION_REPORT_PROJECTION_VALIDATOR])).toBe(false);
    }
  });
});

describe("foreground location capability", () => {
  const base = {
    version: 1,
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
