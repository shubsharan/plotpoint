import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("assigns every real target to three participants and changes only observation freshness", () => {
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
  });
});
