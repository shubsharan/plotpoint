| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Source**      | [Hexagonal + Feature-Slice Architecture](https://www.notion.so/321997b3842e815c9c79ecdfc2f0e06d) |
| **Type**        | Architecture                                                                                     |
| **Domains**     | Engine, API, Data Model, Mobile                                                                  |
| **Last synced** | 2026-04-15                                                                                       |

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
│   │   │   ├── conditions.ts          Authored condition tree helpers and validation primitives
│   │   │   ├── traversal.ts           Edge evaluation against block states
│   │   │   └── validation.ts          Story graph integrity checks
│   │   ├── blocks/
│   │   │   ├── contracts.ts           Block behavior and traversal fact contracts
│   │   │   ├── definitions/
│   │   │   │   ├── text.ts            Text block definition
│   │   │   │   ├── location.ts        Location block definition
│   │   │   │   ├── code.ts            Code block definition
│   │   │   │   ├── single-choice.ts   Single-choice block definition
│   │   │   │   └── multi-choice.ts    Multi-choice block definition
│   │   │   └── registry.ts            Block registry lookup
│   │   ├── runtime/
│   │   │   ├── commands/
│   │   │   │   ├── start-session.ts   Creates a RuntimeFrame from published story + runtime state
│   │   │   │   ├── load-session.ts    Rehydrates adapter-supplied SessionState
│   │   │   │   ├── submit-action.ts   Applies block execution to SessionState
│   │   │   │   └── traverse.ts        Advances SessionState across graph edges
│   │   │   ├── context/
│   │   │   │   ├── story-context.ts   Story loading, role/node lookup, input parsing
│   │   │   │   └── block-resolution.ts Effective block config/state resolution
│   │   │   ├── contracts/
│   │   │   │   ├── session-state.ts   Persisted SessionState contract
│   │   │   │   ├── runtime-view.ts    Derived RuntimeView contract
│   │   │   │   ├── runtime-frame.ts   RuntimeFrame envelope contract
│   │   │   │   └── command-inputs.ts  Runtime command input contracts
│   │   │   ├── projection/
│   │   │   │   ├── view-projection.ts RuntimeView derivation
│   │   │   │   └── frame-builder.ts   RuntimeFrame assembly
│   │   │   ├── state/
│   │   │   │   └── block-state-bucket.ts State bucket read/write helpers
│   │   │   ├── traversal/
│   │   │   │   └── condition-evaluator.ts Edge evaluation against traversal facts
│   │   │   └── types.ts               SessionState, RuntimeFrame, and progression types
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
import submitAction from './routes/perform-block-action';
import traverse from './routes/traverse-edge';
import { storiesRoutes } from './routes/stories/router';

export const engine = createEngine({
  storyPackageRepo,
  clock: { now: () => new Date() },
});

const app = new Hono();
app.route('/api', submitAction);
app.route('/api', traverse);
app.route('/stories', storiesRoutes);

export default app;
```

```typescript
// engine/index.ts
import type { Clock, LocationReader, StoryPackageRepo } from './ports';
import { loadSession } from './runtime/commands/load-session';
import { startSession } from './runtime/commands/start-session';
import { submitAction } from './runtime/commands/submit-action';
import { traverse } from './runtime/commands/traverse';

type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: Clock;
  locationReader?: LocationReader;
};

