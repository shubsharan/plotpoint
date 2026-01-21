# Engine Package Testing Plan

This document outlines the testing strategy for `@plotpoint/engine`.

## Test Framework Setup

```bash
# Install test dependencies
pnpm add -D vitest @vitest/coverage-v8
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
});
```

---

## 1. Graph Module Tests

### 1.1 `story-graph.ts`

**File:** `src/graph/__tests__/story-graph.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createStoryGraph` creates valid graph | Given nodes and edges, returns graph with correct maps |
| `createStoryGraph` handles empty arrays | Returns graph with empty maps |
| `createStoryGraph` handles duplicate node IDs | Last node wins (or throws - decide behavior) |
| `getNode` returns node by ID | Returns correct node or null |
| `getNode` returns null for missing ID | Non-existent ID returns null |
| `getEdge` returns edge by ID | Returns correct edge or null |
| `getOutgoingEdges` returns edges from node | Returns array of edges where node is source |
| `getOutgoingEdges` returns empty for leaf node | Node with no outgoing edges returns [] |
| `getIncomingEdges` returns edges to node | Returns array of edges where node is target |
| `getIncomingEdges` returns empty for root node | Start node typically has no incoming edges |
| `getAllNodes` returns all nodes | Returns array of all nodes |
| `getAllEdges` returns all edges | Returns array of all edges |
| `getNodesByType` filters by component type | Returns only nodes matching type |
| `hasNode` returns true for existing node | Correctly identifies existing nodes |
| `hasEdge` returns true for existing edge | Correctly identifies existing edges |

```typescript
// Example test
describe('createStoryGraph', () => {
  it('should create graph with correct indexes', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
    ];
    const edges = [
      createTestEdge('a', 'b', { id: 'e1' }),
    ];

    const graph = createStoryGraph(nodes, edges, 'a');

    expect(getNode(graph, 'a')).toEqual(nodes[0]);
    expect(getOutgoingEdges(graph, 'a')).toHaveLength(1);
    expect(getIncomingEdges(graph, 'b')).toHaveLength(1);
    expect(getStartNodeId(graph)).toBe('a');
  });
});
```

### 1.2 `traversal.ts`

**File:** `src/graph/__tests__/traversal.test.ts`

| Test Case | Description |
|-----------|-------------|
| `findReachableNodes` finds all connected nodes | BFS correctly traverses graph |
| `findReachableNodes` handles isolated nodes | Disconnected nodes not included |
| `findReachableNodes` handles single node | Returns set with just start node |
| `findReachableNodes` handles cycles | Doesn't infinite loop on cyclic graphs |
| `findAllPaths` finds single path | Linear graph returns one path |
| `findAllPaths` finds multiple paths | Branching graph returns all paths |
| `findAllPaths` respects maxDepth | Stops searching beyond depth limit |
| `findAllPaths` returns empty for unreachable target | No path exists returns [] |
| `detectCycles` returns empty for DAG | Acyclic graph returns [] |
| `detectCycles` detects simple cycle | A -> B -> A detected |
| `detectCycles` detects complex cycles | Multiple cycles all detected |
| `detectCycles` handles self-loops | A -> A detected |
| `getEndNodes` returns nodes of type 'end' | Filters correctly |
| `getOrphanedNodes` excludes start node | Start node not considered orphaned |
| `getOrphanedNodes` finds nodes with no incoming edges | Correctly identifies orphans |
| `findUnreachableNodes` finds disconnected nodes | Nodes not reachable from start |
| `findDeadEndNodes` excludes 'end' nodes | End nodes are valid dead ends |
| `findDeadEndNodes` finds non-end nodes without outgoing edges | Story bugs detected |
| `topologicalSort` returns valid ordering | All edges point forward in order |
| `topologicalSort` returns null for cyclic graph | Cannot sort graph with cycles |

```typescript
// Example test
describe('detectCycles', () => {
  it('should detect a simple cycle', () => {
    const nodes = [
      createTestNode({ id: 'a', nodeType: 'text_block' }),
      createTestNode({ id: 'b', nodeType: 'text_block' }),
    ];
    const edges = [
      createTestEdge('a', 'b'),
      createTestEdge('b', 'a'), // Creates cycle
    ];

    const graph = createStoryGraph(nodes, edges, 'a');
    const cycles = detectCycles(graph);

    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
  });
});
```

### 1.3 `validator.ts`

