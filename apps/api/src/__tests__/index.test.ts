import { describe, expect, it } from "vitest";
import { apiBoundary } from "../index.js";

describe("@plotpoint/api", () => {
  it("exposes the placeholder api boundary", () => {
    expect(apiBoundary.packageName).toBe("@plotpoint/api");
  });
});
