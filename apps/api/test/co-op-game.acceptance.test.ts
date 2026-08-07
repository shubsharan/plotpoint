import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresPool, migrateAuthoritativeHunt, type PostgresPool } from "@plotpoint/db";
import { TARGET_DISCOVERY_COMMAND, TARGET_DISCOVERY_STATE_SCHEMA } from "@plotpoint/modules";
import {
  inspectGameRelease,
  isReleaseId,
  isGamePlayReport,
  isSharedJoinResponse,
  isSyncCommand,
  isSyncCommandResult,
  isSyncPull,
  openRelease,
  type SharedJoinResponse,
  type SyncCommand,
  type SyncCommandResult,
  type SyncPull,
} from "@plotpoint/protocol";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { compileProject } from "../../../packages/compiler/dist/index.js";
import { createSecret } from "../src/security.js";
import { createApiServer } from "../src/server.js";
import { SharedSessionService } from "../src/shared-session-service.js";

interface PlayerAcceptanceDatabase {
  execAsync(query: string): Promise<void>;
  runAsync(query: string, ...parameters: unknown[]): Promise<unknown>;
  close(): void;
}

interface PlayerAcceptanceStore {
  enqueue(sessionId: string, command: object, enqueuedAt: string): Promise<unknown>;
  applyPull(context: object, pull: SyncPull): Promise<void>;
}

interface PlayerAcceptanceController {
  start(): Promise<void>;
  join(input: { serviceUrl: string; sessionId: string; invitation: string }): Promise<void>;
  enqueue(command: object): Promise<unknown>;
  retry(): Promise<void>;
  snapshot(): Readonly<Record<string, unknown>>;
  subscribe(listener: (state: Readonly<Record<string, unknown>>) => void): () => void;
  dispose(): void;
}

interface GeneratedRuntimeNode {
  readonly dataset: Readonly<Record<string, string>>;
  readonly children: readonly GeneratedRuntimeNode[];
  readonly textContent: string | null;
  dispatchEvent(type: string): Promise<void>;
}

interface MountedGeneratedRuntime {
  readonly root: GeneratedRuntimeNode;
  dispatchHostEvent(detail: unknown): void;
  unmount(): Promise<void>;
}

