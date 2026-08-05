import { describe, expect, expectTypeOf, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import type {
  CompileProjectInput,
  CompilerDiagnostic,
  DiagnosticLocation,
  ProjectConfiguration,
  ValidateProjectInput,
} from "@plotpoint/compiler";

describe("compiler public type API", () => {
  it("exposes the planned authoring contracts from the package root", () => {
    expectTypeOf<CompileProjectInput>().toMatchTypeOf<ValidateProjectInput>();
    expectTypeOf<ProjectConfiguration["projectFormatVersion"]>().toEqualTypeOf<1>();
    expectTypeOf<CompilerDiagnostic["severity"]>().toEqualTypeOf<"error">();
    expectTypeOf<DiagnosticLocation["kind"]>().toEqualTypeOf<
      "configuration" | "source" | "registration" | "artifact"
    >();
  });

  it("publishes no supported deep-import surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.files).toEqual(["dist"]);
    expect(packageJson.dependencies.rolldown).toBe("1.2.2");
  });
});
