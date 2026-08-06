import type { GameComposition, TrustedMechanicBinding } from "@plotpoint/protocol";
import { describe, expect, it } from "vitest";

import {
  TARGET_DISCOVERY_COMMAND,
  TARGET_DISCOVERY_CONFIG_SCHEMA,
  TARGET_DISCOVERY_MECHANIC,
  TARGET_DISCOVERY_MODEL,
  TARGET_DISCOVERY_OUTCOME_SCHEMA,
  TARGET_DISCOVERY_PAYLOAD_SCHEMA,
  TARGET_DISCOVERY_PROJECTION_SCHEMA,
  TARGET_DISCOVERY_STATE_SCHEMA,
  hasTrustedMechanic,
  resolveTrustedMechanic,
} from "../src/index.js";

const configuration = Object.freeze({
  targets: Object.freeze([
    Object.freeze({
      targetId: "alpha",
      prompt: "Find alpha",
      zone: "North",
      latitude: 37,
      longitude: -122,
      radiusMeters: 100,
      maximumAgeMs: 15_000,
      maximumAccuracyMeters: 30,
    }),
  ]),
});

const binding: TrustedMechanicBinding = Object.freeze({
  id: TARGET_DISCOVERY_MECHANIC,
  aggregateModel: TARGET_DISCOVERY_MODEL,
  commands: Object.freeze([TARGET_DISCOVERY_COMMAND]),
  configuration: "co-op.targets",
  projectionSchema: Object.freeze({ id: TARGET_DISCOVERY_PROJECTION_SCHEMA }),
  capabilities: Object.freeze([
    Object.freeze({ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }),
  ]),
});

function composition(overrides: Partial<GameComposition> = {}): GameComposition {
  return {
    application: { components: [] },
    aggregateModels: [
      {
        id: TARGET_DISCOVERY_MODEL,
        authority: "server",
        kind: "team",
        stateSchema: { id: TARGET_DISCOVERY_STATE_SCHEMA },
        initializationSchema: { id: TARGET_DISCOVERY_CONFIG_SCHEMA },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: TARGET_DISCOVERY_COMMAND,
        type: TARGET_DISCOVERY_COMMAND,
        aggregateModel: TARGET_DISCOVERY_MODEL,
        payloadSchema: { id: TARGET_DISCOVERY_PAYLOAD_SCHEMA },
        outcomeSchema: { id: TARGET_DISCOVERY_OUTCOME_SCHEMA },
        execution: "trusted-mechanic",
      },
    ],
    progressions: [],
    components: [],
    resources: [
      {
        id: "co-op.targets",
        path: "content/636f2d6f702e74617267657473.json",
        role: "content",
        schema: { id: TARGET_DISCOVERY_CONFIG_SCHEMA },
      },
      {
        id: TARGET_DISCOVERY_CONFIG_SCHEMA,
        path: "schemas/config.json",
        role: "schema",
      },
      {
        id: TARGET_DISCOVERY_OUTCOME_SCHEMA,
        path: "schemas/outcome.json",
        role: "schema",
      },
      {
        id: TARGET_DISCOVERY_PAYLOAD_SCHEMA,
        path: "schemas/payload.json",
        role: "schema",
      },
      {
        id: TARGET_DISCOVERY_PROJECTION_SCHEMA,
        path: "schemas/projection.json",
        role: "schema",
      },
      {
        id: TARGET_DISCOVERY_STATE_SCHEMA,
        path: "schemas/state.json",
        role: "schema",
      },
    ],
    trustedMechanic: binding,
    ...overrides,
  };
}

function resolved(inputComposition = composition()) {
  const result = resolveTrustedMechanic({
    binding,
    composition: inputComposition,
    configuration,
  });
  if (result.kind !== "resolved") throw new Error(result.diagnostic.code);
  return result.adapter;
}

