# @plotpoint/engine

Story execution engine for the Plotpoint AR storytelling platform.

## Overview

The engine is the core runtime that executes interactive stories. It manages story flow, state, component execution, version compatibility, and player progression through story graphs.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Story Graph (@plotpoint/db)                            │
│  - Nodes (story screens)                                │
│  - Edges (transitions between nodes)                    │
│  - Component versions                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Engine (@plotpoint/engine)                             │
│  ├── Graph: Load and traverse story structure           │
│  ├── Executor: Run components and manage flow           │
│  ├── State: Track game state and inventory              │
│  ├── Registry: Component type management                │
│  ├── Compatibility: Version resolution                  │
│  └── Events: Emit progression events                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Components (@plotpoint/components)                     │
│  - Text blocks, choice gates, media, etc.               │
└─────────────────────────────────────────────────────────┘
```

## Core Modules

### Graph
Loads and manages story structure from the database.

```typescript
import { StoryGraph } from '@plotpoint/engine/graph';

const graph = await StoryGraph.load(storyId, db);
const startNode = graph.getStartNode();
const nextNodes = graph.getOutgoingEdges(currentNodeId);
```

### Executor
Executes story nodes and manages progression.

```typescript
import { StoryExecutor } from '@plotpoint/engine/executor';

const executor = new StoryExecutor(graph, state);
const result = await executor.executeNode(nodeId);
```

### State
Manages game state, inventory, and progress tracking.

```typescript
import { GameState } from '@plotpoint/engine/state';

const state = new GameState(userId, storyId);
state.setVariable('health', 100);
state.addInventoryItem({ id: 'key', name: 'Mysterious Key' });
const health = state.getVariable('health');
```

### Registry
Component type registration and lookup.

```typescript
import { ComponentRegistry } from '@plotpoint/engine/registry';

const registry = ComponentRegistry.getInstance();
registry.register('text_block', TextBlockComponent);
const component = registry.get('text_block');
```

### Compatibility
Semantic versioning and component version resolution.

```typescript
import { resolveCompatibility } from '@plotpoint/engine/compatibility';
import { satisfiesVersion } from '@plotpoint/engine/semver';

// Check version compatibility
const isCompatible = satisfiesVersion('1.2.3', '^1.0.0'); // true

// Resolve component versions for a story
const resolved = await resolveCompatibility(storyManifest);
```

### Actions
Execute game actions (inventory, state changes, etc.).

```typescript
import { executeAction } from '@plotpoint/engine/actions';

await executeAction({
  type: 'add_inventory_item',
  itemId: 'key_001',
  itemName: 'Mysterious Key',
}, state);
```

### Conditions
Evaluate conditional logic for branching.

```typescript
import { evaluateCondition } from '@plotpoint/engine/conditions';

const shouldProceed = evaluateCondition({
  type: 'has_inventory_item',
  itemId: 'key_001',
}, state);
```

### Events
Event system for tracking story progression.

```typescript
import { EventEmitter } from '@plotpoint/engine/events';

const emitter = new EventEmitter();
emitter.on('node_entered', (nodeId) => {
  console.log(`Entered node: ${nodeId}`);
});
emitter.emit('node_entered', 'node_123');
```

### Assembly
Story assembly and packaging utilities.

```typescript
import { assembleStory } from '@plotpoint/engine/assembly';

const assembled = await assembleStory(storyId, db);
```

### Migrations
Handle story format migrations across engine versions.

```typescript
import { migrateStory } from '@plotpoint/engine/migrations';

const migrated = await migrateStory(story, '1.0.0', '2.0.0');
```

### Testing
Testing utilities for story validation.

```typescript
import { validateStory, testStoryFlow } from '@plotpoint/engine/testing';

// Validate story structure
const validation = await validateStory(storyId, db);

// Test story execution paths
const testResults = await testStoryFlow(storyId, db, testScenarios);
```

## Usage

### Basic Story Execution

```typescript
import { createEngine } from '@plotpoint/engine';
import { drizzle } from 'drizzle-orm/postgres-js';

// Initialize engine
const db = drizzle(postgres(process.env.DATABASE_URL));
const engine = createEngine(db);

// Load story
await engine.loadStory(storyId);

// Start execution
const session = await engine.createSession(userId);
const firstNode = await engine.start(session);

// Progress through story
const result = await engine.executeChoice(session, choiceId);
```

### Advanced: Custom Component Execution

```typescript
import { StoryGraph, GameState, StoryExecutor } from '@plotpoint/engine';

// Load story graph
const graph = await StoryGraph.load(storyId, db);

// Initialize state
const state = new GameState(userId, storyId);
await state.load(db);

// Create executor
const executor = new StoryExecutor(graph, state);

// Execute specific node
const result = await executor.executeNode(nodeId);

// Save state
await state.save(db);
```

### Version Compatibility

```typescript
import { satisfiesVersion } from '@plotpoint/engine/semver';

// Check if a component version is compatible
const isCompatible = satisfiesVersion('1.2.3', '^1.0.0'); // true
const isCompatible2 = satisfiesVersion('2.0.0', '^1.0.0'); // false
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Engine Versions

The engine follows semantic versioning:
- **Major**: Breaking changes to story format or component API
- **Minor**: New features, backward-compatible
- **Patch**: Bug fixes

Stories specify required engine versions in their manifest:

```json
{
  "engine_version": "^1.0.0",
  "required_components": {
    "text_block": "^1.0.0",
    "choice_gate": "^1.0.0"
  }
}
```

## Story Execution Flow

1. **Load**: Story graph loaded from database
2. **Initialize**: Game state initialized or restored
3. **Resolve**: Component versions resolved against manifest
4. **Execute**: Current node's component executed
5. **Evaluate**: Outgoing edges evaluated for conditions
6. **Transition**: Move to next node based on player choice/condition
7. **Save**: Game state persisted
8. **Complete**: Story end node reached

## Related Packages

- `@plotpoint/db` - Database schema and types
- `@plotpoint/schemas` - Validation schemas and runtime types
- `@plotpoint/components` - Component implementations
