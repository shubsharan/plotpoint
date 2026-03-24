import { describe, expect, it } from "vitest";
import {
  storyBundleSchema,
  validateStoryBundleCompatibility,
  validateStoryBundleStructure,
} from "../index.js";
import {
  createCompatibilityInvalidStoryBundleFixture,
  createStructurallyInvalidStoryBundleFixture,
  createValidStoryBundleFixture,
  invalidStoryBundleFixtures,
} from "./fixtures/story-bundles.js";

describe("@plotpoint/engine story bundle validation", () => {
  it("accepts a valid rooted DAG bundle", () => {
    const bundle = createValidStoryBundleFixture();

    expect(validateStoryBundleStructure(bundle)).toEqual([]);
    expect(
      validateStoryBundleCompatibility(bundle, {
        currentEngineMajor: 0,
        mode: "draft",
      }),
    ).toEqual([]);
  });

  it("rejects duplicate node ids deterministically", () => {
    const bundle = createStructurallyInvalidStoryBundleFixture();

    expect(validateStoryBundleStructure(bundle)).toEqual([
      {
        code: "duplicate-node-id",
        details: {
          duplicateId: "archive-door",
          duplicateIndex: 3,
          firstIndex: 1,
        },
        layer: "structure",
        message: 'node id "archive-door" is duplicated.',
        path: ["graph", "nodes", 3, "id"],
      },
    ]);
  });

  it("rejects broken references, unreachable nodes, and cycles", () => {
    const bundle = createValidStoryBundleFixture();
    const entryNode = bundle.graph.nodes[0];
    const archiveNode = bundle.graph.nodes[1];
    const vaultNode = bundle.graph.nodes[2];

    if (!entryNode || !archiveNode || !vaultNode) {
      throw new Error(
        "Expected seed fixture to include foyer, archive door, and vault nodes.",
      );
    }

    entryNode.edges[0] = {
      id: "foyer-to-missing",
      targetNodeId: "missing-node",
    };
    vaultNode.edges.push({
      id: "vault-to-archive",
      targetNodeId: "archive-door",
    });

    expect(validateStoryBundleStructure(bundle)).toEqual([
      {
        code: "unknown-edge-target",
        details: {
          sourceNodeId: "foyer",
          targetNodeId: "missing-node",
        },
        layer: "structure",
        message: 'Edge target "missing-node" does not exist.',
        path: ["graph", "nodes", 0, "edges", 0, "targetNodeId"],
      },
      {
        code: "unreachable-node",
        details: {
          entryNodeId: "foyer",
          nodeId: "archive-door",
        },
        layer: "structure",
        message: 'Node "archive-door" is unreachable from entry node "foyer".',
        path: ["graph", "nodes", 1, "id"],
      },
      {
        code: "unreachable-node",
        details: {
          entryNodeId: "foyer",
          nodeId: "vault",
        },
        layer: "structure",
        message: 'Node "vault" is unreachable from entry node "foyer".',
        path: ["graph", "nodes", 2, "id"],
      },
      {
        code: "cyclic-edge",
        details: {
          sourceNodeId: "vault",
          targetNodeId: "archive-door",
        },
        layer: "structure",
        message: 'Edge from "vault" to "archive-door" creates a cycle.',
        path: ["graph", "nodes", 2, "edges", 0, "targetNodeId"],
      },
    ]);
  });

  it("rejects duplicate role, block, and edge ids", () => {
    const bundle = createValidStoryBundleFixture();
    const firstNode = bundle.graph.nodes[0];

    if (!firstNode) {
      throw new Error(
        "Expected a first node in the valid story bundle fixture.",
      );
    }

    bundle.roles.push({
      id: "detective",
      title: "Lead Detective",
    });
    firstNode.blocks.push({
      id: "briefing",
      type: "text",
      config: {},
    });
    firstNode.edges.push({
      id: "foyer-to-archive",
      targetNodeId: "archive-door",
    });

    expect(validateStoryBundleStructure(bundle)).toEqual([
      {
        code: "duplicate-role-id",
        details: {
          duplicateId: "detective",
          duplicateIndex: 2,
          firstIndex: 0,
        },
        layer: "structure",
        message: 'role id "detective" is duplicated.',
        path: ["roles", 2, "id"],
      },
      {
        code: "duplicate-block-id",
        details: {
          duplicateId: "briefing",
          duplicateIndex: 1,
          firstIndex: 0,
        },
        layer: "structure",
        message: 'block id "briefing" is duplicated.',
        path: ["graph", "nodes", 0, "blocks", 1, "id"],
      },
      {
        code: "duplicate-edge-id",
        details: {
          duplicateId: "foyer-to-archive",
          duplicateIndex: 1,
          firstIndex: 0,
        },
        layer: "structure",
        message: 'edge id "foyer-to-archive" is duplicated.',
        path: ["graph", "nodes", 0, "edges", 1, "id"],
      },
    ]);
  });

  it("rejects unknown block types and incompatible engine majors", () => {
    const bundle = createCompatibilityInvalidStoryBundleFixture();

    expect(
      validateStoryBundleCompatibility(bundle, {
        currentEngineMajor: 0,
        mode: "published",
      }),
    ).toEqual([
      {
        code: "unknown-block-type",
        details: {
          blockId: "mystery-device",
          blockType: "mystery-device",
          nodeId: "foyer",
        },
        layer: "compatibility",
        message: 'Block type "mystery-device" is not registered in the engine.',
        path: ["graph", "nodes", 0, "blocks", 1, "type"],
      },
      {
        code: "incompatible-engine-major",
        details: {
          currentEngineMajor: 0,
          engineMajor: 9,
          mode: "published",
        },
        layer: "compatibility",
        message: "Bundle engine major 9 does not match current engine major 0.",
        path: ["version", "engineMajor"],
      },
    ]);
  });

  it("rejects invalid block configs for known block types", () => {
    const bundle = storyBundleSchema.parse(
      invalidStoryBundleFixtures.invalidBlockConfig,
    );

    expect(
      validateStoryBundleCompatibility(bundle, {
        currentEngineMajor: 0,
        mode: "draft",
      }),
    ).toEqual([
      {
        code: "invalid-block-config",
        details: {
          blockId: "vault-code",
          blockType: "code",
          nodeId: "foyer",
          validationCode: "invalid_type",
        },
        layer: "compatibility",
        message: 'Block "vault-code" has invalid config for type "code".',
        path: ["graph", "nodes", 0, "blocks", 0, "config", "expected"],
      },
      {
        code: "invalid-block-config",
        details: {
          blockId: "vault-code",
          blockType: "code",
          nodeId: "foyer",
          validationCode: "invalid_type",
        },
        layer: "compatibility",
        message: 'Block "vault-code" has invalid config for type "code".',
        path: ["graph", "nodes", 0, "blocks", 0, "config", "maxAttempts"],
      },
    ]);
  });

  it("rejects unknown condition names and missing published engine majors", () => {
    const bundle = createValidStoryBundleFixture();
    const conditionalEdge = bundle.graph.nodes[1]?.edges[0];

    if (
      !conditionalEdge?.condition ||
      conditionalEdge.condition.type !== "check"
    ) {
      throw new Error(
        "Expected archive-door edge to include a check condition.",
      );
    }

    conditionalEdge.condition.condition = "mystery-check";

    expect(
      validateStoryBundleCompatibility(bundle, {
        currentEngineMajor: 0,
        mode: "runtime",
      }),
    ).toEqual([
      {
        code: "unknown-condition-name",
        details: {
          conditionName: "mystery-check",
          edgeId: "archive-to-vault",
          nodeId: "archive-door",
        },
        layer: "compatibility",
        message: 'Condition "mystery-check" is not registered in the engine.',
        path: ["graph", "nodes", 1, "edges", 0, "condition", "condition"],
      },
      {
        code: "missing-engine-major",
        details: {
          currentEngineMajor: 0,
          mode: "runtime",
        },
        layer: "compatibility",
        message: "Bundle engine major is required for runtime validation.",
        path: ["version", "engineMajor"],
      },
    ]);
  });
});
