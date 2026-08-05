import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  assessCompatibility,
  type CapabilityResultV1,
  type HostToWebBridgeEnvelope,
} from "@plotpoint/protocol";

import { routeHostBridgeMessage, type HostBridgeHandlers } from "../src/bridge/host-bridge";
import { installReleaseFromDescriptor } from "../src/install/install-release";
import type { DurableTransitionResult } from "../src/model";
import { buildPlayReport } from "../src/reports/create-play-report";
import { deriveHostSupportFromManifest } from "../src/runtime/host-support";
import { validateRecoveryRecords } from "../src/runtime/recovery";
import {
  createHostConformanceFixtures,
  hostFaultFixtures,
  type HostConformanceFixture,
} from "./helpers/host-conformance";

function handlersFor(fixture: HostConformanceFixture): HostBridgeHandlers {
  return {
    runtimeReady: async () => fixture.bootstrap,
    commitTransition: async (payload) => {
      expect(payload).toEqual(fixture.transitionRequest.payload);
      return fixture.transitionResult;
    },
    requestCapability: async () => {
      throw new Error("unexpected-capability-request") as never as CapabilityResultV1;
    },
  };
}

async function exerciseHostApi(fixture: HostConformanceFixture) {
  const compatibility = assessCompatibility(
    fixture.release.manifest,
    deriveHostSupportFromManifest(fixture.release.manifest),
  );
  expect(compatibility).toEqual({ kind: "compatible" });

  const ready = await routeHostBridgeMessage(
    JSON.stringify(fixture.readyRequest),
    handlersFor(fixture),
  );
  expect(ready).toEqual({
    version: 1,
    requestId: fixture.readyRequest.requestId,
    type: "runtime.bootstrap",
    payload: fixture.bootstrap,
  });

  const transition = await routeHostBridgeMessage(
    JSON.stringify(fixture.transitionRequest),
    handlersFor(fixture),
  );
  expect(transition).toEqual({
    version: 1,
    requestId: fixture.transitionRequest.requestId,
    type: "transition.result",
    payload: fixture.transitionResult,
  });
}

describe("Host API V1 release conformance", () => {
  let fixtures: readonly HostConformanceFixture[];

  beforeAll(async () => {
    fixtures = await createHostConformanceFixtures();
  });

  it("runs materially different field and minimal releases through one branch-free harness", async () => {
    expect(fixtures.map(({ name }) => name)).toEqual(["field-puzzle", "minimal-local-puzzle"]);
    expect(fixtures[0]?.release.releaseId).not.toBe(fixtures[1]?.release.releaseId);
    expect(fixtures[0]?.release.manifest.aggregateSchemas).not.toEqual(
      fixtures[1]?.release.manifest.aggregateSchemas,
    );

    await Promise.all(fixtures.map(exerciseHostApi));
  });

  it("carries both releases through install, recovery, and report surfaces", async () => {
    for (const [index, fixture] of fixtures.entries()) {
      const descriptorUrl = `http://127.0.0.1:410${index}/install.json`;
      const releaseUrl = `http://127.0.0.1:410${index}/release.pprelease`;
      const publish = vi.fn(async () => undefined);
      await expect(
        installReleaseFromDescriptor({
          descriptorUrl,
          support: deriveHostSupportFromManifest,
          transport: {
            fetchJson: async () => ({
              finalUrl: descriptorUrl,
              value: {
                version: 1,
                releaseUrl,
                expectedReleaseId: fixture.release.releaseId,
              },
            }),
            fetchBytes: async () => ({ finalUrl: releaseUrl, bytes: fixture.artifactBytes }),
          },
          publisher: { publish },
        }),
      ).resolves.toMatchObject({
        kind: "installed",
        descriptor: { expectedReleaseId: fixture.release.releaseId },
      });
      expect(publish).toHaveBeenCalledOnce();

      const candidate = fixture.transitionRequest.payload.candidate;
      if (candidate.terminal !== "accepted") throw new Error("fixture-terminal-invalid");
      const durableResult = {
        kind: "accepted",
        commandId: candidate.commandId,
        commandOutcome: "accepted",
        aggregateId: candidate.target.aggregateId,
        aggregateKind: candidate.target.aggregateKind,
        schemaId: candidate.target.schemaId,
        schemaVersion: candidate.target.schemaVersion,
        expectedVersion: candidate.expectedVersion,
        resultingVersion: candidate.expectedVersion + 1,
        outcome: candidate.outcome,
        observationIds: candidate.observationIds,
      } satisfies DurableTransitionResult;
      expect(
        validateRecoveryRecords(
          fixture.release.manifest,
          {
            snapshot: {
              aggregate_id: candidate.target.aggregateId,
              aggregate_kind: candidate.target.aggregateKind,
              schema_id: candidate.target.schemaId,
              schema_version: candidate.target.schemaVersion,
              state_version: 1,
              state_json: JSON.stringify(candidate.nextState),
              journal_position: 1,
            },
            journals: [
              {
                sequence: 1,
                command_id: candidate.commandId,
                outcome_json: JSON.stringify(candidate.outcome),
                progression_json: JSON.stringify(candidate.progressionChanges),
              },
            ],
            receipts: [
              {
                command_id: candidate.commandId,
                expected_version: 0,
                resulting_version: 1,
                result_json: JSON.stringify(durableResult),
              },
            ],
            observationLinks: [],
          },
          () => true,
        ),
      ).toMatchObject({ kind: "valid", aggregate: { stateVersion: 1 } });

      expect(
        buildPlayReport({
          releaseId: fixture.release.releaseId,
          runId: `${fixture.name}-run`,
          platform: "ios",
          startedAtMs: 1_000,
          endedAtMs: 2_000,
          commands: [{ result: durableResult, elapsedMs: 1_500 }],
          journals: [
            {
              sequence: 1,
              commandId: candidate.commandId,
              progressionChanges: candidate.progressionChanges,
            },
          ],
          capabilities: [],
          observationLinks: [],
          runEvents: [],
        }),
      ).toMatchObject({
        releaseId: fixture.release.releaseId,
        events: [{ kind: "command", terminal: "accepted", resultingVersion: 1 }],
      });
    }
  });

  it("keeps unimplemented manifest capabilities incompatible", async () => {
    const fixture = fixtures[1];
    if (fixture === undefined) throw new Error("minimal-conformance-fixture-missing");
    const manifest = {
      ...fixture.release.manifest,
      capabilities: [{ id: "plotpoint.camera.capture", major: 1, minimumMinor: 0 }],
    };

    expect(assessCompatibility(manifest, deriveHostSupportFromManifest(manifest))).toMatchObject({
      kind: "incompatible",
      diagnostics: [{ code: "capability-unsupported" }],
    });
  });

  it("advertises the game-neutral Host API 1.1 shared-play extension", () => {
    const fixture = fixtures[0];
    if (fixture === undefined) throw new Error("field-conformance-fixture-missing");
    const manifest = { ...fixture.release.manifest, hostApi: { major: 1, minimumMinor: 1 } };
    expect(assessCompatibility(manifest, deriveHostSupportFromManifest(manifest))).toEqual({
      kind: "compatible",
    });
  });

  it.each(hostFaultFixtures)("returns the declared error for $name", async ({ raw, code }) => {
    const fixture = fixtures[0];
    if (fixture === undefined) throw new Error("field-conformance-fixture-missing");
    const result: HostToWebBridgeEnvelope = await routeHostBridgeMessage(raw, handlersFor(fixture));
    expect(result.type).toBe("host.error");
    expect(result.payload).toMatchObject({ code });
  });
});
