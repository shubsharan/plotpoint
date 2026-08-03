import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_CODES } from "@plotpoint/runtime";
import { createDiagnostic, isDiagnosticCode } from "../src/diagnostics.js";

describe("diagnostics", () => {
  it("exposes stable diagnostic codes", () => {
    expect(DIAGNOSTIC_CODES).toContain("canonical-value-invalid");
    expect(DIAGNOSTIC_CODES).toContain("progression-limit-overrun");
    expect(isDiagnosticCode("handler-threw")).toBe(true);
    expect(isDiagnosticCode("some prose")).toBe(false);
  });

  it("canonicalizes detail objects without adding prose", () => {
    const diagnostic = createDiagnostic("stale-aggregate-version", { expected: 2, actual: 3 });

    expect(diagnostic).toEqual({
      code: "stale-aggregate-version",
      details: { actual: 3, expected: 2 },
    });
    expect(Object.isFrozen(diagnostic.details)).toBe(true);
    expect(Object.keys(diagnostic)).toEqual(["code", "details"]);
  });

  it("rejects invalid detail values as programmer misuse", () => {
    expect(() => createDiagnostic("handler-threw", { invalid: undefined } as never)).toThrow();
  });
});
