import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileProject, validateProject } from "../../../../packages/compiler/dist/index.js";

import targetConfiguration from "../content/targets.json" with { type: "json" };
import { ClueBoard } from "../src/components/clue-board.js";

const PARTICIPANTS = ["participant-one", "participant-two", "participant-three"] as const;
const REVISED_MAXIMUM_AGE_MS = 30_000;

type TargetConfiguration = typeof targetConfiguration;
type Target = TargetConfiguration["targets"][number];

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  textContent = "";
  readonly #listeners = new Map<string, Set<() => void | Promise<void>>>();

  constructor(readonly tagName: string) {}

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  addEventListener(type: string, listener: () => void | Promise<void>): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void | Promise<void>): void {
    this.#listeners.get(type)?.delete(listener);
  }

  async dispatch(type: string): Promise<void> {
    await Promise.all([...(this.#listeners.get(type) ?? [])].map((listener) => listener()));
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function reviseObservationFreshness(
  configuration: TargetConfiguration,
  maximumAgeMs: number,
): TargetConfiguration {
  return {
    targets: configuration.targets.map((target) => ({ ...target, maximumAgeMs })),
  };
}

function withoutObservationFreshness({ maximumAgeMs: _maximumAgeMs, ...target }: Target) {
  return target;
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

describe("co-op game two-release journey", () => {
  it("uses only the declared capability and shared command, renders projection, and cleans up", async () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => new TestElement(tagName),
    });
    vi.stubGlobal("crypto", { randomUUID: () => "discovery-command" });
    const cleanup: Array<() => void | Promise<void>> = [];
    const unsubscribe = vi.fn();
    const request = vi.fn(async () => ({ observationId: "observation-1" }));
    const execute = vi.fn(async () => ({ terminal: "pending" }));
    const board = ClueBoard({
      lifecycle: { defer: (callback) => cleanup.push(callback) },
      content: { "co-op.targets": targetConfiguration },
      assets: { "co-op.map": { uri: "asset://co-op.map" } },
      capabilities: {
        "plotpoint.location.foreground": { request },
      },
      shared: {
        async getView() {
          return {
            projections: [
              {
                schemaId: "plotpoint.location.team-projection",
                value: {
                  complete: false,
                  completedTargets: 1,
                  targets: [
                    { targetId: "ferry-building", status: "discovered" },
                    { targetId: "rincon-park", status: "available" },
                    { targetId: "south-park", status: "available" },
                  ],
                },
              },
            ],
          };
        },
        onSyncChanged() {
          return unsubscribe;
        },
        commands: {
          "plotpoint.location.target-discovery": { execute },
        },
      },
    });

    await Promise.resolve();
    expect(board.dataset.confirmedTargets).toBe("1");
    const firstButton = (board as unknown as TestElement).children[0]?.children.find(
      ({ tagName }) => tagName === "button",
    );
    expect(firstButton).toBeDefined();
    await firstButton?.dispatch("click");
    expect(request).toHaveBeenCalledWith({});
    expect(execute).toHaveBeenCalledWith({
      commandId: "discovery-command",
      payload: { targetId: "ferry-building" },
      observationIds: ["observation-1"],
    });
    expect(cleanup.length).toBeGreaterThan(1);
    await Promise.all(cleanup.map((callback) => callback()));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(firstButton?.listenerCount("click")).toBe(0);
  });

  it("assigns every real target to three participants and compiles a freshness-only revision", async () => {
    expect(targetConfiguration.targets).toHaveLength(PARTICIPANTS.length);

    const firstReleaseAssignments = targetConfiguration.targets.map((target, index) => ({
      participantId: PARTICIPANTS[index],
      targetId: target.targetId,
      observation: {
        ageMs: target.maximumAgeMs + 1,
        horizontalAccuracy: target.maximumAccuracyMeters,
        latitude: target.latitude,
        longitude: target.longitude,
      },
    }));
    expect(firstReleaseAssignments).toEqual([
      expect.objectContaining({ participantId: "participant-one", targetId: "ferry-building" }),
      expect.objectContaining({ participantId: "participant-two", targetId: "rincon-park" }),
      expect.objectContaining({ participantId: "participant-three", targetId: "south-park" }),
    ]);
    expect(new Set(firstReleaseAssignments.map(({ targetId }) => targetId)).size).toBe(
      targetConfiguration.targets.length,
    );

    const revisedConfiguration = reviseObservationFreshness(
      targetConfiguration,
      REVISED_MAXIMUM_AGE_MS,
    );
    expect(revisedConfiguration).not.toEqual(targetConfiguration);
    expect(revisedConfiguration.targets.map(withoutObservationFreshness)).toEqual(
      targetConfiguration.targets.map(withoutObservationFreshness),
    );
    expect(revisedConfiguration.targets.map(({ maximumAgeMs }) => maximumAgeMs)).toEqual([
      REVISED_MAXIMUM_AGE_MS,
      REVISED_MAXIMUM_AGE_MS,
      REVISED_MAXIMUM_AGE_MS,
    ]);

    const projectRoot = new URL("../", import.meta.url).pathname;
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plotpoint-co-op-revision-"));
    const revisedProjectRoot = join(temporaryRoot, "co-op-game");
    const firstOutput = join(temporaryRoot, "first.pprelease");
    const revisedOutput = join(temporaryRoot, "revised.pprelease");
    try {
      await copyProject(projectRoot, revisedProjectRoot);
      await writeFile(
        join(revisedProjectRoot, "content", "targets.json"),
        `${JSON.stringify(revisedConfiguration, null, 2)}\n`,
      );

      await expect(validateProject({ projectRoot })).resolves.toMatchObject({ kind: "valid" });
      await expect(validateProject({ projectRoot: revisedProjectRoot })).resolves.toMatchObject({
        kind: "valid",
      });
      const first = await compileProject({ projectRoot, outputFile: firstOutput });
      const revised = await compileProject({
        projectRoot: revisedProjectRoot,
        outputFile: revisedOutput,
      });
      expect(first.kind).toBe("compiled");
      expect(revised.kind).toBe("compiled");
      if (first.kind !== "compiled" || revised.kind !== "compiled") {
        throw new Error(`co-op-revision-compilation-failed:${JSON.stringify({ first, revised })}`);
      }
      expect(revised.releaseId).not.toBe(first.releaseId);
      expect(await readFile(revisedOutput)).not.toEqual(await readFile(firstOutput));
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
