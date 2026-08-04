import { describe, expect, it } from "vitest";

import { buildPlayReport } from "../src/reports/create-play-report";

describe("PlayReportV1", () => {
  it("keeps useful relative evidence while excluding private location and state", () => {
    const report = buildPlayReport({
      releaseId: `sha256:${"a".repeat(64)}`,
      runId: "run-1",
      platform: "ios",
      startedAtMs: 1_000,
      endedAtMs: 6_000,
      commands: [
        { commandId: "command-1", outcome: "accepted", resultingVersion: 1, occurredAtMs: 2_500 },
      ],
      observations: [
        {
          observationId: "observation-1",
          availability: "available",
          horizontalAccuracy: 18,
          elapsedMs: 1_400,
        },
      ],
      progressionChanges: ["puzzle"],
      recoveryEvents: [{ code: "application-restored", elapsedMs: 3_000 }],
    });

    expect(report).toMatchObject({
      durationMs: 5_000,
      commands: [{ elapsedMs: 1_500, resultingVersion: 1 }],
      observations: [{ accuracyBand: "good" }],
      diagnosticCodes: ["application-restored"],
    });
    const serialized = JSON.stringify(report);
    for (const forbidden of ["latitude", "longitude", "payload", "state", "credentials"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });
});
