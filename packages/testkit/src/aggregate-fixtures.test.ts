import { describe, expect, it } from "vitest";

import { playerFixture, sessionFixture, teamFixture } from "./index.js";

describe("aggregate fixtures", () => {
  it.each([
    ["player", playerFixture],
    ["team", teamFixture],
    ["session", sessionFixture],
  ] as const)("creates a detached %s aggregate with stable defaults", (kind, fixture) => {
    const nested = { value: 1 };
    const aggregate = fixture({ state: { nested } });

    expect(aggregate).toMatchObject({
      kind,
      id: `${kind}-fixture`,
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
    });
    expect(aggregate.state.nested).not.toBe(nested);
    expect(Object.isFrozen(aggregate.state.nested)).toBe(true);
  });

  it("does not share nested references between fixture calls", () => {
    const nested = { value: 1 };
    const first = playerFixture({ state: { nested } });
    const second = playerFixture({ state: { nested } });

    expect(first.state.nested).not.toBe(second.state.nested);
  });
});
