import { describe, expect, it } from "vitest";

import {
  buildGamePlayReport,
  createGamePlayReport,
  type GamePlayReportDatabase,
  type GamePlayReportEvidence,
} from "../src/reports/create-game-play-report";

const releaseId = `sha256:${"a".repeat(64)}` as const;

function evidence(overrides: Partial<GamePlayReportEvidence> = {}): GamePlayReportEvidence {
  return {
    releaseId,
    platform: "ios",
    lifecycle: [{ elapsedMs: 0, sourceSequence: 0, disposition: "mounted" }],
    commands: [],
    capabilities: [],
    synchronization: [],
    recovery: [],
    diagnostics: [],
    ...overrides,
  };
}

describe("Game Play Report", () => {
  it("orders by elapsed time, kind, and stable source sequence while assigning stable aliases", () => {
    const input = evidence({
      lifecycle: [
        { elapsedMs: 20, sourceSequence: 2, disposition: "unmounted" },
        { elapsedMs: 0, sourceSequence: 1, disposition: "mounted" },
      ],
      commands: [
        {
          elapsedMs: 10,
          sourceSequence: 2,
          scope: "local",
          commandId: "sensitive-later-command",
          terminal: "accepted",
          expectedStateVersion: 0,
          resultingStateVersion: 1,
        },
        {
          elapsedMs: 10,
          sourceSequence: 1,
          scope: "shared",
          commandId: "sensitive-earlier-command",
          terminal: "rejected",
          expectedStateVersion: 4,
          resultingStateVersion: 4,
        },
      ],
      capabilities: [
        {
          elapsedMs: 10,
          sourceSequence: 3,
          capabilityId: "plotpoint.location.foreground",
          disposition: "expired",
        },
      ],
      diagnostics: [
        {
          elapsedMs: 10,
          sourceSequence: 4,
          code: "delivery-interrupted",
          commandScope: "shared",
          commandId: "sensitive-earlier-command",
        },
      ],
    });
    const report = buildGamePlayReport(input);

    expect(report.durationMs).toBe(20);
    expect(report.events).toEqual([
      { kind: "lifecycle", elapsedMs: 0, disposition: "mounted" },
      {
        kind: "capability",
        elapsedMs: 10,
        capabilityId: "plotpoint.location.foreground",
        disposition: "expired",
      },
      {
        kind: "command",
        elapsedMs: 10,
        scope: "shared",
        commandAlias: "command-001",
        terminal: "rejected",
        expectedStateVersion: 4,
        resultingStateVersion: 4,
      },
      {
        kind: "command",
        elapsedMs: 10,
        scope: "local",
        commandAlias: "command-002",
        terminal: "accepted",
        expectedStateVersion: 0,
        resultingStateVersion: 1,
      },
      {
        kind: "diagnostic",
        elapsedMs: 10,
        code: "delivery-interrupted",
        commandAlias: "command-001",
      },
      { kind: "lifecycle", elapsedMs: 20, disposition: "unmounted" },
    ]);
    expect(JSON.stringify(buildGamePlayReport(input))).toBe(JSON.stringify(report));
  });

  it("combines local and shared committed evidence without constant aliases or a report version", () => {
    const report = buildGamePlayReport(
      evidence({
        sharedMembership: "revoked",
        commands: [
          {
            elapsedMs: 5,
            sourceSequence: 1,
            scope: "local",
            commandId: "local-command",
            terminal: "no-op",
            expectedStateVersion: 2,
            resultingStateVersion: 2,
          },
          {
            elapsedMs: 8,
            sourceSequence: 1,
            scope: "shared",
            commandId: "shared-command",
            terminal: "rejected",
            expectedStateVersion: 7,
            resultingStateVersion: 7,
          },
        ],
        capabilities: [
          {
            elapsedMs: 7,
            sourceSequence: 1,
            capabilityId: "plotpoint.location.foreground",
            disposition: "expired",
          },
        ],
        synchronization: [
          {
            elapsedMs: 9,
            sourceSequence: 1,
            phase: "revoked",
            disposition: "membership-revoked",
          },
        ],
      }),
    );

    expect(report.shared).toEqual({ membership: "revoked" });
    expect(report.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "command", scope: "local", terminal: "no-op" }),
        expect.objectContaining({ kind: "command", scope: "shared", terminal: "rejected" }),
        expect.objectContaining({ kind: "capability", disposition: "expired" }),
      ]),
    );
    expect(report).not.toHaveProperty("version");
    expect(report).not.toHaveProperty("runId");
    expect(report).not.toHaveProperty("sessionAlias");
    expect(report).not.toHaveProperty("selfAlias");
    expect(report).not.toHaveProperty("completion");
  });

  it("admits only report-safe diagnostics", () => {
    expect(
      buildGamePlayReport(
        evidence({
          diagnostics: [
            {
              elapsedMs: 4,
              sourceSequence: 1,
              code: "runtime-mount-failed",
            },
          ],
        }),
      ).events,
    ).toContainEqual({
      kind: "diagnostic",
      elapsedMs: 4,
      code: "runtime-mount-failed",
    });
    expect(() =>
      buildGamePlayReport(
        evidence({
          diagnostics: [
            {
              elapsedMs: 4,
              sourceSequence: 1,
              code: "/private/run.db: credential=secret",
            },
          ],
        }),
      ),
    ).toThrow("report-diagnostic-code-unsafe");
  });

  it("admits only host-owned report-safe capability identifiers", () => {
    expect(() =>
      buildGamePlayReport(
        evidence({
          capabilities: [
            {
              elapsedMs: 1,
              sourceSequence: 1,
              capabilityId: "credential-secret",
              disposition: "captured",
            },
          ],
        }),
      ),
    ).toThrow("report-capability-id-unsafe");
  });

  it("redacts adversarial identities, payloads, outcomes, locations, services, and durable state", () => {
    const secrets = [
      "target-secret",
      "payload-secret",
      "outcome-secret",
      "credential-secret",
      "invitation-secret",
      "https://private.example",
      "/private/run.db",
      "37.76942",
      "-122.48621",
    ];
    const report = buildGamePlayReport(
      evidence({
        commands: [
          {
            elapsedMs: 1,
            sourceSequence: 1,
            scope: "shared",
            commandId: secrets.join("|"),
            terminal: "rejected",
            expectedStateVersion: 0,
            resultingStateVersion: 0,
            payload: { value: "payload-secret" },
            outcomeCode: "outcome-secret",
            rawState: { target: "target-secret" },
          } as GamePlayReportEvidence["commands"][number],
        ],
      }),
    );
    const serialized = JSON.stringify(report);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(
      /commandId|participant|teamId|sessionId|serviceOrigin|payload|outcome|rawState|latitude|longitude/,
    );
  });

  it("derives one run-owned report from committed local and optional shared database rows", async () => {
    const database: GamePlayReportDatabase = {
      raw: () => ({
        getFirstAsync: async <T>(query: string) => {
          if (query.includes("FROM runs")) {
            return {
              release_id: releaseId,
              started_at: "2030-01-01T00:00:00.000Z",
            } as T;
          }
          if (query.includes("FROM shared_sessions")) {
            return {
              session_id: "session-secret",
              release_id: releaseId,
              membership_status: "revoked",
            } as T;
          }
          return null;
        },
        getAllAsync: async <T>(query: string) => {
          if (query.includes("FROM command_receipts")) {
            return [
              {
                command_id: "local-secret",
                expected_state_version: 0,
                result_json: JSON.stringify({
                  commandId: "local-secret",
                  disposition: "committed",
                  terminal: "accepted",
                  resultingStateVersion: 1,
                  outcome: { value: "private-outcome" },
                }),
                resulting_state_version: 1,
                elapsed_ms: 3,
              },
            ] as T[];
          }
          if (query.includes("FROM observations")) {
            return [
              {
                observation_id: "observation-secret",
                availability: "available",
                age_ms: 15_001,
                elapsed_ms: 4,
              },
            ] as T[];
          }
          if (query.includes("FROM command_observations")) return [] as T[];
          if (query.includes("FROM run_events")) return [] as T[];
          if (query.includes("FROM shared_outbox")) return [] as T[];
          if (query.includes("FROM shared_results")) {
            return [
              {
                command_id: "shared-secret",
                terminal: "rejected",
                resulting_state_version: 2,
                expected_state_version: 2,
                observation_ids_json: JSON.stringify(["observation-secret"]),
                decision_position: "7",
                decided_at: "2030-01-01T00:00:00.006Z",
              },
            ] as T[];
          }
          if (query.includes("FROM shared_sync_events")) {
            return [
              {
                sequence: 8,
                elapsed_ms: 7,
                phase: "revoked",
                disposition: "membership-revoked",
                command_id: null,
              },
            ] as T[];
          }
          return [] as T[];
        },
      }),
    };

    const first = await createGamePlayReport(database, "run-secret", "ios");
    const second = await createGamePlayReport(database, "run-secret", "ios");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.durationMs).toBe(7);
    expect(first.shared).toEqual({ membership: "revoked" });
    expect(first.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "command", scope: "local", terminal: "accepted" }),
        expect.objectContaining({ kind: "command", scope: "shared", terminal: "rejected" }),
        expect.objectContaining({ kind: "capability", disposition: "expired" }),
      ]),
    );
    expect(JSON.stringify(first)).not.toMatch(/secret|private-outcome|decision_position/);
  });

  it("fails explicitly when the requested run is absent", async () => {
    const database: GamePlayReportDatabase = {
      raw: () => ({
        getFirstAsync: async () => null,
        getAllAsync: async <T>() => [] as T[],
      }),
    };
    await expect(createGamePlayReport(database, "missing", "android")).rejects.toThrow(
      "report-run-missing",
    );
  });
});
