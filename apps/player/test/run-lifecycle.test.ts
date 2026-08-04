import { describe, expect, it } from "vitest";

import type { ReleaseId } from "@plotpoint/protocol";

import type { RunRecord } from "../src/model";
import { selectReleaseRun, type RunLifecycleStore } from "../src/runtime/run-lifecycle";

const originalRelease = `sha256:${"a".repeat(64)}` as ReleaseId;
const revisedRelease = `sha256:${"b".repeat(64)}` as ReleaseId;

class MemoryRunStore implements RunLifecycleStore {
  readonly runs: RunRecord[] = [];

  async selectOrCreateActiveRun(candidate: RunRecord): Promise<{
    readonly created: boolean;
    readonly run: RunRecord;
  }> {
    const active =
      [...this.runs]
        .reverse()
        .find((run) => run.releaseId === candidate.releaseId && run.status === "active") ?? null;
    if (active !== null) return { created: false, run: active };
    this.runs.push(candidate);
    return { created: true, run: candidate };
  }
}

describe("release run lifecycle", () => {
  it("resumes the active run when identical release bytes are installed again", async () => {
    const store = new MemoryRunStore();
    const original: RunRecord = {
      runId: "run-original",
      releaseId: originalRelease,
      startedAt: "2026-08-03T00:00:00.000Z",
      status: "active",
    };
    store.runs.push(original);

    await expect(selectReleaseRun(store, originalRelease)).resolves.toEqual({
      kind: "resumed",
      run: original,
    });
    expect(store.runs).toEqual([original]);
  });

  it("creates a fresh run for changed bytes and retains the prior run", async () => {
    const store = new MemoryRunStore();
    const original: RunRecord = {
      runId: "run-original",
      releaseId: originalRelease,
      startedAt: "2026-08-03T00:00:00.000Z",
      status: "active",
    };
    store.runs.push(original);

    await expect(
      selectReleaseRun(store, revisedRelease, {
        createRunId: () => "run-revised",
        now: () => "2026-08-03T01:00:00.000Z",
      }),
    ).resolves.toEqual({
      kind: "created",
      run: {
        runId: "run-revised",
        releaseId: revisedRelease,
        startedAt: "2026-08-03T01:00:00.000Z",
        status: "active",
      },
    });
    expect(store.runs).toHaveLength(2);
    expect(store.runs[0]).toEqual(original);
  });

  it("starts a new run when the same release has no active run", async () => {
    const store = new MemoryRunStore();
    store.runs.push({
      runId: "run-complete",
      releaseId: originalRelease,
      startedAt: "2026-08-03T00:00:00.000Z",
      status: "completed",
    });

    const selected = await selectReleaseRun(store, originalRelease, {
      createRunId: () => "run-next",
      now: () => "2026-08-03T02:00:00.000Z",
    });
    expect(selected).toMatchObject({ kind: "created", run: { runId: "run-next" } });
    expect(store.runs).toHaveLength(2);
  });

  it("atomically selects one winner when the same release is installed concurrently", async () => {
    const store = new MemoryRunStore();

    const selections = await Promise.all([
      selectReleaseRun(store, originalRelease, {
        createRunId: () => "run-race-a",
        now: () => "2026-08-03T03:00:00.000Z",
      }),
      selectReleaseRun(store, originalRelease, {
        createRunId: () => "run-race-b",
        now: () => "2026-08-03T03:00:00.001Z",
      }),
    ]);

    expect(selections.map(({ kind }) => kind).sort()).toEqual(["created", "resumed"]);
    expect(new Set(selections.map(({ run }) => run.runId))).toEqual(new Set(["run-race-a"]));
    expect(store.runs).toEqual([
      {
        runId: "run-race-a",
        releaseId: originalRelease,
        startedAt: "2026-08-03T03:00:00.000Z",
        status: "active",
      },
    ]);
  });
});
