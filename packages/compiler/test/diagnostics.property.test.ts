import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCompilerDiagnostic } from "../src/diagnostics/create.js";
import { compareCompilerDiagnostics, orderCompilerDiagnostics } from "../src/diagnostics/order.js";
import type { CompilerDiagnostic, DiagnosticLocation } from "../src/project/config.js";

const ORDER_SEED = 0x0670_1001;
const COMPARATOR_SEED = 0x0670_1002;
const codes = [
  "configuration-unknown-field",
  "import-forbidden",
  "composition-reference-missing",
  "command-invalid",
  "schema-value-invalid",
  "progression-cycle",
  "component-reference-missing",
  "content-reference-missing",
  "asset-empty",
  "capability-invalid",
  "release-assembly-failed",
] as const;

const token = fc
  .array(fc.constantFrom("a", "b", "c", "0", "1", "2", "-", "_"), {
    minLength: 1,
    maxLength: 8,
  })
  .map((parts) => parts.join(""));

const locationArbitrary: fc.Arbitrary<DiagnosticLocation> = fc.oneof(
  fc.record({
    kind: fc.constant("configuration" as const),
    path: token.map((value) => `${value}.json`),
    pointer: token.map((value) => `/${value}`),
  }),
  fc.record({
    kind: fc.constant("source" as const),
    path: token.map((value) => `src/${value}.ts`),
    line: fc.integer({ min: 1, max: 500 }),
    column: fc.integer({ min: 1, max: 200 }),
  }),
  fc.record({
    kind: fc.constant("registration" as const),
    registration: fc.constantFrom("asset", "command", "component", "content"),
    id: token,
    field: fc.option(token, { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant("artifact" as const),
    path: token.map((value) => `content/${value}.json`),
    relationship: fc.option(token, { nil: undefined }),
  }),
);

const diagnosticArbitrary: fc.Arbitrary<CompilerDiagnostic> = fc
  .record({
    code: fc.constantFrom(...codes),
    location: locationArbitrary,
    ordinal: fc.integer({ min: -1_000, max: 1_000 }),
    label: token,
  })
  .map(({ code, location, ordinal, label }) =>
    createCompilerDiagnostic({ code, location, details: { label, ordinal } }),
  );

function serialized(diagnostics: readonly CompilerDiagnostic[]): readonly string[] {
  return diagnostics.map((diagnostic) => JSON.stringify(diagnostic));
}

describe("compiler diagnostic ordering properties", () => {
  it("is deterministic across input permutations with a replayable seed", () => {
    fc.assert(
      fc.property(fc.array(diagnosticArbitrary, { maxLength: 40 }), (diagnostics) => {
        const ordered = orderCompilerDiagnostics(diagnostics);
        const reversed = orderCompilerDiagnostics([...diagnostics].reverse());

        expect(serialized(reversed)).toEqual(serialized(ordered));
        expect(serialized(orderCompilerDiagnostics(ordered))).toEqual(serialized(ordered));
        for (let index = 1; index < ordered.length; index += 1) {
          expect(
            compareCompilerDiagnostics(ordered[index - 1]!, ordered[index]!),
          ).toBeLessThanOrEqual(0);
        }
      }),
      { seed: ORDER_SEED, numRuns: 200 },
    );
  });

  it("obeys comparator antisymmetry and transitivity with a replayable seed", () => {
    fc.assert(
      fc.property(
        diagnosticArbitrary,
        diagnosticArbitrary,
        diagnosticArbitrary,
        (left, middle, right) => {
          const leftMiddle = Math.sign(compareCompilerDiagnostics(left, middle));
          const middleLeft = Math.sign(compareCompilerDiagnostics(middle, left));
          expect(leftMiddle).toBe(-middleLeft);

          if (
            compareCompilerDiagnostics(left, middle) <= 0 &&
            compareCompilerDiagnostics(middle, right) <= 0
          ) {
            expect(compareCompilerDiagnostics(left, right)).toBeLessThanOrEqual(0);
          }
        },
      ),
      { seed: COMPARATOR_SEED, numRuns: 300 },
    );
  });
});
