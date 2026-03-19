import { describe, expect, it } from "vitest";
import { engineBoundary } from "../index.js";

describe("@plotpoint/engine", () => {
  it("exposes the placeholder engine boundary", () => {
    expect(engineBoundary.packageName).toBe("@plotpoint/engine");
  });
});