async function loadPlayerAcceptance() {
  const reportUrl = new URL("../../player/src/reports/create-game-play-report.ts", import.meta.url)
    .href;
  const databaseUrl = new URL("../../player/src/shared/database.ts", import.meta.url).href;
  const persistenceUrl = new URL(
    "../../player/src/persistence/record-location-observation.ts",
    import.meta.url,
  ).href;
  const sqliteUrl = new URL("../../player/test/helpers/shared-sqlite.ts", import.meta.url).href;
  const controllerUrl = new URL("../../player/src/shared/session-controller.ts", import.meta.url)
    .href;
  const coordinatorUrl = new URL("../../player/src/shared/sync-coordinator.ts", import.meta.url)
    .href;
  const runtimeUrl = new URL("../../player/src/runtime/bootstrap.ts", import.meta.url).href;
  const runtimeHarnessUrl = new URL(
    "../../player/test/helpers/generated-web-runtime.ts",
    import.meta.url,
  ).href;
  const hostBridgeUrl = new URL("../../player/src/bridge/host-bridge.ts", import.meta.url).href;
  const productionHandlersUrl = new URL(
    "../../player/src/runtime/production-handlers.ts",
    import.meta.url,
  ).href;
  const sharedBridgeUrl = new URL("../../player/src/shared/host-bridge.ts", import.meta.url).href;
  const [
    reportModule,
    databaseModule,
    persistenceModule,
    sqliteModule,
    controllerModule,
    coordinatorModule,
    runtimeModule,
    runtimeHarnessModule,
    hostBridgeModule,
    productionHandlersModule,
    sharedBridgeModule,
  ]: unknown[] = await Promise.all([
    import(reportUrl),
    import(databaseUrl),
    import(persistenceUrl),
    import(sqliteUrl),
    import(controllerUrl),
    import(coordinatorUrl),
    import(runtimeUrl),
    import(runtimeHarnessUrl),
    import(hostBridgeUrl),
    import(productionHandlersUrl),
    import(sharedBridgeUrl),
  ]);
  if (
    !isObject(reportModule) ||
    typeof reportModule.createGamePlayReport !== "function" ||
    !isObject(databaseModule) ||
    typeof databaseModule.SharedSyncStore !== "function" ||
    !isObject(persistenceModule) ||
    typeof persistenceModule.recordLocationObservation !== "function" ||
    !isObject(sqliteModule) ||
    typeof sqliteModule.createSharedTestDatabase !== "function" ||
    !isObject(controllerModule) ||
    typeof controllerModule.SharedPlayController !== "function" ||
    !isObject(coordinatorModule) ||
    typeof coordinatorModule.SharedSyncCoordinator !== "function" ||
    !isObject(runtimeModule) ||
    typeof runtimeModule.buildRuntimeBootstrap !== "function" ||
    !isObject(runtimeHarnessModule) ||
    typeof runtimeHarnessModule.mountGeneratedWebRuntime !== "function" ||
    !isObject(hostBridgeModule) ||
    typeof hostBridgeModule.routeHostBridgeMessage !== "function" ||
    !isObject(productionHandlersModule) ||
    typeof productionHandlersModule.createProductionHostBridgeHandlers !== "function" ||
    !isObject(sharedBridgeModule) ||
    typeof sharedBridgeModule.routeSharedBridgeMessage !== "function" ||
    typeof sharedBridgeModule.createCompositionSharedBridgeHandlers !== "function"
  ) {
    throw new Error("co-op-player-acceptance-module-invalid");
  }
  return {
    createGamePlayReport: reportModule.createGamePlayReport as (
      database: object,
      runId: string,
      platform: "ios" | "android",
    ) => Promise<unknown>,
    recordLocationObservation: persistenceModule.recordLocationObservation as (
      database: object,
      input: Readonly<Record<string, unknown>>,
    ) => Promise<void>,
    SharedSyncStore: databaseModule.SharedSyncStore as new (
      database: PlayerAcceptanceDatabase,
      projectionRule: {
        readonly aggregateKind: "team";
        readonly schemaId: string;
        validate(value: Readonly<Record<string, unknown>>): boolean;
      },
    ) => PlayerAcceptanceStore,
    createSharedTestDatabase: sqliteModule.createSharedTestDatabase as (
      runId: string,
      releaseId: `sha256:${string}`,
    ) => Promise<PlayerAcceptanceDatabase>,
    SharedSyncCoordinator: coordinatorModule.SharedSyncCoordinator as new (
      store: PlayerAcceptanceStore,
      credentials: object,
    ) => { request(sessionId: string, trigger: string): Promise<void> },
    SharedPlayController: controllerModule.SharedPlayController as new (
      context: object,
      store: PlayerAcceptanceStore,
      credentials: object,
      scheduler: object,
    ) => PlayerAcceptanceController,
    buildRuntimeBootstrap: runtimeModule.buildRuntimeBootstrap as (input: object) => string,
    mountGeneratedWebRuntime: runtimeHarnessModule.mountGeneratedWebRuntime as (
      html: string,
      routeMessage: (message: string) => Promise<unknown>,
    ) => Promise<MountedGeneratedRuntime>,
    routeHostBridgeMessage: hostBridgeModule.routeHostBridgeMessage as (
      message: string,
      handlers: object,
    ) => Promise<unknown>,
    createProductionHostBridgeHandlers:
      productionHandlersModule.createProductionHostBridgeHandlers as (input: object) => object,
    createCompositionSharedBridgeHandlers:
      sharedBridgeModule.createCompositionSharedBridgeHandlers as (input: object) => object,
    routeSharedBridgeMessage: sharedBridgeModule.routeSharedBridgeMessage as (
      message: string,
      handlers: object,
    ) => Promise<unknown>,
  };
}

const PARTICIPANTS = ["participant-one", "participant-two", "participant-three"] as const;
const REVISED_MAXIMUM_AGE_MS = 30_000;
const OPERATOR_TOKEN = "operator-token";

const playerProjectionRule = {
  aggregateKind: "team" as const,
  schemaId: "plotpoint.location.team-projection",
  validate(value: Readonly<Record<string, unknown>>): boolean {
    return (
      typeof value.complete === "boolean" &&
      Number.isSafeInteger(value.completedTargets) &&
      Array.isArray(value.targets)
    );
  },
};

interface Target {
  readonly targetId: string;
  readonly prompt: string;
  readonly zone: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly maximumAgeMs: number;
  readonly maximumAccuracyMeters: number;
}

interface TargetConfiguration {
  readonly targets: readonly Target[];
}

interface CreatedSession {
  readonly sessionId: string;
  readonly teamId: string;
  readonly releaseId: `sha256:${string}`;
  readonly disposition: "created" | "duplicate";
}

interface CreatedInvitation {
  readonly invitationId: string;
  readonly invitation: string;
  readonly expiresAt: string;
}

interface JoinedParticipant {
  readonly label: (typeof PARTICIPANTS)[number];
  readonly credential: string;
  readonly response: SharedJoinResponse;
}

interface QueuedCommand {
  readonly participantIndex: number;
  readonly command: SyncCommand;
}

