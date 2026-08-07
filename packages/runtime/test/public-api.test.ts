import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import {
  bindExecutableAggregateModel,
  canonicalizeValue,
  defineCommand,
  defineProgression,
  executeCommand,
  initialProgression,
  resolveCommandBinding,
} from "@plotpoint/runtime";

describe("runtime public API", () => {
  it("exposes the Gate 1 values through the root", () => {
    expect([
      bindExecutableAggregateModel,
      canonicalizeValue,
      defineCommand,
      defineProgression,
      executeCommand,
      initialProgression,
      resolveCommandBinding,
    ]).toEqual(expect.arrayContaining([expect.any(Function)]));
  });

  it("publishes no supported deep-import surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual(["."]);
  });
});