**File:** `src/graph/__tests__/validator.test.ts`

| Test Case | Description |
|-----------|-------------|
| `validateGraph` passes for valid graph | No errors for well-formed graph |
| `validateGraph` detects empty graph | EMPTY_GRAPH error |
| `validateGraph` detects missing start node | MISSING_START error |
| `validateGraph` detects invalid edge source | INVALID_EDGE_SOURCE error |
| `validateGraph` detects invalid edge target | INVALID_EDGE_TARGET error |
| `validateGraph` detects unreachable nodes | UNREACHABLE_NODE error |
| `validateGraph` detects dead ends | DEAD_END error |
| `validateGraph` detects cycles | CYCLE_DETECTED error |
| `validateGraph` warns about no end nodes | NO_END_NODES warning |
| `validateGraph` warns about orphaned nodes | ORPHANED_NODE warning |
| `validateEdgeConditions` validates condition structure | INVALID_CONDITION for malformed |
| `validateEdgeConditions` passes for valid conditions | No errors for correct conditions |
| `validateComponentTypes` detects unregistered types | MISSING_COMPONENT_TYPE error |
| `formatValidationReport` formats errors correctly | Human-readable output |

---

## 2. State Module Tests

### 2.1 `session-state.ts`

**File:** `src/state/__tests__/session-state.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createSessionState` creates default state | All fields have correct defaults |
| `createSessionState` uses initial values | Provided values override defaults |
| `setCurrentNode` updates currentNodeId | Returns new state with updated ID |
| `setCurrentNode` marks node as visited | visitedNodes set updated |
| `setCurrentNode` preserves immutability | Original state unchanged |
| `updateGameState` merges updates | Shallow merge works correctly |
| `updateGameState` preserves other state | Only gameState changes |
| `addInventoryItem` adds new item | Item added to inventory |
| `addInventoryItem` increases quantity for existing | Quantity summed |
| `removeInventoryItem` decreases quantity | Quantity reduced |
| `removeInventoryItem` removes item at zero | Item removed when quantity <= 0 |
| `removeInventoryItem` no-op for missing item | State unchanged |
| `updateInventoryItem` replaces existing | Item fully replaced |
| `updateInventoryItem` adds if missing | Item added if not exists |
| `markVisited` adds to visitedNodes | Set updated |
| `markVisited` no-op if already visited | State unchanged |
| `addChoice` appends to history | Choice added to end |
| `clearState` resets to initial | Only startNodeId preserved |
| `serializeSessionState` produces JSON-compatible | Can be JSON.stringify'd |
| `deserializeSessionState` recreates state | Round-trip works |

```typescript
// Example test
describe('addInventoryItem', () => {
  it('should increase quantity for existing item', () => {
    const initial = createSessionState({
      inventory: [{ id: 'key', name: 'Key', quantity: 1 }],
    });

    const updated = addInventoryItem(initial, {
      id: 'key',
      name: 'Key',
      quantity: 2
    });

    expect(getInventoryItem(updated, 'key')?.quantity).toBe(3);
    expect(initial.inventory[0].quantity).toBe(1); // Immutable
  });
});
```

### 2.2 `operations.ts`

**File:** `src/state/__tests__/operations.test.ts`

| Test Case | Description |
|-----------|-------------|
| `mergeGameState` shallow merges | Updates override base |
| `applyInventoryAction` add works | Item added or quantity increased |
| `applyInventoryAction` remove works | Quantity decreased or item removed |
| `applyInventoryAction` update works | Item replaced or added |
| `computeStateDiff` detects gameState changes | Changed keys identified |
| `computeStateDiff` detects inventory additions | Added items identified |
| `computeStateDiff` detects inventory removals | Removed items identified |
| `computeStateDiff` detects inventory updates | Updated items identified |
| `computeStateDiff` detects visited nodes | New visits identified |
| `computeStateDiff` detects current node change | Boolean flag set |
| `cloneGameState` deep clones | Nested objects cloned |
| `cloneInventory` clones items | Each item is new object |
| `isGameStateEqual` compares correctly | Same keys/values returns true |
| `isInventoryEqual` compares correctly | Same items returns true |

---

## 3. Executor Module Tests

### 3.1 `edge-resolver.ts`

**File:** `src/executor/__tests__/edge-resolver.test.ts`