export const createEngine = (ports: EnginePorts) => ({
  startSession: (input: {
    storyId: string;
    sessionId: string;
    playerId: string;
    roleId: string;
  }) => startSession(ports, input),

  loadSession: (input: {
    state: SessionState;
  }) => loadSession(ports, input),

  submitAction: (input: {
    state: SessionState;
    blockId: string;
    action: BlockAction;
  }) => submitAction(ports, input),

  traverse: (input: {
    state: SessionState;
    edgeId: string;
  }) => traverse(ports, input),
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
// engine/blocks/definitions/code.ts

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

The registry in `blocks/registry.ts` maps block type names to engine-owned definitions. Each entry combines pure block behavior with runtime policy that says which state bucket the block owns and which host-backed context values it may read. Adding a new block type still means creating one definition file and adding one import to the registry.

```typescript
// engine/blocks/registry.ts
import { codeBlockBehavior } from './definitions/code';
import { locationBlockBehavior } from './definitions/location';
import type { BlockRegistryEntry } from './contracts';

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

## Runtime Session Model

Plotpoint has two related session/runtime concepts. The adapter-owned session aggregate tracks membership, shared-state durability, and resume metadata for a co-op run. Engine `SessionState` is one player's resumable runtime inside that broader session. Player-scoped state tracks an individual player's progress through a story, while shared state tracks world state that every player in the same session can read and affect. FEAT-0006 keeps the engine portion of that boundary as a runtime contract, while durable session persistence and sync policy are deferred to later adapters.

### SessionState

```typescript
type SessionState = {
  playerId: string;
  roleId: string;
  storyId: string;
  storyPackageVersionId: string;
  sessionId: string;
  currentNodeId: string;
  playerState: {
    blockStates: Record<string, unknown>;
  };
  sharedState: {
    blockStates: Record<string, unknown>;
  };
};

type RuntimeView = {
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

type RuntimeFrame = {
  state: SessionState;
  view: RuntimeView;
};
```

`SessionState` is the authoritative, resumable engine state for one player and stores only sparse progression facts. `RuntimeView` is a derived hydration projection used for rendering and navigation. `RuntimeFrame` is the command return envelope that combines both as `{ state, view }`.

Later session persistence reconstructs one engine `SessionState` from adapter-owned session records such as session metadata, membership, shared sparse state, and player sparse state rather than persisting the full runtime as one opaque blob.

When processing a block action, the engine reads the relevant bucket from the current `SessionState`, determines the target block's runtime policy, updates the correct bucket, then produces a new `RuntimeFrame` with refreshed `view.currentNode` hydration and `view.traversableEdges`. When processing traversal, the engine validates the selected edge, updates `currentNodeId`, and returns a fresh frame whose `view.currentNode.blocks[*].state` values resolve from persisted state or deterministic block defaults.

## Condition System

Edges in the story graph can have conditions that determine whether a player can traverse them. Conditions are stored as a tree of AND/OR combinators with fact leaves that reference block-exported traversal facts.

### Condition Tree Structure

```typescript
type Condition =
  | { type: 'always' };
  | { type: 'and'; children: Condition[] }
  | { type: 'or'; children: Condition[] }
  | { type: 'fact'; blockId: string; fact: string }
  | {
      type: 'fact';
      blockId: string;
      fact: string;
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      value: boolean | number | string;
    };
```

### Traversal Fact View

Each block type exports a small set of stable traversal facts from its effective `state + config`. Traversal stays generic: it evaluates boolean composition and primitive comparisons only. Block-specific semantics remain inside block-owned fact projectors.

The runtime resolves facts through one command-scoped view that:
- indexes blocks by authored `blockId`
- routes reads through block policy (`playerState` vs `sharedState`)
- hydrates effective state from persisted state or deterministic `initialState(config)`
- memoizes hydrated block runtime and derived fact values per command

### Edge Evaluation

```typescript
export const deriveTraversableEdgesOrThrow = (
  story: StoryPackage,
  state: SessionState,
  node: StoryNode,
): TraversableEdge[] => {
  const resolver = createTraversalFactResolver(story, state);

  return node.edges
    .filter((edge) => !edge.condition || evaluateConditionOrThrow(edge.condition, resolver))
    .map((edge) => ({
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
    }));
};
```

### Example: Compound Condition

"The player can enter the final room if they have the master key, OR if they've unlocked the puzzle AND at least 3 clues have been found." Stored in the story package as:

```json
{
  "type": "or",
  "children": [
    {
      "type": "fact",
      "blockId": "master-key",
      "fact": "found"
    },
    {
      "type": "and",
      "children": [
        {
          "type": "fact",
          "blockId": "puzzle",
          "fact": "unlocked"
        },
        {
          "type": "fact",
          "blockId": "clue-board",
          "fact": "clueCount",
          "operator": "gte",
          "value": 3
        }
      ]
    }
  ]
}
```

## Runtime Lifecycle: Block Action and Edge Traversal

A complete trace of a player submitting an unlock code to a locked door and then moving through the newly opened edge, first in mobile-local execution and then through an API host if server-backed orchestration is involved.

### 1. Mobile App

Player taps "Enter Code", types "1847", hits submit. The mobile app calls `engine.submitAction()` against the current runtime state it is carrying for offline play. If the host is API-backed, the app POSTs the current runtime state payload, `blockId`, and action payload to `/actions`, where a route-local DTO schema validates transport details before delegating to the same engine surface. After the response comes back with refreshed `view.traversableEdges`, the shell decides whether to present a navigation choice and, when the player selects one, calls `engine.traverse()`.

### 2. API Route

The route in `routes/perform-block-action.ts` parses the request, validates with Zod, and calls `engine.submitAction({ state, blockId, action })`. A sibling traversal route does the same for `engine.traverse({ state, edgeId })`. The routes don't know about blocks, graphs, or game logic.

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
  const result = await engine.submitAction({ state, blockId, action });

  return c.json(result);
});

export default app;
```

### 3. Engine Runtime Commands

The engine keeps block interaction and graph movement as separate commands:

```typescript
// engine/runtime/commands/submit-action.ts
export const submitAction = async (ports: EnginePorts, input: SubmitActionInput) => {
  const { state, blockId, action } = parseRuntimeInputOrThrow(submitActionInputSchema, input);
  const { currentNode, story, targetBlock } = await resolveSessionContextOrThrow(ports, state, {
    blockId,
  });
  const nextState = await applyBlockActionOrThrow({
    action,
    blockId,
    state,
    targetBlock,
    currentNode,
  });
  const hydratedCurrentNode = createCurrentNodeViewOrThrow(nextState, currentNode);

  return createRuntimeFrame(
    nextState,
    createRuntimeView(
      hydratedCurrentNode,
      deriveTraversableEdgesOrThrow(story, nextState, currentNode),
    ),
  );
};

// engine/runtime/commands/traverse.ts
export const traverse = async (ports: EnginePorts, input: TraverseInput) => {
  const { edgeId, state } = parseRuntimeInputOrThrow(traverseInputSchema, input);
  const { story, targetEdge } = await resolveSessionContextOrThrow(ports, state, {
    edgeId,
  });
  const nextNode = getNodeOrThrow(story, targetEdge.targetNodeId);
  const nextState = { ...state, currentNodeId: nextNode.id };
  const hydratedCurrentNode = createCurrentNodeViewOrThrow(nextState, nextNode);

  return createRuntimeFrame(
    nextState,
    createRuntimeView(
      hydratedCurrentNode,
      deriveTraversableEdgesOrThrow(story, nextState, nextNode),
    ),
  );
};
```

### 4. Block Action (Pure)

The registry looks up `code` and calls its `onAction()` with parsed state, parsed action, parsed config, and value-only context. The code matches. It returns a new block state with the latest submission recorded and `unlocked: true`. No I/O occurs.

### 5. Edge Evaluation (Pure)

After `submitAction`, the engine recomputes `view.traversableEdges` for the current node. With the puzzle now solved, a fact condition like `{ type: 'fact', blockId: 'vault-code', fact: 'unlocked' }` passes, making the authored edge available. When the player selects that option, the shell calls `traverse`, and the engine changes `currentNodeId` only through that command.

### 6. Response

Each command returns the next `RuntimeFrame`, which an API route can serialize or a mobile host can use directly. The mobile app receives the updated frame, the block renderer registry maps `code` to its renderer, and it re-renders from the hydrated `view.currentNode` projection while persisting only the sparse `SessionState` subset if it wants a durable save.

### Full Call Chain

```
Phone
  → engine.submitAction()           (public API, mobile-local host)
    → runtime/commands/submit-action.ts   (orchestrates block interaction)
      → blocks/definitions/code.ts        (pure onAction transition)
      → runtime/context/block-resolution.ts (resolves effective block state)
      → runtime/projection/view-projection.ts (hydrates currentNode + traversableEdges)

  → engine.traverse()                 (public API, mobile-local host)
    → runtime/commands/traverse.ts        (changes current node)
      → runtime/projection/view-projection.ts (hydrates next currentNode + traversableEdges)

API host
  → routes/perform-block-action.ts         (validates, delegates)
    → engine.submitAction()          (same public API)
  → routes/traverse-edge.ts                (validates, delegates)
    → engine.traverse()                (same public API)
```

## Versioning

The engine uses semver. The major version is what gets stamped into published story packages. A story published against engine v2 runs on any engine 2.x.x. It breaks only on engine 3.0.0, at which point the migration chain runs.

### Semver Mapping

**Major:** Breaking changes to story package interpretation. Changing authored condition leaves, restructuring graph traversal, altering block state machine behavior. Requires a migration function.

**Minor:** Backwards-compatible additions. New block types, new block-exported facts, new optional fields that default gracefully. Old stories unaffected.

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
  const result = await engine.submitAction({
    state: {
      playerId: 'player-1',
      roleId: 'detective',
      storyId: 'story-1',
      storyPackageVersionId: 'pkg-1',
      sessionId: 'session-1',
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
