import {
  createReleaseArtifact,
  verifyRelease,
  type CanonicalJsonObject,
  type CapabilityRequirement,
  type GameComposition,
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
  readonly composition: GameComposition;
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
  Object.freeze({
    name: "malformed-json",
    raw: "{",
    code: "host-invalid-json",
    requestId: "unknown",
  }),
  Object.freeze({
    name: "unsupported-version",
    raw: JSON.stringify({
      version: 2,
      requestId: "fault-version",
      type: "runtime.ready",
      payload: {},
    }),
    code: "bridge-version-unsupported",
    requestId: "fault-version",
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
    requestId: "fault-direction",
  }),
  Object.freeze({
    name: "unknown-type",
    raw: JSON.stringify({
      version: 1,
      requestId: "fault-type",
      type: "runtime.unknown",
      payload: {},
    }),
    code: "bridge-message-type-unknown",
    requestId: "fault-type",
  }),
  Object.freeze({
    name: "malformed-payload",
    raw: JSON.stringify({
      version: 1,
      requestId: "fault-payload",
      type: "runtime.ready",
      payload: { unexpected: true },
    }),
    code: "bridge-payload-fields-invalid",
    requestId: "fault-payload",
  }),
  Object.freeze({
    name: "invalid-request-id",
    raw: JSON.stringify({
      version: 1,
      requestId: "",
      type: "runtime.ready",
      payload: {},
    }),
    code: "bridge-request-id-invalid",
    requestId: "unknown",
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
}

async function createFixture(input: ReleaseFixtureInput): Promise<HostConformanceFixture> {
  const modelId = `${input.name}.player`;
  const commandDescriptorId = `${input.name}.action`;
  const commandType = `${input.name}.action`;
  const componentId = `${input.name}.panel`;
  const schemaPath = `schemas/${input.name}-player-state.schema.json`;
  const initializationSchemaId = `${input.name}.initialization`;
  const initializationSchemaPath = `schemas/${input.name}-initialization.schema.json`;
  const payloadSchemaId = `${input.name}.action-payload`;
  const payloadSchemaPath = `schemas/${input.name}-action-payload.schema.json`;
  const outcomeSchemaId = `${input.name}.action-outcome`;
  const outcomeSchemaPath = `schemas/${input.name}-action-outcome.schema.json`;
  const componentPath = `composition/components/${componentId}.json`;
  const composition = {
    application: { components: [componentId] },
    aggregateModels: [
      {
        id: modelId,
        authority: "local",
        kind: "player",
        stateSchema: { id: input.schemaId },
        initializationSchema: { id: initializationSchemaId },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: commandDescriptorId,
        type: commandType,
        aggregateModel: modelId,
        payloadSchema: { id: payloadSchemaId },
        outcomeSchema: { id: outcomeSchemaId },
        execution: "local",
      },
    ],
    progressions: [],
    components: [
      {
        id: componentId,
        commands: [commandDescriptorId],
        content: [],
        assets: [],
        capabilities: input.capabilities,
      },
    ],
    resources: [
      { id: outcomeSchemaId, role: "schema", path: outcomeSchemaPath },
      { id: payloadSchemaId, role: "schema", path: payloadSchemaPath },
      { id: initializationSchemaId, role: "schema", path: initializationSchemaPath },
      { id: componentId, role: "component-descriptor", path: componentPath },
      { id: input.schemaId, role: "schema", path: schemaPath },
    ],
  } satisfies GameComposition;
  const artifact = await createReleaseArtifact({
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [{ id: input.schemaId, kind: "player", path: schemaPath }],
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
      { path: "composition/game.json", kind: "content", value: composition },
      { path: componentPath, kind: "component-data", value: { id: componentId } },
      {
        path: initializationSchemaPath,
        kind: "command-schema",
        value: { type: "object", additionalProperties: true },
      },
      {
        path: outcomeSchemaPath,
        kind: "command-schema",
        value: { type: "object", additionalProperties: true },
      },
      {
        path: payloadSchemaPath,
        kind: "command-schema",
        value: { type: "object", additionalProperties: true },
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
  };
  return Object.freeze({
    name: input.name,
    release,
    composition,
    artifactBytes: artifact.bytes,
    bootstrap: Object.freeze({
      runId: `${input.name}-run`,
      releaseId: release.releaseId,
      aggregate: Object.freeze({
        modelId,
        ...target,
        stateVersion: 0,
        state: input.initialState,
      }),
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
          modelId,
          commandType,
          payload: {},
          target: Object.freeze(target),
          expectedStateVersion: 0,
          observationIds: Object.freeze([]),
          terminal: "accepted",
          nextState: input.nextState,
          outcome: input.outcome,
          domainEvents: Object.freeze([]),
          effectIntents: Object.freeze([]),
          progressionTrace: Object.freeze([]),
        } satisfies TransitionCandidate),
      }),
    }),
    transitionResult: Object.freeze({
      commandId,
      disposition: "committed",
      terminal: "accepted",
      resultingStateVersion: 1,
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
      initialState: { attempts: 0, visitedCheckpoints: [], puzzleSolved: false },
      nextState: {
        attempts: 0,
        visitedCheckpoints: ["first-checkpoint"],
        puzzleSolved: false,
      },
      outcome: { result: "advanced" },
    }),
    createFixture({
      name: "minimal-local-puzzle",
      schemaId: "minimal.player-state",
      aggregateId: "minimal-player",
      capabilities: [],
      initialState: { attempts: 0, solved: false },
      nextState: { attempts: 1, solved: true },
      outcome: { result: "solved" },
    }),
  ]);
}
