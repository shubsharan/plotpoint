import type { StoryBundle } from '../../story-bundles/schema.js';
import { storyBundleSchema } from '../../story-bundles/schema.js';

const validStoryBundleSeed: StoryBundle = {
  metadata: {
    storyId: 'story-the-stolen-ledger',
    title: 'The Stolen Ledger',
    summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
  },
  roles: [
    {
      id: 'detective',
      title: 'Detective',
      description: 'Leads the investigation through the core puzzle path.',
    },
    {
      id: 'archivist',
      title: 'Archivist',
      description: 'Carries the historical context needed to decode clues.',
    },
  ],
  graph: {
    entryNodeId: 'foyer',
    nodes: [
      {
        id: 'foyer',
        title: 'Gallery Foyer',
        blocks: [
          {
            id: 'briefing',
            type: 'text',
            config: {
              document: {
                type: 'doc',
                children: [
                  {
                    type: 'heading',
                    level: 2,
                    children: [
                      {
                        type: 'text',
                        text: 'Briefing Note',
                      },
                    ],
                  },
                  {
                    type: 'paragraph',
                    children: [
                      {
                        type: 'text',
                        text: 'A torn ticket points toward the archive wing.',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        edges: [
          {
            id: 'foyer-to-archive',
            targetNodeId: 'archive-door',
            label: 'Head to the archive',
          },
        ],
      },
      {
        id: 'archive-door',
        title: 'Archive Door',
        blocks: [
          {
            id: 'vault-code',
            type: 'code',
            config: {
              maxAttempts: 5,
              mode: 'passcode',
              expected: '1847',
            },
          },
          {
            id: 'suspect-theory',
            type: 'single-choice',
            config: {
              prompt: 'Who had access to the archive key?',
              options: [
                {
                  id: 'curator',
                  label: 'Curator',
                },
                {
                  id: 'archivist',
                  label: 'Archivist',
                },
              ],
              correctOptionId: 'archivist',
            },
          },
        ],
        edges: [
          {
            id: 'archive-to-vault',
            targetNodeId: 'vault',
            label: 'Open the archive vault',
            condition: {
              type: 'check',
              condition: 'field-equals',
              params: {
                blockId: 'vault-code',
                field: 'solved',
                value: true,
              },
            },
          },
        ],
      },
      {
        id: 'vault',
        title: 'Archive Vault',
        blocks: [
          {
            id: 'find-ledger',
            type: 'location',
            config: {
              target: {
                kind: 'coordinates',
                lat: 37.7749,
                lng: -122.4194,
              },
              radiusMeters: 25,
              ui: {
                variant: 'compass',
              },
              hint: 'Stand beneath the central skylight.',
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
      storyId: 'story-the-stolen-ledger',
      title: 'The Stolen Ledger',
    },
    roles: [],
    graph: {
      entryNodeId: 'foyer',
      nodes: [
        {
          id: 'foyer',
          title: 'Gallery Foyer',
          blocks: [
            {
              id: 'entry-clue',
              type: 'clue',
              config: 'not-an-object',
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
      storyId: 'story-empty-condition',
      title: 'Empty Condition Story',
    },
    roles: [],
    graph: {
      entryNodeId: 'foyer',
      nodes: [
        {
          id: 'foyer',
          title: 'Gallery Foyer',
          blocks: [],
          edges: [
            {
              id: 'foyer-to-vault',
              targetNodeId: 'vault',
              condition: {
                type: 'and',
                children: [],
              },
            },
          ],
        },
        {
          id: 'vault',
          title: 'Archive Vault',
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
  invalidBlockConfig: {
    metadata: {
      storyId: 'story-invalid-code-config',
      title: 'Invalid Code Config Story',
    },
    roles: [],
    graph: {
      entryNodeId: 'foyer',
      nodes: [
        {
          id: 'foyer',
          title: 'Gallery Foyer',
          blocks: [
            {
              id: 'vault-code',
              type: 'code',
              config: {
                mode: 'passcode',
                maxAttempts: 'five',
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
  },
} as const;

export const invalidStoryBundleFixtures: Readonly<{
  emptyConditionChildren: unknown;
  invalidBlockConfig: unknown;
  malformedShape: unknown;
}> = invalidStoryBundleFixturesInternal;

export const createStructurallyInvalidStoryBundleFixture = (): StoryBundle => {
  const bundle = createValidStoryBundleFixture();

  bundle.graph.nodes.push({
    id: 'archive-door',
    title: 'Duplicate Archive Door',
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
    id: 'mystery-device',
    type: 'mystery-device',
    config: {},
  });

  bundle.version.engineMajor = 9;

  return bundle;
};
