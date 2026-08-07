import { describe, expect, it } from "vitest";

import {
  analyzeGameComposition,
  parseGameComposition,
  type GameComposition,
} from "@plotpoint/protocol";

const composition: GameComposition = {
  application: { components: ["field-view"] },
  aggregateModels: [
    {
      id: "player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "player-state" },
      initializationSchema: { id: "player-initialization" },
      initializationContent: "initialization",
      events: [],
      effects: [],
    },
    {
      id: "team",
      authority: "server",
      kind: "team",
      stateSchema: { id: "team-state" },
      initializationSchema: { id: "team-initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [
    {
      id: "solve",
      type: "solve",
      aggregateModel: "player",
      payloadSchema: { id: "solve-payload" },
      outcomeSchema: { id: "solve-outcome" },
      execution: "local",
    },
    {
      id: "submit",
      type: "submit",
      aggregateModel: "team",
      payloadSchema: { id: "submit-payload" },
      outcomeSchema: { id: "submit-outcome" },
      execution: "trusted-mechanic",
    },
  ],
  progressions: [{ id: "route", aggregateModel: "player" }],
  components: [
    {
      id: "field-view",
      commands: ["solve", "submit"],
      content: [],
      assets: [],
      capabilities: [],
      sharedProjection: { id: "team-state" },
    },
  ],
  resources: [
    { id: "field-view", role: "component-descriptor", path: "components/field-view.json" },
    {
      id: "initialization",
      role: "content",
      path: "content/initialization.json",
      schema: { id: "player-initialization" },
    },
    {
      id: "mechanic-config",
      role: "content",
      path: "content/mechanic.json",
      schema: { id: "team-initialization" },
    },
    { id: "player-initialization", role: "schema", path: "schemas/player-init.json" },
    { id: "player-state", role: "schema", path: "schemas/player-state.json" },
    { id: "route", role: "progression-descriptor", path: "progressions/route.json" },
    { id: "solve-outcome", role: "schema", path: "schemas/solve-outcome.json" },
    { id: "solve-payload", role: "schema", path: "schemas/solve-payload.json" },
    { id: "submit-outcome", role: "schema", path: "schemas/submit-outcome.json" },
    { id: "submit-payload", role: "schema", path: "schemas/submit-payload.json" },
    { id: "team-initialization", role: "schema", path: "schemas/team-init.json" },
    { id: "team-state", role: "schema", path: "schemas/team-state.json" },
  ],
  trustedMechanic: {
    id: "mechanic",
    aggregateModel: "team",
    commands: ["submit"],
    configuration: "mechanic-config",
    projectionSchema: { id: "team-state" },
    capabilities: [],
  },
};

function changed(change: Partial<GameComposition>): GameComposition {
  return { ...composition, ...change };
}

describe("game composition semantics", () => {
  it.each([
    [
      "initialization-schema-mismatch",
      changed({
        resources: composition.resources.map((resource) =>
          resource.id === "initialization"
            ? { ...resource, schema: { id: "solve-payload" } }
            : resource,
        ),
      }),
    ],
    [
      "duplicate-command-type",
      changed({
        commands: [
          composition.commands[0]!,
          { ...composition.commands[0]!, id: "solve-again" },
          composition.commands[1]!,
        ],
      }),
    ],
    [
      "multiple-model-progressions",
      changed({
        progressions: [
          composition.progressions[0]!,
          { id: "route-again", aggregateModel: "player" },
        ],
        resources: [
          ...composition.resources,
          {
            id: "route-again",
            role: "progression-descriptor" as const,
            path: "progressions/route-again.json",
          },
        ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      }),
    ],
    [
      "unselected-server-model",
      changed({
        aggregateModels: [
          ...composition.aggregateModels,
          { ...composition.aggregateModels[1]!, id: "unselected-team" },
        ],
      }),
    ],
    [
      "unselected-trusted-command",
      changed({
        commands: [
          ...composition.commands,
          { ...composition.commands[1]!, id: "unselected-submit", type: "submit-again" },
        ],
      }),
    ],
    [
      "component-shared-projection-mismatch",
      changed({
        components: composition.components.map(
          ({ sharedProjection: _, ...component }) => component,
        ),
      }),
    ],
    [
      "trusted-configuration-schema-missing",
      changed({
        resources: composition.resources.map((resource) =>
          resource.id === "mechanic-config"
            ? { id: resource.id, role: "content" as const, path: resource.path }
            : resource,
        ),
      }),
    ],
  ] as const)("reports %s consistently in analysis and parsing", (code, candidate) => {
    expect(analyzeGameComposition(candidate)).toContainEqual(expect.objectContaining({ code }));
    expect(parseGameComposition(candidate)).toMatchObject({
      kind: "invalid",
      diagnostics: [{ details: { reason: code } }],
    });
  });
});