| Test Case | Description |
|-----------|-------------|
| `resolveEdges` returns all outgoing edges | all array populated |
| `resolveEdges` filters by conditions | available excludes failing conditions |
| `resolveEdges` categorizes by type | default, choices, conditional separated |
| `resolveEdges` sorts by priority | Lower priority first |
| `canTraverseEdge` returns true for no condition | Default edges always pass |
| `canTraverseEdge` evaluates equals condition | gameState comparison works |
| `canTraverseEdge` evaluates has_item condition | Inventory check works |
| `canTraverseEdge` evaluates and condition | All must pass |
| `canTraverseEdge` evaluates or condition | One must pass |
| `sortEdgesByPriority` orders correctly | Ascending by priority |
| `isEdgeAvailable` checks available array | Returns true if in available |
| `getDefaultEdge` returns first default | Or null if none |
| `getChoiceEdges` returns choice edges | Filtered correctly |

```typescript
// Example test
describe('resolveEdges', () => {
  it('should filter edges by condition', () => {
    const graph = createConditionalTestGraph();

    // Without hasKey, conditional edge should fail
    const resolved1 = resolveEdges(graph, 'check', {}, []);
    expect(resolved1.available).toHaveLength(1); // Only default

    // With hasKey, conditional edge should pass
    const resolved2 = resolveEdges(graph, 'check', { hasKey: true }, []);
    expect(resolved2.available).toHaveLength(2); // Both edges
  });
});
```

### 3.2 `story-executor.ts`

**File:** `src/executor/__tests__/story-executor.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createStoryExecutor` creates executor | Returns valid executor object |
| `start` sets currentNode to start | State updated correctly |
| `start` emits STORY_STARTED event | Event callback called |
| `start` emits NODE_ENTERED event | Event callback called |
| `reset` clears state | All state reset except start |
| `reset` emits STORY_RESTARTED event | Event callback called |
| `navigate` moves to target node | currentNode updated |
| `navigate` throws for unavailable edge | Error thrown |
| `navigate` records choice in history | choiceHistory updated |
| `navigate` emits EDGE_TRAVERSED event | Event with edge data |
| `navigate` emits NODE_EXITED event | Previous node |
| `navigate` emits NODE_ENTERED event | New node |
| `navigateToNode` moves directly | Bypasses edge check |
| `navigateToNode` throws for missing node | Error thrown |
| `completeCurrentNode` follows default edge | Navigates via default |
| `completeCurrentNode` throws if no default | Error thrown |
| `updateGameState` updates state | gameState modified |
| `updateGameState` emits STATE_UPDATED event | Event with updates |
| `updateInventory` add works | Item added |
| `updateInventory` remove works | Item removed |
| `updateInventory` emits INVENTORY_CHANGED event | Event with action |
| `getContext` returns current context | All fields populated |
| `canNavigate` checks edge availability | Returns boolean |
| `isAtEndNode` detects end nodes | Returns true at end |
| `serialize` produces session data | Can be persisted |
| `restore` loads session data | State restored |

```typescript
// Example test
describe('StoryExecutor', () => {
  it('should navigate through a linear story', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    let context = executor.start();
    expect(context.currentNode?.id).toBe('node-0');

    context = executor.completeCurrentNode();
    expect(context.currentNode?.id).toBe('node-1');

    context = executor.completeCurrentNode();
    expect(context.currentNode?.id).toBe('node-2');
    expect(context.isAtEndNode).toBe(true);
  });

  it('should emit events during execution', () => {
    const graph = createLinearGraph(2);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    executor.completeCurrentNode();

    expect(events.map(e => e.type)).toEqual([
      'STORY_STARTED',
      'NODE_ENTERED',
      'EDGE_TRAVERSED',
      'NODE_EXITED',
      'NODE_ENTERED',
      'STORY_COMPLETED',
    ]);
  });
});
```

---

## 4. Assembly Module Tests

### 4.1 `story-loader.ts`

**File:** `src/assembly/__tests__/story-loader.test.ts`

| Test Case | Description |
|-----------|-------------|
| `loadStory` creates LoadedStory | Returns story, graph, validation |
| `loadStory` throws for missing startNodeId | Error thrown |
| `loadStory` includes validation results | Errors/warnings populated |
| `prepareExecutor` creates executor | Returns working executor |
| `prepareExecutor` warns on validation errors | Console.warn called |
| `prepareExecutor` auto-starts if no initial state | Executor started |
| `prepareExecutor` skips start if currentNodeId provided | Executor not started |
| `loadAndStart` returns both | loaded and executor returned |
| `isStoryValid` checks validation.valid | Returns boolean |

