import { describe, expect, it } from "vitest";

import { createCompilerDiagnostic } from "../../src/diagnostics/create.js";
import { orderCompilerDiagnostics } from "../../src/diagnostics/order.js";
import { renderCompilerDiagnostic } from "../../src/diagnostics/render.js";

describe("compiler diagnostics", () => {
  it("derives categories and canonicalizes stable details", () => {
    const diagnostic = createCompilerDiagnostic({
      code: "project-path-symlink",
      location: {
        kind: "configuration",
        path: "plotpoint.project.json",
        pointer: "/assets/0/path",
      },
      details: { z: 2, a: { second: true, first: false } },
    });

    expect(diagnostic).toEqual({
      category: "configuration",
      code: "project-path-symlink",
      severity: "error",
      location: {
        kind: "configuration",
        path: "plotpoint.project.json",
        pointer: "/assets/0/path",
      },
      details: { a: { first: false, second: true }, z: 2 },
      related: [],
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.details)).toBe(true);
  });

  it("orders by category, structured location, code, and canonical details", () => {
    const diagnostics = [
      createCompilerDiagnostic({
        code: "asset-empty",
        location: { kind: "registration", registration: "asset", id: "z" },
      }),
      createCompilerDiagnostic({
        code: "import-forbidden",
        location: { kind: "source", path: "src/z.ts", line: 1, column: 1 },
      }),
      createCompilerDiagnostic({
        code: "configuration-unknown-field",
        location: { kind: "configuration", path: "plotpoint.project.json", pointer: "/z" },
      }),
      createCompilerDiagnostic({
        code: "configuration-duplicate-key",
        location: { kind: "configuration", path: "plotpoint.project.json", pointer: "/a" },
      }),
    ];

    const ordered = orderCompilerDiagnostics(diagnostics);
    expect(ordered.map((diagnostic) => diagnostic.code)).toEqual([
      "configuration-duplicate-key",
      "configuration-unknown-field",
      "import-forbidden",
      "asset-empty",
    ]);
    expect(diagnostics[0]?.code).toBe("asset-empty");
    expect(Object.isFrozen(ordered)).toBe(true);
  });

  it("renders prose separately from structured diagnostics", () => {
    const diagnostic = createCompilerDiagnostic({
      code: "import-forbidden",
      location: { kind: "source", path: "src/logic.ts", line: 4, column: 7 },
      details: { specifier: "node:fs" },
    });

    expect(renderCompilerDiagnostic(diagnostic)).toBe(
      'src/logic.ts:4:7: [import-forbidden] {"specifier":"node:fs"}',
    );
  });

  it("rejects non-canonical detail values", () => {
    expect(() =>
      createCompilerDiagnostic({
        code: "configuration-value-invalid",
        location: { kind: "configuration", path: "plotpoint.project.json", pointer: "" },
        details: { invalid: undefined } as never,
      }),
    ).toThrow("canonical JSON object");
  });
});
