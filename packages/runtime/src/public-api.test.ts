import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import {
  canonicalizeValue,
  defineCommand,
  evaluateProgression,
  executeCommand,
  validateAggregate,
  validateProgressionGraph,
} from "./index.js";

describe("runtime public API", () => {
  it("exposes the Gate 1 values through the root", () => {
    expect([
      canonicalizeValue,
      defineCommand,
      evaluateProgression,
      executeCommand,
      validateAggregate,
      validateProgressionGraph,
    ]).toEqual(expect.arrayContaining([expect.any(Function)]));
  });

  it("publishes no supported deep-import surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual(["."]);
  });
});