describe("trusted mechanic registry", () => {
  it("resolves the closed plain identity through an authority-kind-safe wrapper", () => {
    expect(hasTrustedMechanic(TARGET_DISCOVERY_MECHANIC)).toBe(true);
    expect(hasTrustedMechanic("unknown.mechanic")).toBe(false);
    expect(hasTrustedMechanic("__proto__")).toBe(false);
    const adapter = resolved();
    expect(adapter.id).toBe(TARGET_DISCOVERY_MECHANIC);
    expect(adapter.model).toMatchObject({
      modelId: TARGET_DISCOVERY_MODEL,
      aggregateKind: "team",
      authority: "server",
    });
    expect(adapter.model).not.toHaveProperty("progression");

    expect(
      resolveTrustedMechanic({
        binding: { ...binding, id: "unknown.mechanic" },
        composition: composition(),
        configuration,
      }),
    ).toEqual({
      kind: "invalid",
      diagnostic: { code: "invalid-binding", logicalIds: ["unknown.mechanic"] },
    });
    expect(
      resolveTrustedMechanic({
        binding: { ...binding, id: "__proto__" },
        composition: composition(),
        configuration,
      }),
    ).toEqual({
      kind: "invalid",
      diagnostic: { code: "invalid-binding", logicalIds: ["__proto__"] },
    });

    const sessionComposition = composition({
      aggregateModels: [
        {
          id: TARGET_DISCOVERY_MODEL,
          authority: "server",
          kind: "session",
          stateSchema: { id: TARGET_DISCOVERY_STATE_SCHEMA },
          initializationSchema: { id: TARGET_DISCOVERY_CONFIG_SCHEMA },
          events: [],
          effects: [],
        },
      ],
    });
    expect(
      resolveTrustedMechanic({ binding, composition: sessionComposition, configuration }),
    ).toEqual({
      kind: "invalid",
      diagnostic: {
        code: "model-contract-mismatch",
        logicalIds: [TARGET_DISCOVERY_MODEL],
      },
    });
  });

  it("exposes validators bound to the exact inventoried schema digests", () => {
    const adapter = resolved();
    expect({
      configuration: adapter.configurationSchema.schemaDigest,
      initialization: adapter.model.initializationSchema.schemaDigest,
      outcome: adapter.model.commandContracts[TARGET_DISCOVERY_COMMAND]?.outcomeSchema.schemaDigest,
      payload: adapter.model.commandContracts[TARGET_DISCOVERY_COMMAND]?.payloadSchema.schemaDigest,
      projection: adapter.projectionSchema.schemaDigest,
      state: adapter.model.stateSchema.schemaDigest,
    }).toEqual({
      configuration: "sha256:b546973744aecad4c2bcc7c3579235e8403630a622700c3e8e4e83f076e28f6e",
      initialization: "sha256:b546973744aecad4c2bcc7c3579235e8403630a622700c3e8e4e83f076e28f6e",
      outcome: "sha256:e9e572d33bbd6cc80bceb97058ce8363f323a5736a8cdc414577e7d0a281343f",
      payload: "sha256:cdb6e7d4466a8f0145421bebfd7e49b73a2d4ba6804076ee4552559972b9c523",
      projection: "sha256:89f5280dd509d8b0a5f9a098a78a02f74c10d0476c340ca2fd06ac7bd8876739",
      state: "sha256:78efad0abca11dfcfefcf875c06255e9e072583ae640eab1f842257ca9531a00",
    });
    expect(
      adapter.model.commandContracts[TARGET_DISCOVERY_COMMAND]?.outcomeSchema.validate({
        code: "target-discovered",
        detail: "must-not-be-truncated",
      }),
    ).toMatchObject({ valid: false });
  });

  it("returns a complete validated binding and exact initializer input", () => {
    const adapter = resolved();
    expect(adapter.validateBinding({ binding, composition: composition(), configuration })).toEqual(
      {
        kind: "valid",
        value: {
          binding,
          configuration,
          initializationInput: configuration,
        },
      },
    );
    expect(
      adapter.validateBinding({
        binding,
        composition: composition(),
        configuration: { targets: [] },
      }),
    ).toEqual({
      kind: "invalid",
      diagnostic: {
        code: "invalid-configuration",
        logicalIds: ["co-op.targets", TARGET_DISCOVERY_CONFIG_SCHEMA],
      },
    });
  });

  it("distinguishes model, command, schema, and server progression mismatches", () => {
    const cases: readonly [GameComposition, string, readonly string[]][] = [
      [composition({ aggregateModels: [] }), "model-contract-mismatch", [TARGET_DISCOVERY_MODEL]],
      [composition({ commands: [] }), "command-contract-mismatch", [TARGET_DISCOVERY_COMMAND]],
      [
        composition({
          aggregateModels: [
            ...composition().aggregateModels,
            {
              ...composition().aggregateModels[0]!,
              id: "unselected.server-model",
            },
          ],
        }),
        "model-contract-mismatch",
        [TARGET_DISCOVERY_MODEL, "unselected.server-model"],
      ],
      [
        composition({
          commands: [
            ...composition().commands,
            {
              ...composition().commands[0]!,
              id: "unselected.trusted-command",
              type: "unselected.trusted-command",
            },
          ],
        }),
        "command-contract-mismatch",
        [TARGET_DISCOVERY_COMMAND, "unselected.trusted-command"],
      ],
      [
        composition({
          commands: [
            {
              ...composition().commands[0]!,
              outcomeSchema: { id: "wrong.outcome" },
            },
          ],
        }),
        "schema-contract-mismatch",
        [TARGET_DISCOVERY_OUTCOME_SCHEMA, "wrong.outcome"],
      ],
      [
        composition({
          progressions: [{ id: "server.progression", aggregateModel: TARGET_DISCOVERY_MODEL }],
        }),
        "model-contract-mismatch",
        [TARGET_DISCOVERY_MODEL, "server.progression"],
      ],
    ];
    for (const [candidate, code, logicalIds] of cases) {
      expect(resolveTrustedMechanic({ binding, composition: candidate, configuration })).toEqual({
        kind: "invalid",
        diagnostic: { code, logicalIds },
      });
    }
  });
});