let container: StartedPostgreSqlContainer | undefined;
let pool: PostgresPool | undefined;
let server: ReturnType<typeof createApiServer> | undefined;
let origin = "";
let temporaryRoot = "";
let firstReleaseId: `sha256:${string}`;
let revisedReleaseId: `sha256:${string}`;
let configuration: TargetConfiguration;
let revisedConfiguration: TargetConfiguration;
let revisedReleaseBytes: Uint8Array;

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findRuntimeNode(
  root: GeneratedRuntimeNode,
  predicate: (node: GeneratedRuntimeNode) => boolean,
): GeneratedRuntimeNode | undefined {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const match = findRuntimeNode(child, predicate);
    if (match !== undefined) return match;
  }
  return undefined;
}

function isTarget(value: unknown): value is Target {
  return (
    isObject(value) &&
    typeof value.targetId === "string" &&
    typeof value.prompt === "string" &&
    typeof value.zone === "string" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.radiusMeters === "number" &&
    typeof value.maximumAgeMs === "number" &&
    typeof value.maximumAccuracyMeters === "number"
  );
}

function targetConfiguration(value: unknown): TargetConfiguration {
  if (!isObject(value) || !Array.isArray(value.targets) || !value.targets.every(isTarget)) {
    throw new Error("co-op-target-configuration-invalid");
  }
  return { targets: value.targets };
}

function createdSession(value: unknown): CreatedSession {
  if (
    !isObject(value) ||
    typeof value.sessionId !== "string" ||
    typeof value.teamId !== "string" ||
    typeof value.releaseId !== "string" ||
    !isReleaseId(value.releaseId) ||
    (value.disposition !== "created" && value.disposition !== "duplicate")
  ) {
    throw new Error("co-op-session-response-invalid");
  }
  return {
    sessionId: value.sessionId,
    teamId: value.teamId,
    releaseId: value.releaseId,
    disposition: value.disposition,
  };
}

function createdInvitation(value: unknown): CreatedInvitation {
  if (
    !isObject(value) ||
    typeof value.invitationId !== "string" ||
    typeof value.invitation !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    throw new Error("co-op-invitation-response-invalid");
  }
  return {
    invitationId: value.invitationId,
    invitation: value.invitation,
    expiresAt: value.expiresAt,
  };
}

function sharedJoin(value: unknown): SharedJoinResponse {
  if (!isSharedJoinResponse(value)) throw new Error("co-op-join-response-invalid");
  return value;
}

function commandResult(value: unknown): SyncCommandResult {
  if (!isSyncCommandResult(value)) throw new Error("co-op-command-response-invalid");
  return value;
}

function syncPull(value: unknown): SyncPull {
  if (!isSyncPull(value)) throw new Error("co-op-sync-response-invalid");
  return value;
}

async function responseJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`co-op-api-request-failed:${response.status}:${JSON.stringify(value)}`);
  }
  return value;
}

function operatorPost(path: string, input: object): Promise<unknown> {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPERATOR_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  }).then(responseJson);
}

function participantPost(path: string, credential: string | undefined, input: object) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      ...(credential === undefined ? {} : { authorization: `Bearer ${credential}` }),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  }).then(responseJson);
}

