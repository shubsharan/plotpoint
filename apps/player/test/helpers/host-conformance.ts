import {
  createReleaseArtifact,
  verifyRelease,
  type CanonicalJsonObject,
  type CapabilityRequirement,
  type KnownReleaseMatch,
  type RuntimeBootstrap,
  type RuntimeReadyEnvelope,
  type TransitionCandidate,
  type TransitionCommitEnvelope,
  type TransitionResult,
} from "@plotpoint/protocol";

export interface HostConformanceFixture {
  readonly name: string;
  readonly release: KnownReleaseMatch;
  readonly artifactBytes: Uint8Array;
  readonly bootstrap: RuntimeBootstrap;
  readonly readyRequest: RuntimeReadyEnvelope;
  readonly transitionRequest: TransitionCommitEnvelope;
  readonly transitionResult: TransitionResult;
}

export const lifecycleFixtures = Object.freeze([
  Object.freeze({ phase: "view-created", disposition: "started" }),
  Object.freeze({ phase: "view-destroyed", disposition: "interrupted" }),
  Object.freeze({ phase: "application-restarted", disposition: "recovering" }),
  Object.freeze({ phase: "view-created", disposition: "restored" }),
]);

export const hostFaultFixtures = Object.freeze([
  Object.freeze({ name: "malformed-json", raw: "{", code: "host-invalid-json" }),
  Object.freeze({
    name: "unsupported-version",
    raw: JSON.stringify({
      version: 2,
      requestId: "fault-version",
      type: "runtime.ready",
      payload: {},
    }),
    code: "bridge-version-unsupported",
  }),
  Object.freeze({
    name: "wrong-direction",
    raw: JSON.stringify({
      version: 1,
      requestId: "fault-direction",
      type: "runtime.bootstrap",
      payload: { runId: "run", releaseId: `sha256:${"0".repeat(64)}`, aggregate: null },
    }),
    code: "bridge-direction-invalid",
  }),
]);

interface ReleaseFixtureInput {
  readonly name: string;
  readonly schemaId: string;
  readonly aggregateId: string;
  readonly capabilities: readonly CapabilityRequirement[];
  readonly initialState: CanonicalJsonObject;
  readonly nextState: CanonicalJsonObject;
  readonly outcome: CanonicalJsonObject;
  readonly progressionChanges: readonly string[];
}

async function createFixture(input: ReleaseFixtureInput): Promise<HostConformanceFixture> {
  const schemaPath = `schemas/${input.name}-player-state.schema.json`;
  const artifact = await createReleaseArtifact({
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [{ id: input.schemaId, kind: "player", version: 1, path: schemaPath }],
    capabilities: input.capabilities,
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    entries: [
      {
        path: "bundles/logic.js",
        kind: "logic-bundle",
        bytes: new TextEncoder().encode(`export default { game: ${JSON.stringify(input.name)} };`),
      },
      {
        path: "bundles/presentation.js",
        kind: "presentation-bundle",
        bytes: new TextEncoder().encode("export default { mount() {} };"),
      },
      {
        path: schemaPath,
        kind: "aggregate-schema",
        value: { type: "object", additionalProperties: true },
      },
    ],
  });
  if ("kind" in artifact) {
    throw new Error(`conformance-release-invalid:${artifact.diagnostics[0]?.code ?? "unknown"}`);
  }
  const release = await verifyRelease({
    bytes: artifact.bytes,
    expectedReleaseId: artifact.releaseId,
  });
  if (release.kind === "invalid") {
    throw new Error(`conformance-release-unverified:${release.diagnostics[0]?.code ?? "unknown"}`);
  }
  if (release.trust !== "known-release-match") {
    throw new Error("conformance-release-identity-unverified");
  }

  const commandId = `${input.name}-command`;
  const target = {
    aggregateId: input.aggregateId,
    aggregateKind: "player" as const,
    schemaId: input.schemaId,
    schemaVersion: 1,
  };
  return Object.freeze({
    name: input.name,
    release,
    artifactBytes: artifact.bytes,
    bootstrap: Object.freeze({
      runId: `${input.name}-run`,
      releaseId: release.releaseId,
      aggregate: Object.freeze({ ...target, stateVersion: 0, state: input.initialState }),
    }),
    readyRequest: Object.freeze({
      version: 1,
      requestId: `${input.name}-ready`,
      type: "runtime.ready",
      payload: Object.freeze({}),
    }),
    transitionRequest: Object.freeze({
      version: 1,
      requestId: `${input.name}-transition`,
      type: "transition.commit",
      payload: Object.freeze({
        candidate: Object.freeze({
          commandId,
          target: Object.freeze(target),
          expectedVersion: 0,
          observationIds: Object.freeze([]),
          terminal: "accepted",
          nextState: input.nextState,
          outcome: input.outcome,
          progressionChanges: input.progressionChanges,
        } satisfies TransitionCandidate),
      }),
    }),
    transitionResult: Object.freeze({
      commandId,
      disposition: "committed",
      terminal: "accepted",
      resultingVersion: 1,
      outcome: input.outcome,
    }),
  });
}

export async function createHostConformanceFixtures(): Promise<readonly HostConformanceFixture[]> {
  return Promise.all([
    createFixture({
      name: "field-puzzle",
      schemaId: "field.player-state",
      aggregateId: "field-player",
      capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
      initialState: { attempts: 0, phase: "first-checkpoint" },
      nextState: { attempts: 0, phase: "puzzle" },
      outcome: { result: "advanced" },
      progressionChanges: ["puzzle"],
    }),
    createFixture({
      name: "minimal-local-puzzle",
      schemaId: "minimal.player-state",
      aggregateId: "minimal-player",
      capabilities: [],
      initialState: { attempts: 0, solved: false },
      nextState: { attempts: 1, solved: true },
      outcome: { result: "solved" },
      progressionChanges: ["complete"],
    }),
  ]);
}
