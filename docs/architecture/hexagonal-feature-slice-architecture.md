| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Source**      | [Hexagonal + Feature-Slice Architecture](https://www.notion.so/321997b3842e815c9c79ecdfc2f0e06d) |
| **Type**        | Architecture                                                                                     |
| **Domains**     | Engine, API, Data Model, Mobile                                                                  |
| **Last synced** | 2026-03-30                                                                                       |

## Repository Structure

The Plotpoint monorepo is organized into apps (deployable applications) and packages (shared libraries). The architecture follows hexagonal principles for the engine and feature-slice organization for the API.

Current foundation note: FEAT-0001 only finalizes the monorepo shape, package naming, and shared config ownership. The tree and code examples below describe the intended target structure that later features will fill in. During the scaffold phase, placeholder entrypoints are acceptable as long as package ownership and dependency direction stay clear.

Current scaffold baseline: the checked-in foundation workspace contains only `apps/api`, `apps/mobile`, `packages/db`, `packages/engine`, and `packages/config`. Future shared UI or shared types packages should not be added until a later feature explicitly specs their ownership.

## Documentation Contract

- `docs/index.md` is the authoritative current-state document for epic and feature work status.
- `docs/product/` captures strategy and roadmap sequencing.
- `docs/architecture/` captures durable technical boundaries and implementation direction.
- `docs/epics/`, `docs/features/`, and `docs/adrs/` capture scoped design records and trade-off decisions.

## Canonical Glossary

- `Story`: the business entity record (`id`, title, summary, status, timestamps, and package pointers).
- `StoryPackage`: the engine-readable serialized payload consumed by validation and runtime.
- `PublishedStoryPackageVersion`: internal-only immutable published record that wraps a `StoryPackage` version for publish/runtime persistence.
- `Story.status`: the lifecycle authority (`draft`, `published`, `archived`); do not model `StoryDraft` and `PublishedStory` as separate top-level type families.

```
apps/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── start-session.ts        POST /sessions/start
│   │   │   ├── perform-block-action.ts POST /actions
│   │   │   ├── traverse-edge.ts        POST /traverse
│   │   │   ├── stories/
│   │   │   │   ├── route.ts           GET/POST/PUT/PATCH/DELETE /stories*
│   │   │   │   └── contracts.ts       Route-local request + error response contracts
│   │   │   ├── publish-story.ts        POST /stories/:id/publish
│   │   ├── middleware.ts               Auth, rate limiting, error handling
│   │   └── server.ts                   App setup, engine creation, route mounting
│   └── package.json
│
├── mobile/
│   ├── src/
│   │   ├── components/
│   │   │   ├── block-renderers/
│   │   │   │   ├── text.tsx            Renders text block state
│   │   │   │   ├── location.tsx        Renders location block state
│   │   │   │   ├── code.tsx            Renders code block state
│   │   │   │   ├── single-choice.tsx   Renders single-choice block state
│   │   │   │   ├── multi-choice.tsx    Renders multi-choice block state
│   │   │   │   └── registry.tsx        Maps block type names to renderers
│   │   │   └── ui/                     Shared design system components
│   │   └── (rest of Expo app)
│   └── package.json
│
packages/
├── engine/
│   ├── src/
│   │   ├── graph/
│   │   │   ├── types.ts               StoryGraph, StoryNode, Edge,
│   │   │   │                           BlockInstance, Condition types
│   │   │   ├── conditions.ts          Named condition function registry
│   │   │   ├── traversal.ts           Edge evaluation against block states
│   │   │   └── validation.ts          Story graph integrity checks
│   │   ├── blocks/
│   │   │   ├── text.ts              Config schema + runtime definition metadata
│   │   │   ├── location.ts          Config schema + runtime definition metadata
│   │   │   ├── code.ts              Config schema + runtime definition metadata
│   │   │   ├── single-choice.ts     Config schema + runtime definition metadata
│   │   │   ├── multi-choice.ts      Config schema + runtime definition metadata
│   │   │   └── index.ts             Block registry lookup
│   │   ├── runtime/
│   │   │   ├── start-game.ts         Creates a RuntimeSnapshot from published story + runtime state
│   │   │   ├── load-runtime.ts       Rehydrates adapter-supplied RuntimeState
│   │   │   ├── perform-block-action.ts Applies block execution to RuntimeState
│   │   │   ├── traverse-edge.ts        Advances RuntimeState across graph edges
│   │   │   └── types.ts              RuntimeState, RuntimeSnapshot, and progression types
│   │   ├── ports.ts                   Abstract dependency types
│   │   └── index.ts                   Public API: createEngine()
│   └── package.json
│
├── db/
│   ├── src/
│   │   ├── schema/
│   │   │   ├── stories.ts             Drizzle table definition
│   │   │   ├── players.ts             Drizzle table definition
│   │   │   ├── user-saves.ts          Drizzle table definition
│   │   │   ├── game-saves.ts          Drizzle table definition
│   │   │   └── index.ts               Barrel export
│   │   ├── stories.ts                 Queries + mutations for stories
│   │   ├── players.ts                 Queries + mutations for players
│   │   ├── user-saves.ts              Queries + mutations for user saves
│   │   ├── game-saves.ts              Queries + mutations for game saves
│   │   ├── repos/
│   │   │   ├── story-package-repo.ts          Implements engine StoryPackageRepo port
│   │   │   ├── user-save-repo.ts      Implements engine UserSaveRepo port
│   │   │   ├── game-save-repo.ts      Implements engine GameSaveRepo port
│   │   │   └── index.ts               Barrel export
│   │   ├── client.ts                  Supabase + Drizzle connection setup
│   │   └── index.ts                   Barrel export
│   └── package.json
│
├── config/
│   ├── tsconfig/
│   │   ├── base.json                  Shared TypeScript config
│   │   ├── api.json                   API-specific overrides
│   │   ├── mobile.json                Mobile-specific overrides
│   │   └── library.json               Library package overrides
│   └── oxlint.json                    Shared oxlint config
```

## Dependency Flow

The dependency direction is the most important architectural invariant to protect. The engine depends on nothing. Mobile and API both depend inward toward the engine, while only API owns database wiring. The engine owns domain contracts and ports (including `StoryPackage` and runtime snapshots), while adapters own transport DTO schemas.

```
mobile  →  engine
api     →  engine
api     →  db
```

The engine's runtime execution code imports nothing from outside its own package. Mobile can execute the engine directly for offline play. The API also imports from the engine to host runtime execution or orchestrate sync flows, and it imports from `db` for publish, catalog, and later session persistence concerns. If the engine ever imports from `db`, the hexagonal boundary is broken.

## Engine Ports

Ports are the abstract interfaces the engine defines for its external dependencies. They live in `engine/ports.ts` as TypeScript types. Any object matching the shape satisfies the port — no `implements` keyword needed thanks to structural typing.

### Port Definitions

```typescript
// engine/ports.ts

export type StoryPackageRepo = {
  getPublishedPackage: (storyId: string) => Promise<StoryPackage>;
};

export type Clock = {
  now: () => Date;
};

export type GeoCoord = {
  lat: number;
  lng: number;
};

export type LocationReader = {
  getCurrent: (playerId: string) => Promise<GeoCoord | null>;
};
```

### Port Implementation (Adapters)

Ports are intentionally narrow so mobile-local and API-hosted adapters can both satisfy them:

```typescript
// mobile/runtime-adapters.ts
import type { Clock, LocationReader } from '@plotpoint/engine';

export const deviceClock: Clock = {
  now: () => new Date(),
};

export const deviceLocationReader: LocationReader = {
  getCurrent: async (_playerId) => null,
};
```

### Engine Creation

The engine is created wherever a host needs gameplay execution. Mobile can construct it directly for offline play. The API can also construct it in `server.ts` alongside app setup. Routes import the engine directly — no route-level dependency injection needed.

```typescript
// api/server.ts
import { Hono } from 'hono';
import { createEngine } from '@plotpoint/engine';
import { storyPackageRepo } from '@plotpoint/db/repos';
import performBlockAction from './routes/perform-block-action';
import traverseEdge from './routes/traverse-edge';
import { storiesRoutes } from './routes/stories/router';

export const engine = createEngine({
  storyPackageRepo,
  clock: { now: () => new Date() },
});

const app = new Hono();
app.route('/api', performBlockAction);
app.route('/api', traverseEdge);
app.route('/stories', storiesRoutes);

export default app;
```

```typescript
// engine/index.ts
import type { Clock, LocationReader, StoryPackageRepo } from './ports';
import { loadRuntime } from './runtime/load-runtime';
import { startGame } from './runtime/start-game';
import { performBlockAction } from './runtime/perform-block-action';
import { traverseEdge } from './runtime/traverse-edge';

type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock;
  locationReader?: LocationReader;
};

export const createEngine = (ports: EnginePorts) => ({
  startGame: (input: {
    storyId: string;
    gameId: string;
    playerId: string;
    roleId: string;
  }) => startGame(ports, input),

  loadRuntime: (input: {
    state: RuntimeState;
  }) => loadRuntime(ports, input),

  performBlockAction: (input: {
    state: RuntimeState;
    blockId: string;
    action: BlockAction;
  }) => performBlockAction(ports, input),

  traverseEdge: (input: {
    state: RuntimeState;
    edgeId: string;
  }) => traverseEdge(ports, input),
});
```

## Blocks

Blocks are the interactive building blocks of a story. Each block exports a `State` type, an `Action` type, an `initialState`, an `actionSchema`, and an `onAction` function. Runtime bucket policy stays in the engine registry. `onAction` is pure: given state + action + config + value-only context, return new state. No I/O, no side effects.

A `BlockInstance` is a specific usage of a block type within a story node, configured by the story author. The block definition is the template (`code` logic). The instance is a specific puzzle in a specific story with a specific expected answer.

```typescript
// engine/graph/types.ts

type BlockInstance = {
  id: string; // authored instance id: "front-door"
  type: string; // which block definition: "code"
  config: unknown; // author's settings: { expected: "1847", mode: "passcode" }
};
```

Canonical authored JSON stores nodes, blocks, and edges as ordered arrays. Runtime lookup tables are an engine concern after load, not part of the serialized story package contract.

### Player-State Block Example

```typescript
// engine/blocks/code.ts

import { z } from 'zod';
import { defineBlockBehavior, type InteractiveBlockBehavior } from './types';

type CodeBlockConfig = {
  expected: string;
  maxAttempts?: number;
  mode: 'passcode' | 'password';
};

type CodeBlockAction = {
  type: 'submit';
  value: string;
};

type CodeBlockState = {
  attempts: CodeBlockAction[];
  unlocked: boolean;
};

const codeConfigSchema = z.object({
  expected: z.string().min(1),
  maxAttempts: z.number().int().positive().optional(),
  mode: z.enum(['passcode', 'password']),
});

const codeActionSchema = z.object({
  type: z.literal('submit'),
  value: z.string(),
});

const codeStateSchema = z.object({
  attempts: z.array(codeActionSchema),
  unlocked: z.boolean(),
});

export const codeBlockBehavior: InteractiveBlockBehavior<
  CodeBlockConfig,
  CodeBlockState,
  CodeBlockAction
> = defineBlockBehavior({
  configSchema: codeConfigSchema,
  stateSchema: codeStateSchema,
  actionSchema: codeActionSchema,
  initialState: () => ({
    attempts: [],
    unlocked: false,
  }),
  interactive: true,
  onAction: (state, action, _context, config) => {
    const isCorrect = action.value === config.expected;
    return {
      attempts: [...state.attempts, action],
      unlocked: state.unlocked || isCorrect,
    };
  },
});
```

### Block Registry

The registry in `blocks/index.ts` maps block type names to engine-owned definitions. Each entry combines pure block behavior with runtime policy that says which state bucket the block owns and which host-backed context values it may read. Adding a new block type still means creating one file and adding one import to the registry.

```typescript
// engine/blocks/index.ts
import { codeBlockBehavior } from './code';
import { locationBlockBehavior } from './location';
import type { BlockRegistryEntry } from './types';

const registry: Record<string, BlockRegistryEntry> = {
  code: {
    behavior: codeBlockBehavior,
    policy: {
      stateType: 'playerState',
      requiredContext: ['nowIso'],
    },
  },
  location: {
    behavior: locationBlockBehavior,
    policy: {
      stateType: 'playerState',
      requiredContext: ['playerLocation', 'nowIso'],
    },
  },
};

export const getBlockDefinition = (blockType: string): BlockRegistryEntry | undefined =>
  registry[blockType];
```

## Runtime Snapshot Model

Plotpoint has two kinds of engine-owned runtime state. Player-scoped state tracks an individual player's progress through a story. Shared state tracks world state that every player in the same game instance can read and affect. FEAT-0006 keeps these as engine contracts, while durable persistence and sync policy are deferred to later adapters.

### RuntimeState

```typescript
type RuntimeState = {
  playerId: string;
  roleId: string;
  storyId: string;
  storyPackageVersionId: string;
  gameId: string;
  currentNodeId: string;
  playerState: {
    blockStates: Record<string, unknown>;
  };
  sharedState: {
    blockStates: Record<string, unknown>;
  };
};

type RuntimeSnapshot = RuntimeState & {
  currentNode: {
    id: string;
    title: string;
    blocks: Array<{
      id: string;
      type: string;
      interactive: boolean;
      config: Record<string, unknown>;
      state: unknown;
    }>;
  };
  traversableEdges: TraversableEdge[];
};
```

`RuntimeState` is the authoritative, resumable engine state and stores only sparse progression facts. `RuntimeSnapshot` is the engine-computed result view returned after startup, rehydration, block action execution, or edge traversal.

When processing a block action, the engine reads the relevant bucket from the current `RuntimeState`, determines the target block's runtime policy, updates the correct bucket, then produces a new `RuntimeSnapshot` with refreshed `currentNode` hydration and `traversableEdges`. When processing traversal, the engine validates the selected edge, updates `currentNodeId`, and returns a fresh snapshot whose `currentNode.blocks[*].state` values resolve from persisted state or deterministic block defaults.

## Condition System

Edges in the story graph can have conditions that determine whether a player can traverse them. Conditions are stored as a tree of AND/OR combinators with leaf nodes that reference named condition functions from the engine's registry.

### Condition Tree Structure

```typescript
type Condition =
  | {
      type: 'check';
      condition: string; // name from registry
      params: Record<string, unknown>; // author-configured
    }
  | { type: 'and'; children: Condition[] }
  | { type: 'or'; children: Condition[] }
  | { type: 'always' };
```

### Named Condition Functions

Condition functions are real TypeScript functions in a registry in `graph/conditions.ts`. The story package stores the function name and params as JSON. The engine looks up the real function at runtime. Adding a new condition type means adding one entry to the registry.

Built-in conditions: `field-equals`, `field-compare`, `array-includes`, `array-length`, `time-elapsed`, `within-radius`.

### Edge Evaluation

```typescript
// engine/graph/traversal.ts
import { checkCondition } from './conditions';

export const evaluateEdges = (
  graph: StoryGraph,
  currentNodeId: string,
  allBlockStates: Record<string, unknown>,
  context: EvaluationContext,
): TraversableEdge[] => {
  const node = graph.nodes.find((node) => node.id === currentNodeId);
  if (!node) throw new Error(`Unknown node: ${currentNodeId}`);

  return node.edges
    .filter(
      (edge) => edge.condition === undefined || evaluate(edge.condition, allBlockStates, context),
    )
    .map((edge) => ({
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
    }));
};

const evaluate = (
  condition: Condition,
  blockStates: Record<string, unknown>,
  context: EvaluationContext,
): boolean => {
  switch (condition.type) {
    case 'always':
      return true;
    case 'check':
      return checkCondition(condition.condition, blockStates, context, condition.params);
    case 'and':
      return condition.children.every((c) => evaluate(c, blockStates, context));
    case 'or':
      return condition.children.some((c) => evaluate(c, blockStates, context));
  }
};
```

### Example: Compound Condition

"The player can enter the final room if they have the master key, OR if they've unlocked the puzzle AND at least 3 clues have been found." Stored in the story package as:

```json
{
  "type": "or",
  "children": [
    {
      "type": "check",
      "condition": "field-equals",
      "params": { "blockId": "master-key", "field": "found", "value": true }
    },
    {
      "type": "and",
      "children": [
        {
          "type": "check",
          "condition": "field-equals",
          "params": { "blockId": "puzzle", "field": "unlocked", "value": true }
        },
        {
          "type": "check",
          "condition": "array-length",
          "params": {
            "blockId": "clue-board",
            "field": "clues",
            "operator": "gte",
            "value": 3
          }
        }
      ]
    }
  ]
}
```

## Runtime Lifecycle: Block Action and Edge Traversal

A complete trace of a player submitting an unlock code to a locked door and then moving through the newly opened edge, first in mobile-local execution and then through an API host if server-backed orchestration is involved.

### 1. Mobile App

Player taps "Enter Code", types "1847", hits submit. The mobile app calls `engine.performBlockAction()` against the current runtime state it is carrying for offline play. If the host is API-backed, the app POSTs the current runtime state payload, `blockId`, and action payload to `/actions`, where a route-local DTO schema validates transport details before delegating to the same engine surface. After the response comes back with refreshed `traversableEdges`, the shell decides whether to present a navigation choice and, when the player selects one, calls `engine.traverseEdge()`.

### 2. API Route

The route in `routes/perform-block-action.ts` parses the request, validates with Zod, and calls `engine.performBlockAction({ state, blockId, action })`. A sibling traversal route does the same for `engine.traverseEdge({ state, edgeId })`. The routes don't know about blocks, graphs, or game logic.

```typescript
// api/routes/perform-block-action.ts
import { Hono } from 'hono';
import { engine } from '../server';
import { performBlockActionRequest } from './perform-block-action.dto';

const app = new Hono();

app.post('/actions', async (c) => {
  const body = await c.req.json();
  const parsed = performBlockActionRequest.safeParse(body);
  if (!parsed.success) return c.json(parsed.error, 400);

  const { state, blockId, action } = parsed.data;
  const result = await engine.performBlockAction({ state, blockId, action });

  return c.json(result);
});

export default app;
```

### 3. Engine Runtime Commands

The engine keeps block interaction and graph movement as separate commands:

```typescript
// engine/runtime/perform-block-action.ts
export const performBlockAction = async (ports: EnginePorts, input: PerformBlockActionInput) => {
  const { state, blockId, action } = parseRuntimeInputOrThrow(performBlockActionInputSchema, input);
  const { currentNode, targetBlock } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    blockId,
  });
  const nextState = await applyBlockActionOrThrow({
    action,
    blockId,
    state,
    targetBlock,
    currentNode,
  });
  const hydratedCurrentNode = createCurrentNodeSnapshotOrThrow(nextState, currentNode);

  return createRuntimeSnapshot(nextState, hydratedCurrentNode, mapTraversableEdges(currentNode));
};

// engine/runtime/traverse-edge.ts
export const traverseEdge = async (ports: EnginePorts, input: TraverseEdgeInput) => {
  const { edgeId, state } = parseRuntimeInputOrThrow(traverseEdgeInputSchema, input);
  const { story, targetEdge } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    edgeId,
  });
  const nextNode = getNodeOrThrow(story, targetEdge.targetNodeId);
  const nextState = { ...state, currentNodeId: nextNode.id };
  const hydratedCurrentNode = createCurrentNodeSnapshotOrThrow(nextState, nextNode);

  return createRuntimeSnapshot(nextState, hydratedCurrentNode, mapTraversableEdges(nextNode));
};
```

### 4. Block Action (Pure)

The registry looks up `code` and calls its `onAction()` with parsed state, parsed action, parsed config, and value-only context. The code matches. It returns a new block state with the latest submission recorded and `unlocked: true`. No I/O occurs.

### 5. Edge Evaluation (Pure)

After `performBlockAction`, the engine recomputes the current node's `traversableEdges`. With the puzzle now solved, an edge condition like `field-equals(vault-code, unlocked, true)` passes, making "Enter the corridor" available. When the player selects that option, the shell calls `traverseEdge`, and the engine changes `currentNodeId` only through that command.

### 6. Response

Each command returns the next `RuntimeSnapshot`, which an API route can serialize or a mobile host can use directly. The mobile app receives the updated snapshot, the block renderer registry maps `code` to its renderer, and it re-renders from the hydrated `currentNode` view while persisting only the sparse `RuntimeState` subset if it wants a durable save.

### Full Call Chain

```
Phone
  → engine.performBlockAction()           (public API, mobile-local host)
    → runtime/perform-block-action.ts     (orchestrates block interaction)
      → blocks/code.ts                    (pure onAction transition)
      → runtime/snapshot.ts               (hydrate currentNode + derive traversableEdges)

  → engine.traverseEdge()                 (public API, mobile-local host)
    → runtime/traverse-edge.ts            (changes current node)
      → runtime/snapshot.ts               (hydrate next currentNode + derive traversableEdges)

API host
  → routes/perform-block-action.ts         (validates, delegates)
    → engine.performBlockAction()          (same public API)
  → routes/traverse-edge.ts                (validates, delegates)
    → engine.traverseEdge()                (same public API)
```

## Versioning

The engine uses semver. The major version is what gets stamped into published story packages. A story published against engine v2 runs on any engine 2.x.x. It breaks only on engine 3.0.0, at which point the migration chain runs.

### Semver Mapping

**Major:** Breaking changes to story package interpretation. Changing how conditions evaluate, restructuring graph traversal, altering block state machine behavior. Requires a migration function.

**Minor:** Backwards-compatible additions. New block types, new condition functions, new optional fields that default gracefully. Old stories unaffected.

**Patch:** Bug fixes. Corrected edge cases, performance improvements. No contract changes.

### Migration Chain

Migrations live in `runtime/migrations.ts` as an array of pure functions. Each transforms a story package from one major version to the next. They chain: a v1 story on a v3 engine runs through v1→2 then v2→3. The original story package in storage is never modified; migration happens in memory at load time.

```typescript
const migrations = [
  {
    from: 1,
    to: 2,
    migrate: (storyPackage) => ({
      ...storyPackage,
      graph: {
        ...storyPackage.graph,
        nodes: storyPackage.graph.nodes.map((node) => ({
          ...node,
          edges: node.edges.map((edge) => ({
            ...edge,
            priority: edge.priority ?? 0,
          })),
        })),
      },
    }),
  },
];

export const migrateStoryPackage = (
  storyPackage: StoryPackage,
  fromVersion: number,
): StoryPackage => {
  let current = storyPackage;
  let version = fromVersion;

  for (const m of migrations) {
    if (m.from === version) {
      current = m.migrate(current);
      version = m.to;
    }
  }

  return current;
};
```

## Database Layer

All database logic lives in the `db` package. Schema files define Drizzle tables. Sibling files at the root of `src/` contain all queries and mutations per resource. The `repos/` folder provides thin wrappers that implement the engine's port types.

### Database Operations

API routes import operations directly for simple queries:

```typescript
// db/stories.ts
import { db } from './client';
import { stories } from './schema';

export const listStories = async (filters: StoryFilters) => {
  return db
    .select()
    .from(stories)
    .where(/* apply filters */)
    .limit(filters.limit)
    .offset(filters.offset);
};

export const getStory = async (storyId: string) => {
  const row = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  return row[0] ?? null;
};

export const createStory = async (input: CreateStoryInput) => {
  const [row] = await db.insert(stories).values(input).returning();
  return row;
};
```

### Repo Wrappers

The engine never calls database functions directly. Repos adapt them to port shapes:

```typescript
// db/repos/story-package-repo.ts
import type { StoryPackageRepo } from '@plotpoint/engine';
import { getStoryPackage } from '../stories';

export const storyPackageRepo: StoryPackageRepo = {
  getPublishedPackage: getStoryPackage,
};
```

### API Route Using Database Directly

Simple read routes skip the engine entirely and call database operations directly:

```typescript
// api/routes/stories/router.ts
import { Hono } from 'hono';
import { listStories } from '@plotpoint/db';

export const storiesRoutes = new Hono();

storiesRoutes.get('/', async (c) => {
  const stories = await listStories();
  return c.json(stories);
});
```

## Testing

The hexagonal boundary makes testing straightforward. Blocks are pure functions that test with no setup. The engine's ports can be satisfied with plain objects — no mocking libraries needed.

Current repo testing standard for story CRUD:

- `packages/db`: run query tests against real Drizzle SQL migrations on PGlite, and bind queries through `createStoryQueries(database)` so tests exercise the same query implementation used in production.
- `apps/api`: inject `StoriesRouteDeps` into `createApp` and test request/response contracts with fake deps instead of module-level mocks.
- `apps/api` seam coverage: keep a small integration suite that wires `createApp(createStoryQueries(drizzle(PGlite)))` to verify real API-to-DB behavior without duplicating all layer tests.

### Testing a Block

```typescript
import { codeBlockBehavior } from './code';

const config = codeBlockBehavior.configSchema.parse({
  expected: '1847',
  mode: 'passcode',
});

test('correct code unlocks the block', () => {
  const initialState = codeBlockBehavior.initialState(config);
  const result = codeBlockBehavior.onAction(
    initialState,
    { type: 'submit', value: '1847' },
    {},
    config,
  );

  expect(result.unlocked).toBe(true);
  expect(result.attempts).toHaveLength(1);
});

test('wrong code remains locked', () => {
  const initialState = codeBlockBehavior.initialState(config);
  const result = codeBlockBehavior.onAction(
    initialState,
    { type: 'submit', value: 'wrong' },
    {},
    config,
  );

  expect(result.unlocked).toBe(false);
  expect(result.attempts).toHaveLength(1);
});
```

### Testing with Fake Ports

```typescript
const fakeStoryPackage = {
  metadata: {
    storyId: 'story-1',
    title: 'Story Title',
  },
  roles: [
    {
      id: 'detective',
      name: 'Detective',
    },
  ],
  graph: {
    entryNodeId: 'node-1',
    nodes: [
      {
        id: 'node-1',
        title: 'Intro Node',
        blocks: [
          {
            id: 'door-1',
            type: 'code',
            config: { expected: '1847', mode: 'passcode' },
          },
        ],
        edges: [],
      },
    ],
  },
  version: {
    schemaVersion: 1,
    engineMajor: 2,
  },
};

const fakeStoryPackageRepo: StoryPackageRepo = {
  getCurrentPublishedPackage: async () => ({
    storyPackage: fakeStoryPackage,
    storyPackageVersionId: 'pkg-1',
  }),
  getPublishedPackage: async () => fakeStoryPackage,
};

const fakeClock: Clock = {
  now: () => new Date('2026-03-30T12:00:00.000Z'),
};

// Create engine with fakes
const engine = createEngine({
  storyPackageRepo: fakeStoryPackageRepo,
  clock: fakeClock,
});

test('submitting correct code unlocks door', async () => {
  const result = await engine.performBlockAction({
    state: {
      playerId: 'player-1',
      roleId: 'detective',
      storyId: 'story-1',
      storyPackageVersionId: 'pkg-1',
      gameId: 'game-1',
      currentNodeId: 'node-1',
      playerState: {
        blockStates: { 'door-1': { unlocked: false, attempts: [] } },
      },
      sharedState: {
        blockStates: {},
      },
    },
    blockId: 'door-1',
    action: {
      type: 'submit',
      value: '1847',
    },
  });
  expect(result.playerState.blockStates['door-1'].unlocked).toBe(true);
});
```

## Key Principles

**Engine depends on nothing.** The engine defines what it needs as abstract port types and receives concrete implementations at runtime. If the engine ever imports from the db package, the architecture is broken.

**Blocks are pure behaviors.** A block's `onAction` function takes state + action + config + value-only context and returns new state. No I/O, no side effects, no dependencies. Runtime snapshot orchestration stays in the engine runtime commands.

**Feature slices don't call each other.** API routes are independent vertical slices. If `publish-story` needs to update the story's status, it calls the database directly — it doesn't import from `update-story`.

**Two state buckets, one runtime snapshot.** `playerState` tracks per-player progress. `sharedState` tracks shared world state. The engine runtime commands merge both for edge evaluation so conditions can reference either scope.

**Conditions are named functions, not a custom language.** The story package stores condition names and params as JSON. The engine maps names to real TypeScript functions at runtime through a registry. Adding a new condition type means adding one function to the registry.

**All database logic lives in the db package.** Schema files define tables, sibling files define operations. Repos are thin wrappers that adapt operations to engine port shapes. API routes import operations directly for simple queries.

**Start simple, extract when it hurts.** Not every route needs a separate handler file. Not every block needs complex logic. Not every feature needs ports. The architecture scales to the complexity of each part — a thin route that calls one query is fine as a single file.