async function registerRelease(bytes: Uint8Array, releaseId: `sha256:${string}`): Promise<void> {
  const value = await responseJson(
    await fetch(`${origin}/v1/releases`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPERATOR_TOKEN}`,
        "content-type": "application/vnd.plotpoint.release",
        "x-plotpoint-expected-release-id": releaseId,
      },
      body: Buffer.from(bytes),
    }),
  );
  expect(value).toMatchObject({ releaseId });
}

async function createJourneySession(
  releaseId: `sha256:${string}`,
  creationId: string,
): Promise<{
  readonly session: CreatedSession;
  readonly participants: readonly JoinedParticipant[];
}> {
  const session = createdSession(
    await operatorPost("/v1/shared-sessions", {
      creationId,
      releaseId,
      teamLabel: "Co-op acceptance",
    }),
  );
  const invitations = await Promise.all(
    PARTICIPANTS.map((label) =>
      operatorPost(`/v1/shared-sessions/${session.sessionId}/invitations`, {
        invitationId: `${creationId}-${label}`,
        expiresAt: "2031-01-01T00:00:00.000Z",
      }).then(createdInvitation),
    ),
  );
  const credentials = PARTICIPANTS.map(() => createSecret());
  const participants = await Promise.all(
    PARTICIPANTS.map(async (label, index): Promise<JoinedParticipant> => {
      const invitation = invitations[index];
      const credential = credentials[index];
      if (invitation === undefined || credential === undefined) {
        throw new Error("co-op-participant-fixture-invalid");
      }
      const response = sharedJoin(
        await participantPost(`/v1/shared-sessions/${session.sessionId}/participants`, undefined, {
          joinRequestId: `${creationId}-join-${index + 1}`,
          expectedReleaseId: releaseId,
          invitation: invitation.invitation,
          participantCredential: credential,
        }),
      );
      expect(response).toMatchObject({
        releaseId,
        teamId: session.teamId,
        disposition: "joined",
      });
      return { label, credential, response };
    }),
  );
  expect(new Set(participants.map(({ response }) => response.participantId))).toHaveLength(3);
  return { session, participants };
}

function observation(target: Target, ageMs: number, observationId: string) {
  return {
    observationId,
    recordedAt: "2030-01-01T00:00:01.000Z",
    capturedAt: "2030-01-01T00:00:00.000Z",
    ageMs,
    availability: "available" as const,
    latitude: target.latitude,
    longitude: target.longitude,
    horizontalAccuracy: Math.min(5, target.maximumAccuracyMeters),
  };
}

function discoveryCommand(input: {
  readonly session: CreatedSession;
  readonly target: Target;
  readonly commandId: string;
  readonly expectedStateVersion: number;
  readonly ageMs: number;
}): SyncCommand {
  return {
    commandId: input.commandId,
    target: {
      aggregateKind: "team",
      aggregateId: input.session.teamId,
      schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
    },
    expectedStateVersion: input.expectedStateVersion,
    type: TARGET_DISCOVERY_COMMAND,
    payload: { targetId: input.target.targetId },
    observations: [observation(input.target, input.ageMs, `observation-${input.commandId}`)],
  };
}

function recoverQueue(serialized: string): readonly QueuedCommand[] {
  const value: unknown = JSON.parse(serialized);
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry) =>
        isObject(entry) &&
        Number.isSafeInteger(entry.participantIndex) &&
        isSyncCommand(entry.command),
    )
  ) {
    throw new Error("co-op-durable-queue-invalid");
  }
  return value.map((entry) => ({
    participantIndex: Number(entry.participantIndex),
    command: entry.command,
  }));
}

async function submitQueued(
  session: CreatedSession,
  participants: readonly JoinedParticipant[],
  queued: QueuedCommand,
): Promise<SyncCommandResult> {
  const participant = participants[queued.participantIndex];
  if (participant === undefined) throw new Error("co-op-queued-participant-missing");
  return commandResult(
    await participantPost(
      `/v1/shared-sessions/${session.sessionId}/commands`,
      participant.credential,
      queued.command,
    ),
  );
}

async function pull(session: CreatedSession, participant: JoinedParticipant): Promise<SyncPull> {
  return syncPull(
    await responseJson(
      await fetch(`${origin}/v1/shared-sessions/${session.sessionId}/sync?after=0`, {
        headers: { authorization: `Bearer ${participant.credential}` },
      }),
    ),
  );
}

async function copyProject(projectRoot: string, destination: string): Promise<void> {
  await Promise.all(
    ["assets", "content", "schemas", "src"].map((directory) =>
      cp(join(projectRoot, directory), join(destination, directory), { recursive: true }),
    ),
  );
  await Promise.all(
    ["package.json", "plotpoint.project.json", "tsconfig.json"].map((file) =>
      cp(join(projectRoot, file), join(destination, file)),
    ),
  );
  await symlink(join(projectRoot, "node_modules"), join(destination, "node_modules"), "dir");
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "plotpoint-co-op-acceptance-"));
  const projectRoot = new URL("../../../examples/releases/co-op-game/", import.meta.url).pathname;
  const revisedProjectRoot = join(temporaryRoot, "revised-project");
  const firstOutput = join(temporaryRoot, "first.pprelease");
  const revisedOutput = join(temporaryRoot, "revised.pprelease");
  configuration = targetConfiguration(
    JSON.parse(await readFile(join(projectRoot, "content", "targets.json"), "utf8")),
  );
  revisedConfiguration = {
    targets: configuration.targets.map((target) => ({
      ...target,
      maximumAgeMs: REVISED_MAXIMUM_AGE_MS,
    })),
  };
  await copyProject(projectRoot, revisedProjectRoot);
  await writeFile(
    join(revisedProjectRoot, "content", "targets.json"),
    `${JSON.stringify(revisedConfiguration, null, 2)}\n`,
  );

  const first = await compileProject({ projectRoot, outputFile: firstOutput });
  const revised = await compileProject({
    projectRoot: revisedProjectRoot,
    outputFile: revisedOutput,
  });
  if (first.kind !== "compiled" || revised.kind !== "compiled") {
    throw new Error(`co-op-acceptance-compilation-failed:${JSON.stringify({ first, revised })}`);
  }
  firstReleaseId = first.releaseId;
  revisedReleaseId = revised.releaseId;
  if (firstReleaseId === revisedReleaseId) throw new Error("co-op-revision-release-not-distinct");

  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  pool = createPostgresPool({ connectionString: container.getConnectionUri() });
  await migrateAuthoritativeHunt(pool);
  const service = new SharedSessionService(pool, "acceptance-pepper-with-sufficient-length");
  server = createApiServer(service, { operatorToken: OPERATOR_TOKEN });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("co-op-address-invalid");
  origin = `http://127.0.0.1:${address.port}`;
  await registerRelease(await readFile(firstOutput), firstReleaseId);
  revisedReleaseBytes = await readFile(revisedOutput);
  await registerRelease(revisedReleaseBytes, revisedReleaseId);
}, 120_000);

