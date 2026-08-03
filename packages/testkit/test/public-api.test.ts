import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import {
  assertAccepted,
  capability,
  clock,
  createRuntimeHarness,
  identifier,
  observation,
  playerFixture,
  random,
  replayScenario,
  sessionFixture,
  teamFixture,
} from "@plotpoint/testkit";

describe("testkit public API", () => {
  it("exposes author helpers through the root", () => {
    expect([
      assertAccepted,
      capability,
      clock,
      createRuntimeHarness,
      identifier,
      observation,
      playerFixture,
      random,
      replayScenario,
      sessionFixture,
      teamFixture,
    ]).toEqual(expect.arrayContaining([expect.any(Function)]));
  });

  it("publishes no supported deep-import surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual(["."]);
  });
});
