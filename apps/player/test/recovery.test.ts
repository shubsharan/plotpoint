import { describe, expect, it } from "vitest";

import { isRecoverableSnapshotState } from "../src/runtime/recovery";

describe("recovery snapshot boundary", () => {
  it("accepts object aggregates and rejects partial scalar or array records", () => {
    expect(isRecoverableSnapshotState({ phase: "puzzle", attempts: 1 })).toBe(true);
    expect(isRecoverableSnapshotState(null)).toBe(false);
    expect(isRecoverableSnapshotState(["partial"])).toBe(false);
    expect(isRecoverableSnapshotState("partial")).toBe(false);
  });
});