afterAll(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
  await pool?.end();
  await container?.stop();
  if (temporaryRoot.length > 0) await rm(temporaryRoot, { recursive: true, force: true });
});

describe("co-op game acceptance", () => {
  it("completes every configured target with three participants across restart and a fresh release", async () => {
    expect(configuration.targets).toHaveLength(PARTICIPANTS.length);
    const first = await createJourneySession(firstReleaseId, "co-op-first-session");

    const firstTarget = configuration.targets[0];
    if (firstTarget === undefined) throw new Error("co-op-first-target-missing");
    const staleCommand = discoveryCommand({
      session: first.session,
      target: firstTarget,
      commandId: "first-expired-observation",
      expectedStateVersion: 0,
      ageMs: firstTarget.maximumAgeMs + 1,
    });
    const rejected = await submitQueued(first.session, first.participants, {
      participantIndex: 0,
      command: staleCommand,
    });
    expect(rejected).toMatchObject({
      terminal: "rejected",
      outcomeCode: "location-stale",
      resultingStateVersion: 0,
    });

    const player = await loadPlayerAcceptance();
    const playerDatabase = await player.createSharedTestDatabase(
      "co-op-report-run",
      firstReleaseId,
    );
    const reportParticipant = first.participants[0];
    if (reportParticipant === undefined) throw new Error("co-op-report-participant-missing");
    try {
      await playerDatabase.runAsync(
        `INSERT INTO shared_sessions
         (session_id,run_id,release_id,participant_id,team_id,service_origin,envelope_key,
          membership_status,transport_status,sync_status,cursor,confirmed_at)
         VALUES (?,?,?,?,?,?,?,'active','online','current','0',?)`,
        first.session.sessionId,
        "co-op-report-run",
        firstReleaseId,
        reportParticipant.response.participantId,
        first.session.teamId,
        origin,
        "co-op-report-envelope",
        "2030-01-01T00:00:00.000Z",
      );
      const playerStore = new player.SharedSyncStore(playerDatabase, playerProjectionRule);
      await playerStore.enqueue(
        first.session.sessionId,
        {
          commandId: staleCommand.commandId,
          target: staleCommand.target,
          expectedStateVersion: staleCommand.expectedStateVersion,
          type: staleCommand.type,
          payload: staleCommand.payload,
          observationIds: staleCommand.observations.map(({ observationId }) => observationId),
        },
        "2030-01-01T00:00:00.001Z",
      );
      const committedPull = await pull(first.session, reportParticipant);
      await playerStore.applyPull(
        {
          sessionId: first.session.sessionId,
          runId: "co-op-report-run",
          releaseId: firstReleaseId,
          participantId: reportParticipant.response.participantId,
          teamId: first.session.teamId,
          serviceOrigin: origin,
          envelopeKey: "co-op-report-envelope",
        },
        committedPull,
      );
      const reportValue = await player.createGamePlayReport(
        { raw: () => playerDatabase },
        "co-op-report-run",
        "ios",
      );
      if (!isGamePlayReport(reportValue)) throw new Error("co-op-game-play-report-invalid");
      const report = reportValue;
      expect(report.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "command",
            scope: "shared",
            commandAlias: "command-001",
            terminal: "rejected",
          }),
          expect.objectContaining({ kind: "capability", disposition: "expired" }),
        ]),
      );
      const serializedReport = JSON.stringify(report);
      expect(serializedReport).not.toMatch(
        /ferry-building|rincon-park|south-park|latitude|longitude|payload|outcomeCode|maximumAgeMs|serviceOrigin|session-|participant-|team-/,
      );
      expect(serializedReport).not.toContain(staleCommand.commandId);
      expect(serializedReport).not.toContain(rejected.outcomeCode);
      expect(serializedReport).not.toContain(String(firstTarget.maximumAgeMs));
      expect(serializedReport).not.toContain(String(firstTarget.latitude));
      expect(serializedReport).not.toContain(String(firstTarget.longitude));
      expect(serializedReport).not.toContain(first.session.sessionId);
      expect(serializedReport).not.toContain(first.session.teamId);
      expect(serializedReport).not.toContain(origin);
      for (const participant of first.participants) {
        expect(serializedReport).not.toContain(participant.response.participantId);
        expect(serializedReport).not.toContain(participant.credential);
      }
    } finally {
      playerDatabase.close();
    }

    const queued: readonly QueuedCommand[] = configuration.targets.map((target, index) => ({
      participantIndex: index,
      command: discoveryCommand({
        session: first.session,
        target,
        commandId: `first-discovery-${index + 1}`,
        expectedStateVersion: index,
        ageMs: 1_000,
      }),
    }));
    const durableQueue = JSON.stringify(queued);

    // The first response is intentionally lost before any pull or local dequeue. A restarted
    // foreground pass restores the same serialized request and receives the exact terminal.
    const initialQueue = recoverQueue(durableQueue);
    const firstAttempt = initialQueue[0];
    if (firstAttempt === undefined) throw new Error("co-op-first-queued-command-missing");
    await submitQueued(first.session, first.participants, firstAttempt);
    const restartedQueue = recoverQueue(durableQueue);
    const restartedFirst = restartedQueue[0];
    if (restartedFirst === undefined) throw new Error("co-op-restarted-command-missing");
    const retried = await submitQueued(first.session, first.participants, restartedFirst);
    expect(retried).toMatchObject({
      disposition: "decided",
      terminal: "accepted",
      outcomeCode: "target-discovered",
      resultingStateVersion: 1,
    });
    for (const pending of restartedQueue.slice(1)) {
      await expect(submitQueued(first.session, first.participants, pending)).resolves.toMatchObject(
        {
          disposition: "decided",
          terminal: "accepted",
          outcomeCode: "target-discovered",
        },
      );
    }

    const firstParticipant = first.participants[0];
    if (firstParticipant === undefined) throw new Error("co-op-first-participant-missing");
    const firstPull = await pull(first.session, firstParticipant);
    expect(firstPull.snapshot).toMatchObject({
      releaseId: firstReleaseId,
      sessionId: first.session.sessionId,
      teamId: first.session.teamId,
      projections: [
        expect.objectContaining({
          schemaId: "plotpoint.location.team-projection",
          stateVersion: configuration.targets.length,
          value: expect.objectContaining({
            complete: true,
            completedTargets: configuration.targets.length,
            targets: configuration.targets.map(({ targetId }) => ({
              targetId,
              status: "discovered",
            })),
          }),
        }),
      ],
    });

    expect(revisedReleaseId).not.toBe(firstReleaseId);
    expect(revisedConfiguration.targets.map(({ maximumAgeMs }) => maximumAgeMs)).toEqual(
      configuration.targets.map(() => REVISED_MAXIMUM_AGE_MS),
    );
    const revised = await createJourneySession(revisedReleaseId, "co-op-revised-session");
    expect(revised.session).toMatchObject({ releaseId: revisedReleaseId, disposition: "created" });
    expect(revised.session.sessionId).not.toBe(first.session.sessionId);
    expect(revised.session.teamId).not.toBe(first.session.teamId);

    for (const [index, target] of revisedConfiguration.targets.entries()) {
      await expect(
        submitQueued(revised.session, revised.participants, {
          participantIndex: index,
          command: discoveryCommand({
            session: revised.session,
            target,
            commandId: `revised-discovery-${index + 1}`,
            expectedStateVersion: index,
            ageMs: 20_000,
          }),
        }),
      ).resolves.toMatchObject({ terminal: "accepted", outcomeCode: "target-discovered" });
    }
    const revisedParticipant = revised.participants[2];
    if (revisedParticipant === undefined) throw new Error("co-op-revised-participant-missing");
    const revisedPull = await pull(revised.session, revisedParticipant);
    expect(revisedPull.snapshot).toMatchObject({
      releaseId: revisedReleaseId,
      sessionId: revised.session.sessionId,
      teamId: revised.session.teamId,
      projections: [
        expect.objectContaining({
          stateVersion: revisedConfiguration.targets.length,
          value: expect.objectContaining({
            complete: true,
            completedTargets: revisedConfiguration.targets.length,
          }),
        }),
      ],
    });

    const controllerSession = createdSession(
      await operatorPost("/v1/shared-sessions", {
        creationId: "co-op-controller-session",
        releaseId: revisedReleaseId,
        teamLabel: "Installed controller acceptance",
      }),
    );
    const controllerInvitation = createdInvitation(
      await operatorPost(`/v1/shared-sessions/${controllerSession.sessionId}/invitations`, {
        invitationId: "co-op-controller-invitation",
        expiresAt: "2031-01-01T00:00:00.000Z",
      }),
    );
    const controllerDatabase = await player.createSharedTestDatabase(
      "co-op-controller-run",
      revisedReleaseId,
    );
    const envelopes = new Map<string, unknown>();
    const controllerCredential = createSecret();
    const credentials = {
      generateJoinRequestId: () => "co-op-controller-join",
      generateCredential: () => controllerCredential,
      putEnvelope: async (key: string, value: unknown) => void envelopes.set(key, value),
      getEnvelope: async (key: string) => envelopes.get(key) ?? null,
      removeEnvelope: async (key: string) => void envelopes.delete(key),
    };
    try {
      await controllerDatabase.execAsync(`
        CREATE TABLE observations (
          run_id TEXT NOT NULL, observation_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
          captured_at TEXT NOT NULL, sensor_captured_at TEXT, age_ms INTEGER,
          availability TEXT NOT NULL, latitude REAL, longitude REAL, horizontal_accuracy REAL,
          diagnostic_code TEXT, elapsed_ms INTEGER NOT NULL,
          PRIMARY KEY(run_id, observation_id)
        );
      `);
      const controllerStore = new player.SharedSyncStore(controllerDatabase, playerProjectionRule);
      const coordinator = new player.SharedSyncCoordinator(controllerStore, credentials);
      const controller = new player.SharedPlayController(
        {
          runId: "co-op-controller-run",
          releaseId: revisedReleaseId,
          sharedRequired: true,
        },
        controllerStore,
        credentials,
        coordinator,
      );
      await controller.start();
      expect(controller.snapshot()).toMatchObject({ status: "join-required" });
      await controller.join({
        serviceUrl: origin,
        sessionId: controllerSession.sessionId,
        invitation: controllerInvitation.invitation,
      });
      expect(controller.snapshot()).toMatchObject({ status: "bound" });

      const target = revisedConfiguration.targets[0];
      if (target === undefined) throw new Error("co-op-controller-target-missing");
      const openedRelease = await openRelease(revisedReleaseBytes);
      if (openedRelease.kind !== "opened") throw new Error("co-op-runtime-release-invalid");
      const inspection = await inspectGameRelease(revisedReleaseBytes);
      if ("kind" in inspection) throw new Error("co-op-runtime-inspection-invalid");
      const logic = openedRelease.entries.find(
        ({ path }) => path === openedRelease.manifest.entrypoints.logic,
      );
      const presentation = openedRelease.entries.find(
        ({ path }) => path === openedRelease.manifest.entrypoints.presentation,
      );
      const contentPath = inspection.gameComposition.resources.find(
        ({ id, role }) => id === "co-op.targets" && role === "content",
      )?.path;
      const assetPath = inspection.gameComposition.resources.find(
        ({ id, role }) => id === "co-op.map" && role === "asset",
      )?.path;
      const content = openedRelease.entries.find(({ path }) => path === contentPath);
      const asset = openedRelease.entries.find(({ path }) => path === assetPath);
      if (
        logic === undefined ||
        presentation === undefined ||
        content === undefined ||
        asset === undefined
      ) {
        throw new Error("co-op-runtime-entry-missing");
      }
      const runtimeMessages: string[] = [];
      const runtimeBootstrap = {
        runId: "co-op-controller-run",
        releaseId: revisedReleaseId,
        aggregate: {
          modelId: "co-op.player",
          aggregateId: "co-op-controller-run",
          aggregateKind: "player",
          schemaId: "co-op.player-state",
          stateVersion: 0,
          state: {},
        },
      };
      const runtimeHtml = player.buildRuntimeBootstrap({
        logicSource: new TextDecoder().decode(logic.bytes),
        presentationSource: new TextDecoder().decode(presentation.bytes),
        gameComposition: inspection.gameComposition,
        content: { "co-op.targets": JSON.parse(new TextDecoder().decode(content.bytes)) },
        assets: { "co-op.map": new TextDecoder().decode(asset.bytes) },
        sharedBindingAvailable: true,
      });
      const hostHandlers = player.createProductionHostBridgeHandlers({
        store: controllerDatabase,
        runtime: {
          bootstrap: runtimeBootstrap,
          composition: inspection.gameComposition,
          aggregateSchemaId: "co-op.player-state",
          validateSchema: () => true,
          validateProgression: () => true,
        },
        location: {
          database: {
            recordObservation: (input: Readonly<Record<string, unknown>>) =>
              player.recordLocationObservation(controllerDatabase, input),
          },
          runId: "co-op-controller-run",
          startedAt: "2030-01-01T00:00:00.000Z",
          adapter: {
            requestPermission: async () => "granted",
            capture: async () => ({
              timestamp: Date.parse("2030-01-01T00:00:00.000Z"),
              latitude: target.latitude,
              longitude: target.longitude,
              horizontalAccuracy: Math.min(5, target.maximumAccuracyMeters),
            }),
          },
          now: () => new Date("2030-01-01T00:00:01.000Z"),
          createObservationId: () => "co-op-controller-observation",
        },
      });
      const sharedHandlers = player.createCompositionSharedBridgeHandlers({
        composition: inspection.gameComposition,
        expectedReleaseId: revisedReleaseId,
        projectionContract: playerProjectionRule,
        getView: async () => {
          const snapshot = controller.snapshot();
          if (snapshot.status !== "bound") throw new Error("co-op-controller-not-bound");
          return snapshot.view;
        },
        enqueue: (intent: object) => controller.enqueue(intent),
      });
      const routeRuntimeMessage = async (message: string): Promise<unknown> => {
        const decoded: unknown = JSON.parse(message);
        if (!isObject(decoded) || typeof decoded.type !== "string") {
          throw new Error("co-op-runtime-message-invalid");
        }
        runtimeMessages.push(decoded.type);
        if (decoded.type.startsWith("shared.")) {
          return player.routeSharedBridgeMessage(message, sharedHandlers);
        }
        return player.routeHostBridgeMessage(message, hostHandlers);
      };
      let runtimeMount: MountedGeneratedRuntime | null = null;
      const unsubscribe = controller.subscribe((state) => {
        if (state.status === "bound") {
          runtimeMount?.dispatchHostEvent({ type: "shared.sync.changed" });
        }
      });
      runtimeMount = await player.mountGeneratedWebRuntime(runtimeHtml, routeRuntimeMessage);
      for (
        let attempt = 0;
        attempt < 100 && runtimeMount.root.children[0]?.dataset.confirmedTargets !== "0";
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(runtimeMessages).toContain("runtime.ready");
      expect(runtimeMessages).toContain("shared.view.get");
      expect(runtimeMount.root.children[0]?.dataset).toMatchObject({
        component: "co-op.clue-board",
        confirmed: "true",
        confirmedTargets: "0",
      });
      const targetItem = findRuntimeNode(
        runtimeMount.root,
        (node) => node.dataset.targetId === target.targetId,
      );
      const discoverButton = targetItem?.children.find(
        (node) => node.textContent === "Discover target",
      );
      if (discoverButton === undefined) throw new Error("co-op-discover-action-missing");

      await discoverButton.dispatchEvent("click");
      await controller.retry();
      await vi.waitFor(() =>
        expect(controller.snapshot()).toMatchObject({
          status: "bound",
          view: {
            actions: expect.arrayContaining([expect.objectContaining({ terminal: "accepted" })]),
          },
        }),
      );
      await vi.waitFor(() =>
        expect(runtimeMount?.root.children[0]?.dataset).toMatchObject({
          component: "co-op.clue-board",
          confirmed: "true",
          confirmedTargets: "1",
        }),
      );
      expect(runtimeMessages).toEqual(
        expect.arrayContaining(["capability.request", "shared.view.get", "shared.command.enqueue"]),
      );
      expect(runtimeMount.root.children[0]?.dataset).toMatchObject({
        component: "co-op.clue-board",
        confirmed: "true",
        confirmedTargets: "1",
      });
      unsubscribe();
      await runtimeMount.unmount();
      controller.dispose();

      const restartedCoordinator = new player.SharedSyncCoordinator(controllerStore, credentials);
      const restarted = new player.SharedPlayController(
        {
          runId: "co-op-controller-run",
          releaseId: revisedReleaseId,
          sharedRequired: true,
        },
        controllerStore,
        credentials,
        restartedCoordinator,
      );
      await restarted.start();
      expect(restarted.snapshot()).toMatchObject({ status: "bound" });
      const controllerReportValue = await player.createGamePlayReport(
        { raw: () => controllerDatabase },
        "co-op-controller-run",
        "android",
      );
      if (!isGamePlayReport(controllerReportValue)) {
        throw new Error("co-op-controller-report-invalid");
      }
      expect(controllerReportValue.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "command", scope: "shared", terminal: "accepted" }),
          expect.objectContaining({ kind: "capability", disposition: "consumed" }),
          expect.objectContaining({ kind: "synchronization", disposition: "pull-applied" }),
        ]),
      );
      restarted.dispose();
    } finally {
      controllerDatabase.close();
    }
  }, 120_000);
});