### 4.2 `manifest-builder.ts`

**File:** `src/assembly/__tests__/manifest-builder.test.ts`

| Test Case | Description |
|-----------|-------------|
| `buildManifestFromGraph` extracts component types | All node types collected |
| `buildManifestFromGraph` uses caret version constraints | ^x.y.z format |
| `buildManifestFromGraph` handles unregistered components | Wildcard used with warning |
| `validateManifestCompatibility` checks engine version | Incompatible returns errors |
| `validateManifestCompatibility` checks component availability | Missing components reported |
| `buildDefaultManifest` creates complete manifest | All fields populated |
| `mergeManifests` combines constraints | Override wins |
| `areAllComponentsRegistered` checks registry | Returns boolean |
| `getMissingComponents` lists missing | Array of missing types |

---

## 5. Events Module Tests

### 5.1 `event-emitter.ts`

**File:** `src/events/__tests__/event-emitter.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createEventEmitter` creates emitter | Returns valid emitter |
| `on` registers listener | Listener called on emit |
| `on` returns unsubscribe function | Calling it removes listener |
| `once` fires only once | Listener auto-removed after first call |
| `emit` calls all listeners for type | Multiple listeners all called |
| `emit` catches listener errors | Other listeners still called |
| `off` removes listener | Listener no longer called |
| `clear` removes all listeners | No listeners remain |
| `createLoggingListener` logs events | Console.log called |
| `createEventCollector` stores events | getEvents returns all |
| `createFilteredListener` filters by type | Only matching types passed |

```typescript
// Example test
describe('EventEmitter', () => {
  it('should call listeners on emit', () => {
    const emitter = createEventEmitter();
    const listener = vi.fn();

    emitter.on('NODE_ENTERED', listener);
    emitter.emit({ type: 'NODE_ENTERED', timestamp: Date.now(), nodeId: 'a' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'NODE_ENTERED',
      nodeId: 'a',
    }));
  });
});
```

---

## 6. Testing Module Tests

### 6.1 `story-simulator.ts`

**File:** `src/testing/__tests__/story-simulator.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createStorySimulator` creates simulator | Returns valid simulator |
| `simulateAutoPath` follows default edges | Reaches end via defaults |
| `simulateAutoPath` stops at maxSteps | Prevents infinite loops |
| `simulateAutoPath` reports success at end | success: true at end node |
| `simulateAutoPath` reports failure if stuck | No default edge available |
| `simulateChoicePath` follows specified edges | Exact path followed |
| `simulateChoicePath` fails for unavailable edge | Error reported |
| `simulateWithState` uses initial state | Conditions evaluated with state |
| `getExecutor` returns fresh executor | New executor each call |

### 6.2 `graph-builders.ts`

**File:** `src/testing/__tests__/graph-builders.test.ts`

| Test Case | Description |
|-----------|-------------|
| `createLinearGraph` creates N nodes | Correct count |
| `createLinearGraph` last node is 'end' | nodeType is 'end' |
| `createLinearGraph` edges connect sequentially | 0->1->2->... |
| `createBranchingGraph` creates correct depth | Levels match depth |
| `createBranchingGraph` creates correct branching | Each node has branchFactor children |
| `createTestNode` uses defaults | All fields populated |
| `createTestNode` applies overrides | Override values used |
| `createTestEdge` connects nodes | sourceNodeId and targetNodeId set |
| `createSimpleTestGraph` creates 3-node graph | start -> middle -> end |
| `createConditionalTestGraph` has conditional edge | Condition present on edge |

---

## 7. Conditions Module Tests

### 7.1 `builder.ts`

**File:** `src/conditions/__tests__/builder.test.ts`

| Test Case | Description |
|-----------|-------------|
| `and` creates AND condition | operator: 'and', conditions array |
| `or` creates OR condition | operator: 'or', conditions array |
| `equals` creates equals condition | operator, key, value set |
| `notEquals` creates not_equals condition | Correct structure |
| `greaterThan` creates greater_than condition | Correct structure |
| `lessThan` creates less_than condition | Correct structure |
| `contains` creates contains condition | Correct structure |
| `notContains` creates not_contains condition | Correct structure |
| `hasItem` creates has_item condition | value is itemId |
| `notHasItem` creates not_has_item condition | value is itemId |
| Nested conditions work | and(or(...), equals(...)) |

