import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DurableTransitionResult, RunEventRecord } from "../src/model";
import {
  buildPlayReport,
  createPlayReport,
  type PlayReportDatabase,
  type PlayReportEvidence,
} from "../src/reports/create-play-report";

function receipt(
  commandId: string,
  terminal: "accepted" | "no-op" | "rejected" | "invalid",
  expectedVersion: number,
): DurableTransitionResult {
  return {
    kind: "accepted",
    commandId,
    commandOutcome: terminal,
    expectedVersion,
    resultingVersion: terminal === "accepted" ? expectedVersion + 1 : expectedVersion,
    ...(terminal === "invalid"
      ? { diagnosticCodes: ["command-failed"] }
      : { outcome: { result: terminal === "accepted" ? "advanced" : "not-advanced" } }),
    observationIds: terminal === "accepted" ? ["observation-1"] : [],
  };
}

function evidence(overrides: Partial<PlayReportEvidence> = {}): PlayReportEvidence {
  return {
    releaseId: `sha256:${"a".repeat(64)}`,
    runId: "run-1",
    platform: "ios",
    startedAtMs: 1_000,
    endedAtMs: 6_000,
    commands: [
      { result: receipt("command-1", "accepted", 0), elapsedMs: 2_000 },
      { result: receipt("command-2", "rejected", 1), elapsedMs: 2_500 },
    ],
    journals: [{ sequence: 1, commandId: "command-1", progressionChanges: ["puzzle"] }],
    capabilities: [
      {
        elapsedMs: 900,
        recordId: "observation-1",
        availability: "available",
        ageMs: 1_000,
        horizontalAccuracy: 18,
        diagnosticCode: null,
      },
    ],
    observationLinks: [{ commandId: "command-1", observationId: "observation-1" }],
    runEvents: [
      {
        kind: "lifecycle",
        elapsedMs: 1_700,
        phase: "transition",
        disposition: "interrupted",
        commandId: "command-2",
      },
      { kind: "diagnostic", elapsedMs: 1_800, code: "application-restored" },
    ],
    ...overrides,
  };
}

class FakeDatabase implements PlayReportDatabase {
  run: { release_id: `sha256:${string}`; started_at: string } | null = {
    release_id: `sha256:${"b".repeat(64)}`,
    started_at: "2026-08-03T00:00:00.000Z",
  };
  runEvents: unknown[] = [];

  raw() {
    return {
      getFirstAsync: async <T>() => this.run as T | null,
      getAllAsync: async <T>(query: string) =>
        (query.includes("FROM run_events") ? this.runEvents : []) as T[],
    };
  }
}

