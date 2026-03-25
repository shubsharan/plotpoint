| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Source**      | [Hexagonal + Feature-Slice Architecture](https://www.notion.so/321997b3842e815c9c79ecdfc2f0e06d) |
| **Type**        | Architecture                                                                                     |
| **Domains**     | Engine, API, Data Model, Mobile                                                                  |
| **Last synced** | 2026-03-25                                                                                       |

## Repository Structure

The Plotpoint monorepo is organized into apps (deployable applications) and packages (shared libraries). The architecture follows hexagonal principles for the engine and feature-slice organization for the API.

Current foundation note: FEAT-0001 only finalizes the monorepo shape, package naming, and shared config ownership. The tree and code examples below describe the intended target structure that later features will fill in. During the scaffold phase, placeholder entrypoints are acceptable as long as package ownership and dependency direction stay clear.

Current scaffold baseline: the checked-in foundation workspace contains only `apps/api`, `apps/mobile`, `packages/db`, `packages/engine`, and `packages/config`. Future shared UI or shared types packages should not be added until a later feature explicitly specs their ownership.

## Documentation Contract

- `docs/index.md` is the authoritative current-state document for epic and feature work status.
- `docs/product/` captures strategy and roadmap sequencing.
- `docs/architecture/` captures durable technical boundaries and implementation direction.
- `docs/epics/`, `docs/features/`, and `docs/adrs/` capture scoped design records and trade-off decisions.

```
apps/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── start-session.ts        POST /sessions/start
│   │   │   ├── submit-action.ts        POST /actions
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
│   │   │   │   ├── code-lock.tsx     Renders LockedDoorState
│   │   │   │   ├── clue.tsx            Renders ClueState
│   │   │   │   ├── timer.tsx           Renders TimerState
│   │   │   │   ├── qr-scanner.tsx      Renders QrScannerState
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
│   │   │   ├── code-lock.ts         State, Action, initialState, update()
│   │   │   ├── clue.ts                State, Action, initialState, update()
│   │   │   ├── timer.ts               State, Action, initialState, update()
│   │   │   ├── qr-scanner.ts          State, Action, initialState, update()
│   │   │   └── index.ts              Block registry + updateBlock() lookup
│   │   ├── runtime/
│   │   │   ├── executor.ts            Core gameplay loop
│   │   │   ├── save.ts                Game save management
│   │   │   ├── state-tracker.ts       Per-player state over shared state
│   │   │   └── migrations.ts          Version migration chain
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
│   │   │   ├── story-repo.ts          Implements engine StoryRepo port
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

The dependency direction is the most important architectural invariant to protect. The engine depends on nothing. Everything else depends inward toward it. The engine owns domain contracts and ports (including `StoryBundle`), while adapters own transport DTO schemas.

```
mobile  →  api  →  engine  ←  db
```

The engine's runtime execution code imports nothing from outside its own package. The `db` package imports from `engine/ports.ts` so its repos can implement those interfaces. The API imports from both `engine` and `db` to wire them together, keeps request validation plus error-response contracts route-local in `apps/api/src/routes/*`, and returns db CRUD read models directly via JSON for internal CRUD routes. If the engine ever imports from `db`, the hexagonal boundary is broken.

## Engine Ports

Ports are the abstract interfaces the engine defines for its external dependencies. They live in `engine/ports.ts` as TypeScript types. Any object matching the shape satisfies the port — no `implements` keyword needed thanks to structural typing.

### Port Definitions

```typescript
// engine/ports.ts

export type StoryRepo = {
  getBundle: (storyId: string) => Promise<StoryBundle>;
};

export type UserSaveRepo = {
  get: (saveId: string) => Promise<UserSaveState | null>;
  save: (state: UserSaveState) => Promise<void>;
};

export type GameSaveRepo = {
  get: (gameId: string) => Promise<GameSaveState | null>;
  update: (gameId: string, state: SharedBlockStates) => Promise<void>;
};

export type LocationReader = {
  getCurrent: (playerId: string) => Promise<GeoCoord | null>;
};
```

### Port Implementation (Repo)

Repos in `db/repos/` are thin wrappers that map database operation functions to the engine's port shapes:

```typescript
// db/repos/user-save-repo.ts
import type { UserSaveRepo } from '@plotpoint/engine';
import { getUserSave, upsertUserSave } from '../user-saves';

export const userSaveRepo: UserSaveRepo = {
  get: getUserSave,
  save: upsertUserSave,
};
```

### Engine Creation

The engine is created in `server.ts` alongside app setup. Routes import the engine directly — no factory functions, no dependency injection at the route level.

```typescript
// api/server.ts
import { Hono } from 'hono';
import { createEngine } from '@plotpoint/engine';
import { storyRepo, userSaveRepo, gameSaveRepo } from '@plotpoint/db/repos';
import submitAction from './routes/submit-action';
import { storiesRoutes } from './routes/stories/router';

export const engine = createEngine({ storyRepo, userSaveRepo, gameSaveRepo });

const app = new Hono();
app.route('/api', submitAction);
app.route('/stories', storiesRoutes);

export default app;
```

```typescript
// engine/index.ts
import type { StoryRepo, UserSaveRepo, GameSaveRepo } from './ports';
import { executeAction } from './runtime/executor';
import { startNewGame } from './runtime/save';

type EnginePorts = {
  storyRepo: StoryRepo;
  userSaveRepo: UserSaveRepo;
  gameSaveRepo: GameSaveRepo;
};

export const createEngine = (ports: EnginePorts) => ({
  submitAction: (saveId: string, blockId: string, action: BlockAction) =>
    executeAction(ports, saveId, blockId, action),

  startGame: (storyId: string, playerId: string) => startNewGame(ports, storyId, playerId),

  loadSave: (saveId: string) => ports.userSaveRepo.get(saveId),
});
```

## Blocks

Blocks are the interactive building blocks of a story. Each block exports a `State` type, an `Action` type, an `initialState`, a `scope` (`'user'` or `'game'`), and an `update` function. The update function is a pure reducer: given state + action + config, return new state. No I/O, no side effects.

A `BlockInstance` is a specific usage of a block type within a story node, configured by the story author. The block definition is the template (code-lock logic). The instance is a specific door in a specific story with a specific correct code.

```typescript
// engine/graph/types.ts

type BlockInstance = {
  id: string; // authored instance id: "front-door"
  type: string; // which block definition: "code-lock"
  config: unknown; // author's settings: { correctCode: "1847" }
};
```

Canonical authored JSON stores nodes, blocks, and edges as ordered arrays. Runtime lookup tables are an engine concern after load, not part of the serialized bundle contract.

### User-Scoped Block Example

```typescript
// engine/blocks/code-lock.ts

export const scope = 'user' as const;

export type State = {
  locked: boolean;
  attempts: number;
};

export type Action = { type: 'attempt-unlock'; code: string } | { type: 'force-open' };

export const initialState: State = {
  locked: true,
  attempts: 0,
};

export const update = (
  state: State,
  action: Action,
  config: { correctCode: string; maxAttempts?: number },
): State => {
  switch (action.type) {
    case 'attempt-unlock': {
      const correct = action.code === config.correctCode;
      const newAttempts = state.attempts + 1;
      if (config.maxAttempts && newAttempts > config.maxAttempts) {
        return { locked: true, attempts: newAttempts };
      }
      return { locked: !correct, attempts: newAttempts };
    }
    case 'force-open':
      return state.attempts >= 3 ? { locked: false, attempts: state.attempts } : state;
  }
};
```

### Game-Scoped Block Example

```typescript
// engine/blocks/crime-scene.ts

export const scope = 'game' as const;

export type State = {
  sealed: boolean;
  openedBy: string | null;
  openedAt: Date | null;
};

export type Action = { type: 'unseal'; playerId: string; openedAt: Date };

export const initialState: State = {
  sealed: true,
  openedBy: null,
  openedAt: null,
};

export const update = (state: State, action: Action, config: {}): State => {
  switch (action.type) {
    case 'unseal':
      if (!state.sealed) return state;
      return {
        sealed: false,
        openedBy: action.playerId,
        openedAt: action.openedAt,
      };
  }
};
```

### Block Registry

The registry in `blocks/index.ts` maps block type names to their definitions. The executor calls `updateBlock()` which looks up the block and calls its `update` function. Adding a new block type means creating one file and adding one import to the registry.

```typescript
// engine/blocks/index.ts
import * as lockedDoor from './code-lock';
import * as clue from './clue';
import * as timer from './timer';
import * as qrScanner from './qr-scanner';

export type BlockDefinition = {
  initialState: unknown;
  scope: 'user' | 'game';
  update: (state: any, action: any, config: any) => unknown;
};

const registry: Record<string, BlockDefinition> = {
  'code-lock': lockedDoor,
  clue: clue,
  timer: timer,
  'qr-scanner': qrScanner,
};

export const getBlock = (blockType: string): BlockDefinition | undefined => registry[blockType];

export const updateBlock = (
  blockType: string,
  currentState: unknown,
  action: unknown,
  config: unknown,
): unknown => {
  const block = registry[blockType];
  if (!block) throw new Error(`Unknown block: ${blockType}`);
  return block.update(currentState, action, config);
};
```

## Save State Model

Plotpoint has two kinds of save state. `UserSaveState` tracks an individual player's progress through a story. `GameSaveState` tracks shared world state that all players in the same game instance can see and affect.

### UserSaveState (Per-Player)

```typescript
type UserSaveState = {
  id: string;
  playerId: string;
  storyId: string;
  gameId: string; // which game instance
  currentNodeId: string; // position in story graph
  blockStates: Record<string, unknown>; // per-player block states
  startedAt: Date;
  updatedAt: Date;
};
```

### GameSaveState (Shared)

```typescript
type GameSaveState = {
  id: string;
  storyId: string;
  sharedBlockStates: Record<string, unknown>;
  status: 'active' | 'completed' | 'expired';
  startedAt: Date;
  updatedAt: Date;
};
```

When processing an action, the executor loads both save states, determines the target block's scope (user or game), reads from and writes to the appropriate save, then merges both into a combined view for edge condition evaluation.

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

Condition functions are real TypeScript functions in a registry in `graph/conditions.ts`. The story bundle stores the function name and params as JSON. The engine looks up the real function at runtime. Adding a new condition type means adding one entry to the registry.

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
): AvailableEdge[] => {
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

"The player can enter the final room if they have the master key, OR if they've solved the puzzle AND at least 3 clues have been found." Stored in the story bundle as:

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
          "params": { "blockId": "puzzle", "field": "solved", "value": true }
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

## Request Lifecycle: Submit Action

A complete trace of a player submitting an unlock code to a locked door, from the phone to the database and back.

### 1. Mobile App

Player taps "Enter Code", types "1847", hits submit. The app POSTs to `/actions` with the `saveId`, `blockId`, and action payload. Request shape is validated against a route-local DTO schema.

### 2. API Route

The route in `routes/submit-action.ts` parses the request, validates with Zod, and calls `engine.submitAction(saveId, blockId, action)`. The route doesn't know about blocks, graphs, or game logic.

```typescript
// api/routes/submit-action.ts
import { Hono } from 'hono';
import { engine } from '../server';
import { submitActionRequest } from './submit-action.dto';

const app = new Hono();

app.post('/actions', async (c) => {
  const body = await c.req.json();
  const parsed = submitActionRequest.safeParse(body);
  if (!parsed.success) return c.json(parsed.error, 400);

  const { saveId, blockId, action } = parsed.data;
  const result = await engine.submitAction(saveId, blockId, action);

  return c.json(result);
});

export default app;
```

### 3. Engine Executor

The executor in `runtime/executor.ts` orchestrates the gameplay loop:

```typescript
// engine/runtime/executor.ts
import { getBlock, updateBlock } from '../blocks';
import { evaluateEdges } from '../graph/traversal';
import type { EnginePorts } from '../ports';

export const executeAction = async (
  ports: EnginePorts,
  saveId: string,
  blockId: string,
  action: unknown,
) => {
  // 1. Load both save states through ports
  const save = await ports.userSaveRepo.get(saveId);
  const gameSave = await ports.gameSaveRepo.get(save.gameId);
  const story = await ports.storyRepo.getBundle(save.storyId);

  // 2. Find the target block's type and config from the story bundle
  const currentNode = story.graph.nodes.find((node) => node.id === save.currentNodeId);
  const blockConfig = currentNode?.blocks.find((block) => block.id === blockId);
  const blockDef = getBlock(blockConfig.type);

  // 3. Read current state from the appropriate save based on scope
  const currentBlockState =
    blockDef.scope === 'game' ? gameSave.sharedBlockStates[blockId] : save.blockStates[blockId];

  // 4. Run the pure block update
  const nextBlockState = updateBlock(
    blockConfig.type,
    currentBlockState,
    action,
    blockConfig.config,
  );

  // 5. Write updated state to the appropriate save
  if (blockDef.scope === 'game') {
    await ports.gameSaveRepo.update(gameSave.id, {
      ...gameSave.sharedBlockStates,
      [blockId]: nextBlockState,
    });
  } else {
    await ports.userSaveRepo.save({
      ...save,
      blockStates: { ...save.blockStates, [blockId]: nextBlockState },
      updatedAt: new Date(),
    });
  }

  // 6. Merge both saves for edge evaluation
  const allBlockStates = {
    ...gameSave.sharedBlockStates,
    ...save.blockStates,
    [blockId]: nextBlockState,
  };

  // 7. Evaluate which edges are now available
  const context = { now: new Date(), playerLocation: null };
  const availableEdges = evaluateEdges(story.graph, save.currentNodeId, allBlockStates, context);

  // 8. Return result to the route
  return {
    blockStates: allBlockStates,
    availableEdges,
  };
};
```

### 4. Block Update (Pure)

The registry looks up `'code-lock'` and calls its `update()` with state `{ locked: true, attempts: 1 }` and action `{ type: 'attempt-unlock', code: '1847' }`. The code matches. Returns `{ locked: false, attempts: 2 }`. No I/O occurs.

### 5. Edge Evaluation (Pure)

The traversal engine merges both save states and evaluates every edge's condition tree on the current node. With the door now unlocked, an edge condition like `field-equals(front-door, locked, false)` passes, making "Enter the corridor" available.

### 6. Persistence

The executor calls `ports.userSaveRepo.save(updatedSave)`. This passes through the thin repo wrapper in `db/repos/user-save-repo.ts` to the `upsertUserSave()` function in `db/user-saves.ts`, which runs the actual Drizzle upsert against Supabase.

### 7. Response

The executor returns updated block states and available edges to the route, which serializes them as JSON. The mobile app receives the response, the block renderer registry maps `'code-lock'` to `LockedDoor.tsx`, and it re-renders with the unlocked state.

### Full Call Chain

```
Phone
  → routes/submit-action.ts         (validates, delegates)
    → engine.submitAction()          (public API)
      → runtime/executor.ts          (orchestrates gameplay loop)
        → blocks/code-lock.ts      (pure state transition)
        → graph/traversal.ts         (pure edge evaluation)
        → ports.userSaveRepo.save()  (abstract persistence)
          → db/repos/user-save-repo  (thin port wrapper)
            → db/user-saves.ts       (Drizzle query)
              → Supabase
```

## Versioning

The engine uses semver. The major version is what gets stamped into published story bundles. A story published against engine v2 runs on any engine 2.x.x. It breaks only on engine 3.0.0, at which point the migration chain runs.

### Semver Mapping

**Major:** Breaking changes to story bundle interpretation. Changing how conditions evaluate, restructuring graph traversal, altering block state machine behavior. Requires a migration function.

**Minor:** Backwards-compatible additions. New block types, new condition functions, new optional fields that default gracefully. Old stories unaffected.

**Patch:** Bug fixes. Corrected edge cases, performance improvements. No contract changes.

### Migration Chain

Migrations live in `runtime/migrations.ts` as an array of pure functions. Each transforms a bundle from one major version to the next. They chain: a v1 story on a v3 engine runs through v1→2 then v2→3. The original bundle in storage is never modified — migration happens in memory at load time.

```typescript
const migrations = [
  {
    from: 1,
    to: 2,
    migrate: (bundle) => ({
      ...bundle,
      graph: {
        ...bundle.graph,
        nodes: bundle.graph.nodes.map((node) => ({
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

export const migrateBundle = (bundle: StoryBundle, fromVersion: number): StoryBundle => {
  let current = bundle;
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
// db/repos/story-repo.ts
import type { StoryRepo } from '@plotpoint/engine';
import { getStoryBundle } from '../stories';

export const storyRepo: StoryRepo = {
  getBundle: getStoryBundle,
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
import { update, initialState } from './code-lock';

const config = { correctCode: '1847' };

test('correct code unlocks', () => {
  const result = update(initialState, { type: 'attempt-unlock', code: '1847' }, config);
  expect(result.locked).toBe(false);
  expect(result.attempts).toBe(1);
});

test('wrong code stays locked', () => {
  const result = update(initialState, { type: 'attempt-unlock', code: 'wrong' }, config);
  expect(result.locked).toBe(true);
  expect(result.attempts).toBe(1);
});

test('force open works after 3 failed attempts', () => {
  const stateAfterFailures = { locked: true, attempts: 3 };
  const result = update(stateAfterFailures, { type: 'force-open' }, config);
  expect(result.locked).toBe(false);
});
```

### Testing with Fake Ports

```typescript
const fakeStoryRepo: StoryRepo = {
  getBundle: async (id) => ({
    metadata: {
      storyId: id,
      title: 'Story Title',
    },
    roles: [],
    graph: {
      entryNodeId: 'node-1',
      nodes: [
        {
          id: 'node-1',
          title: 'Intro Node',
          blocks: [
            {
              id: 'door-1',
              type: 'code-lock',
              config: { correctCode: '1847' },
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
  }),
};

const saved: UserSaveState[] = [];
const fakeUserSaveRepo: UserSaveRepo = {
  get: async () => ({
    id: 'save-1',
    playerId: 'player-1',
    storyId: 'story-1',
    gameId: 'game-1',
    currentNodeId: 'node-1',
    blockStates: { 'door-1': { locked: true, attempts: 0 } },
    startedAt: new Date(),
    updatedAt: new Date(),
  }),
  save: async (state) => {
    saved.push(state);
  },
};

const fakeGameSaveRepo: GameSaveRepo = {
  get: async () => ({
    id: 'game-1',
    storyId: 'story-1',
    sharedBlockStates: {},
    status: 'active',
    startedAt: new Date(),
    updatedAt: new Date(),
  }),
  update: async () => {},
};

// Create engine with fakes
const engine = createEngine({
  storyRepo: fakeStoryRepo,
  userSaveRepo: fakeUserSaveRepo,
  gameSaveRepo: fakeGameSaveRepo,
});

test('submitting correct code unlocks door', async () => {
  const result = await engine.submitAction('save-1', 'door-1', {
    type: 'attempt-unlock',
    code: '1847',
  });
  expect(result.blockStates['door-1'].locked).toBe(false);
});
```

## Key Principles

**Engine depends on nothing.** The engine defines what it needs as abstract port types and receives concrete implementations at runtime. If the engine ever imports from the db package, the architecture is broken.

**Blocks are pure reducers.** A block's `update` function takes state + action + config and returns new state. No I/O, no side effects, no dependencies. Persistence is the executor's job.

**Feature slices don't call each other.** API routes are independent vertical slices. If `publish-story` needs to update the story's status, it calls the database directly — it doesn't import from `update-story`.

**Two save states, one combined view.** `UserSaveState` tracks per-player progress. `GameSaveState` tracks shared world state. The executor merges both for edge evaluation so conditions can reference either scope.

**Conditions are named functions, not a custom language.** The story bundle stores condition names and params as JSON. The engine maps names to real TypeScript functions at runtime through a registry. Adding a new condition type means adding one function to the registry.

**All database logic lives in the db package.** Schema files define tables, sibling files define operations. Repos are thin wrappers that adapt operations to engine port shapes. API routes import operations directly for simple queries.

**Start simple, extract when it hurts.** Not every route needs a separate handler file. Not every block needs complex logic. Not every feature needs ports. The architecture scales to the complexity of each part — a thin route that calls one query is fine as a single file.
