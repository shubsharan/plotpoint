import { describe, expect, it } from "vitest";
import { dbBoundary } from "../index.js";

describe("@plotpoint/db", () => {
  it("exposes the placeholder db boundary", () => {
    expect(dbBoundary.packageName).toBe("@plotpoint/db");
  });
});