describe("PlayReport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("orders successful, rejected, capability, interruption, and diagnostic evidence", () => {
    const report = buildPlayReport(evidence());
    expect(report.durationMs).toBe(5_000);
    expect(report.events.map(({ kind }) => kind)).toEqual([
      "capability",
      "command",
      "command",
      "lifecycle",
      "diagnostic",
    ]);
    expect(report.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "command",
          commandId: "command-1",
          terminal: "accepted",
          progressionChanges: ["puzzle"],
        }),
        expect.objectContaining({
          kind: "command",
          commandId: "command-2",
          terminal: "rejected",
          progressionChanges: [],
        }),
        expect.objectContaining({
          kind: "capability",
          projection: {
            availability: "available",
            recencyBand: "fresh",
            accuracyBand: "good",
          },
        }),
      ]),
    );
  });

  it("makes a degraded-accuracy field rejection visible without exposing coordinates", () => {
    const rejected = receipt("field-check-in", "rejected", 0);
    const report = buildPlayReport(
      evidence({
        commands: [
          {
            result: {
              ...rejected,
              outcome: { result: "inaccurate" },
              observationIds: ["field-location"],
            },
            elapsedMs: 2_000,
          },
        ],
        journals: [],
        capabilities: [
          {
            elapsedMs: 900,
            recordId: "field-location",
            availability: "available",
            ageMs: 1_000,
            horizontalAccuracy: 35,
            diagnosticCode: null,
          },
        ],
        observationLinks: [{ commandId: "field-check-in", observationId: "field-location" }],
        runEvents: [],
      }),
    );

    expect(report.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability",
          projection: {
            availability: "available",
            recencyBand: "fresh",
            accuracyBand: "degraded",
          },
        }),
        expect.objectContaining({
          kind: "command",
          commandId: "field-check-in",
          terminal: "rejected",
          outcomeCode: "inaccurate",
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(/latitude|longitude|horizontalAccuracy/);
  });

  it.each([
    { ageMs: 1_000, expected: "fresh" },
    { ageMs: 15_001, expected: "stale" },
    { ageMs: -1, expected: "future" },
  ])("projects signed age $ageMs as $expected without exporting it", ({ ageMs, expected }) => {
    const report = buildPlayReport(
      evidence({
        capabilities: [
          {
            elapsedMs: 900,
            recordId: "observation-1",
            availability: "available",
            ageMs,
            horizontalAccuracy: 18,
            diagnosticCode: null,
          },
        ],
      }),
    );
    expect(report.events[0]).toMatchObject({
      kind: "capability",
      projection: { recencyBand: expected },
    });
    expect(JSON.stringify(report)).not.toMatch(/ageMs|recordedAt|capturedAt/);
  });

  it("keeps failed diagnostic evidence internal while reporting a redacted failed terminal", () => {
    const report = buildPlayReport(
      evidence({
        commands: [],
        journals: [],
        capabilities: [
          {
            elapsedMs: 900,
            recordId: "failed-location",
            availability: "failed",
            ageMs: null,
            horizontalAccuracy: null,
            diagnosticCode: "location-provider-failed",
          },
        ],
        observationLinks: [],
      }),
    );
    expect(report.events[0]).toMatchObject({
      kind: "capability",
      outcomeCode: "failed",
      projection: {
        availability: "failed",
        recencyBand: "unknown",
        accuracyBand: "unknown",
      },
    });
    expect(JSON.stringify(report)).not.toContain("location-provider-failed");
  });

  it("fails closed for incoherent journals and observation links", () => {
    expect(() => buildPlayReport(evidence({ journals: [] }))).toThrow("report-journal-incoherent");
    expect(() => buildPlayReport(evidence({ observationLinks: [] }))).toThrow(
      "report-observation-link-incoherent",
    );
  });

  it("rejects forbidden values even when malformed evidence bypasses static types", () => {
    const unsafe = {
      kind: "diagnostic",
      elapsedMs: 10,
      code: "unsafe-evidence",
      state: { secret: true },
    } as unknown as RunEventRecord;
    expect(() => buildPlayReport(evidence({ runEvents: [unsafe] }))).toThrow();
  });

  it("fails explicitly when the requested run is missing", async () => {
    const database = new FakeDatabase();
    database.run = null;
    await expect(createPlayReport(database, "missing-run", "android")).rejects.toThrow(
      "report-run-missing",
    );
  });

  it("fails explicitly for a malformed persisted run event", async () => {
    const database = new FakeDatabase();
    database.runEvents = [
      {
        elapsed_ms: 10,
        kind: "lifecycle",
        phase: null,
        disposition: "interrupted",
        code: null,
        command_id: null,
      },
    ];
    await expect(createPlayReport(database, "run-1", "ios")).rejects.toThrow(
      "report-run-event-incoherent",
    );
  });

  it("exports a fresh release as a separate empty run", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-03T00:00:01.000Z"));
    const database = new FakeDatabase();
    await expect(createPlayReport(database, "fresh-run", "android")).resolves.toEqual({
      version: 1,
      releaseId: `sha256:${"b".repeat(64)}`,
      runId: "fresh-run",
      platform: "android",
      durationMs: 1_000,
      events: [],
    });
  });
});