### 7.2 `analyzer.ts`

**File:** `src/conditions/__tests__/analyzer.test.ts`

| Test Case | Description |
|-----------|-------------|
| `getRequiredStateKeys` extracts keys | All comparison keys found |
| `getRequiredStateKeys` deduplicates | No duplicate keys |
| `getRequiredStateKeys` traverses nested | Keys from all levels |
| `getRequiredItems` extracts item IDs | All has_item values found |
| `getRequiredItems` deduplicates | No duplicate IDs |
| `validateConditionStructure` passes valid | { valid: true } |
| `validateConditionStructure` fails for missing key | { valid: false, error } |
| `validateConditionStructure` fails for missing value | { valid: false, error } |
| `validateConditionStructure` fails for empty and/or | { valid: false, error } |
| `validateConditionStructure` fails for unknown operator | { valid: false, error } |
| `countConditions` counts all | Includes nested |
| `getConditionDepth` measures depth | Correct nesting level |
| `simplifyCondition` flattens same operators | and(and(a,b),c) -> and(a,b,c) |
| `conditionToString` formats readable | Human-readable output |

---

## 8. Integration Tests

**File:** `src/__tests__/integration.test.ts`

| Test Case | Description |
|-----------|-------------|
| Full story playthrough | Load, start, navigate to end |
| State persistence round-trip | Serialize, restore, continue |
| Conditional branching | Different paths based on state |
| Inventory-gated progression | has_item conditions work |
| Event tracking | All events emitted correctly |
| Validation catches bad graphs | Errors prevent broken stories |
| Simulator matches manual execution | Same results both ways |

```typescript
// Example integration test
describe('Integration', () => {
  it('should play through a conditional story', () => {
    const graph = createConditionalTestGraph();
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    // Start at 'start' node
    let ctx = executor.start();
    expect(ctx.currentNode?.id).toBe('start');

    // Navigate to 'check' node
    ctx = executor.completeCurrentNode();
    expect(ctx.currentNode?.id).toBe('check');

    // Without hasKey, only default edge (to failure) is available
    expect(ctx.resolvedEdges.available).toHaveLength(1);
    expect(ctx.resolvedEdges.default?.targetNodeId).toBe('failure');

    // Set hasKey and re-resolve
    executor.updateGameState({ hasKey: true });
    ctx = executor.getContext();

    // Now conditional edge (to success) is also available
    expect(ctx.resolvedEdges.available).toHaveLength(2);

    // Navigate to success
    const successEdge = ctx.resolvedEdges.conditional[0];
    ctx = executor.navigate(successEdge.id);
    expect(ctx.currentNode?.id).toBe('success');
    expect(ctx.isAtEndNode).toBe(true);
  });
});
```

---

## 9. Test Coverage Goals

| Module | Target Coverage |
|--------|-----------------|
| graph/ | 95%+ |
| state/ | 95%+ |
| executor/ | 90%+ |
| assembly/ | 85%+ |
| events/ | 90%+ |
| testing/ | 80%+ |
| conditions/ | 90%+ |
| **Overall** | **90%+** |

---

## 10. Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/graph/__tests__/story-graph.test.ts

# Run in watch mode
pnpm test:watch
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 11. Test File Structure

```
packages/engine/src/
├── graph/
│   ├── __tests__/
│   │   ├── story-graph.test.ts
│   │   ├── traversal.test.ts
│   │   └── validator.test.ts
│   └── ...
├── state/
│   ├── __tests__/
│   │   ├── session-state.test.ts
│   │   └── operations.test.ts
│   └── ...
├── executor/
│   ├── __tests__/
│   │   ├── edge-resolver.test.ts
│   │   └── story-executor.test.ts
│   └── ...
├── assembly/
│   ├── __tests__/
│   │   ├── story-loader.test.ts
│   │   └── manifest-builder.test.ts
│   └── ...
├── events/
│   ├── __tests__/
│   │   └── event-emitter.test.ts
│   └── ...
├── testing/
│   ├── __tests__/
│   │   ├── story-simulator.test.ts
│   │   └── graph-builders.test.ts
│   └── ...
├── conditions/
│   ├── __tests__/
│   │   ├── builder.test.ts
│   │   └── analyzer.test.ts
│   └── ...
└── __tests__/
    └── integration.test.ts
```
