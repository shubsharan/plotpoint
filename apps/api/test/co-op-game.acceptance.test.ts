import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresPool, migrateAuthoritativeHunt, type PostgresPool } from "@plotpoint/db";
import { TARGET_DISCOVERY_COMMAND, TARGET_DISCOVERY_STATE_SCHEMA } from "@plotpoint/modules";
import {
  isGamePlayReport,
  isReleaseId,
  isSharedJoinResponse,
  isSyncCommand,
  isSyncCommandResult,
  isSyncPull,
  type SharedJoinResponse,
  type SyncCommand,
  type SyncCommandResult,
  type SyncPull,
} from "@plotpoint/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileProject } from "../../../packages/compiler/dist/index.js";
import { createSecret } from "../src/security.js";
import { createApiServer } from "../src/server.js";
import { SharedSessionService } from "../src/shared-session-service.js";

const PARTICIPANTS = ["participant-one", "participant-two", "participant-three"] as const;
const REVISED_MAXIMUM_AGE_MS = 30_000;
const OPERATOR_TOKEN = "operator-token";

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

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

async function buildProductionGamePlayReport(evidence: object): Promise<unknown> {
  // Keep the acceptance dependency test-only: apps/api must not gain a production dependency on the
  // native player, while this vertical fixture still executes the one production report builder.
  const moduleUrl = new URL("../../player/src/reports/create-game-play-report.ts", import.meta.url)
    .href;
  const reportModule: unknown = await import(moduleUrl);
  if (!isObject(reportModule) || typeof reportModule.buildGamePlayReport !== "function") {
    throw new Error("co-op-game-play-report-builder-missing");
  }
  return reportModule.buildGamePlayReport(evidence);
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
      schemaVersion: 1,
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
  await registerRelease(await readFile(revisedOutput), revisedReleaseId);
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

    const reportValue = await buildProductionGamePlayReport({
      releaseId: firstReleaseId,
      platform: "ios",
      sharedMembership: "active",
      lifecycle: [],
      commands: [
        {
          elapsedMs: 1,
          sourceSequence: 0,
          scope: "shared",
          commandId: staleCommand.commandId,
          terminal: rejected.terminal,
          expectedStateVersion: staleCommand.expectedStateVersion,
          resultingStateVersion: rejected.resultingStateVersion,
        },
      ],
      capabilities: [
        {
          elapsedMs: 2,
          sourceSequence: 0,
          capabilityId: "plotpoint.location.foreground",
          disposition: "expired",
        },
      ],
      synchronization: [],
      recovery: [],
      diagnostics: [],
    });
    expect(isGamePlayReport(reportValue)).toBe(true);
    if (!isGamePlayReport(reportValue)) throw new Error("co-op-game-play-report-invalid");
    const report = reportValue;
    expect(report.events).toEqual([
      expect.objectContaining({
        kind: "command",
        scope: "shared",
        commandAlias: "command-001",
        terminal: "rejected",
      }),
      expect.objectContaining({ kind: "capability", disposition: "expired" }),
    ]);
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
      disposition: "duplicate",
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
  }, 120_000);
});
