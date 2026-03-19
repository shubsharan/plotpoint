import { describe, expect, it } from "vitest";
import { contractsBoundary } from "../index.js";

describe("@plotpoint/contracts", () => {
  it("exposes the placeholder contracts boundary", () => {
    expect(contractsBoundary.packageName).toBe("@plotpoint/contracts");
  });
});
