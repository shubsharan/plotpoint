import type { StoryBundle } from "../../story-bundles/schema.js";
import { storyBundleSchema } from "../../story-bundles/schema.js";

const validStoryBundleSeed: StoryBundle = {
  metadata: {
    storyId: "story-the-stolen-ledger",
    title: "The Stolen Ledger",
    summary: "Track the missing ledger from the gallery foyer to the archive vault.",
  },
  roles: [
    {
      id: "detective",
      title: "Detective",
      description: "Leads the investigation through the core puzzle path.",
    },
    {
      id: "archivist",
      title: "Archivist",
      description: "Carries the historical context needed to decode clues.",
    },
  ],
  graph: {
    entryNodeId: "foyer",
    nodes: [
      {
        id: "foyer",
        title: "Gallery Foyer",
        blocks: [
          {
            id: "entry-clue",
            type: "clue",
            config: {
              clueId: "entry-ticket",
              text: "A torn ticket points toward the archive wing.",
            },
          },
        ],
        edges: [
          {
            id: "foyer-to-archive",
            targetNodeId: "archive-door",
            label: "Head to the archive",
          },
        ],
      },
      {
        id: "archive-door",
        title: "Archive Door",
        blocks: [
          {
            id: "vault-lock",
            type: "locked-door",
            config: {
              correctCode: "1847",
              maxAttempts: 5,
            },
          },
        ],
        edges: [
          {
            id: "archive-to-vault",
            targetNodeId: "vault",
            label: "Open the archive vault",
            condition: {
              type: "check",
              condition: "field-equals",
              params: {
                blockId: "vault-lock",
                field: "locked",
                value: false,
              },
            },
          },
        ],
      },
      {
        id: "vault",
        title: "Archive Vault",
        blocks: [
          {
            id: "vault-timer",
            type: "timer",
            config: {
              durationSeconds: 180,
            },
          },
        ],
        edges: [],
      },
    ],
  },
  version: {
    schemaVersion: 1,
    engineMajor: null,
  },
};

export const validStoryBundleFixture: StoryBundle = storyBundleSchema.parse(validStoryBundleSeed);

export const createValidStoryBundleFixture = (): StoryBundle =>
  JSON.parse(JSON.stringify(validStoryBundleFixture)) as StoryBundle;

const invalidStoryBundleFixturesInternal = {
  malformedShape: {
    metadata: {
      storyId: "story-the-stolen-ledger",
      title: "The Stolen Ledger",
    },
    roles: [],
    graph: {
      entryNodeId: "foyer",
      nodes: [
        {
          id: "foyer",
          title: "Gallery Foyer",
          blocks: [
            {
              id: "entry-clue",
              type: "clue",
              config: "not-an-object",
            },
          ],
          edges: [],
        },
      ],
    },
    version: {
      schemaVersion: 1,
      engineMajor: null,
    },
  },
  emptyConditionChildren: {
    metadata: {
      storyId: "story-empty-condition",
      title: "Empty Condition Story",
    },
    roles: [],
    graph: {
      entryNodeId: "foyer",
      nodes: [
        {
          id: "foyer",
          title: "Gallery Foyer",
          blocks: [],
          edges: [
            {
              id: "foyer-to-vault",
              targetNodeId: "vault",
              condition: {
                type: "and",
                children: [],
              },
            },
          ],
        },
        {
          id: "vault",
          title: "Archive Vault",
          blocks: [],
          edges: [],
        },
      ],
    },
    version: {
      schemaVersion: 1,
      engineMajor: null,
    },
  },
} as const;

export const invalidStoryBundleFixtures: Readonly<{
  emptyConditionChildren: unknown;
  malformedShape: unknown;
}> = invalidStoryBundleFixturesInternal;

export const createStructurallyInvalidStoryBundleFixture = (): StoryBundle => {
  const bundle = createValidStoryBundleFixture();

  bundle.graph.nodes.push({
    id: "archive-door",
    title: "Duplicate Archive Door",
    blocks: [],
    edges: [],
  });

  return bundle;
};

export const createCompatibilityInvalidStoryBundleFixture = (): StoryBundle => {
  const bundle = createValidStoryBundleFixture();
  const firstNode = bundle.graph.nodes[0];

  if (!firstNode) {
    return bundle;
  }

  firstNode.blocks.push({
    id: "mystery-device",
    type: "mystery-device",
    config: {},
  });

  bundle.version.engineMajor = 9;

  return bundle;
};
