# @plotpoint/types

Shared TypeScript type definitions for the Plotpoint engine.

## Overview

This package provides TypeScript interfaces and types used across all Plotpoint packages and apps.

## Type Categories

### Semantic Versioning

```typescript
interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

type VersionConstraint = string; // e.g., "^1.0.0", ">=2.0.0"
```

### Component Types

```typescript
type ComponentTypeName =
  | 'text_chapter'
  | 'video_player'
  | 'choice_dialog'
  | 'qr_scanner'
  | 'geolocation_lock'
  | 'puzzle_solver'
  | 'inventory_action'
  | 'conditional'
  | 'parallel'
  | 'end';

type ComponentCategory =
  | 'narrative'
  | 'interaction'
  | 'media'
  | 'logic'
  | 'multiplayer';
```

### Story & Node Types

```typescript
interface Story {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  authorId: string;
  status: 'draft' | 'published' | 'archived';
  startNodeId: string | null;
  isMultiplayer: boolean;
  // ...
}

interface StoryNode {
  id: string;
  storyId: string;
  nodeKey: string;
  nodeType: ComponentTypeName;
  data: Record<string, unknown>;
  // ...
}

interface StoryEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: 'default' | 'choice' | 'conditional';
  label: string | null;
  condition: EdgeCondition | null;
  // ...
}
```

### Game State

```typescript
interface GameState {
  [key: string]: unknown;
}

interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

interface StorySession {
  id: string;
  userId: string;
  storyId: string;
  currentNodeId: string | null;
  gameState: GameState;
  inventory: InventoryItem[];
  visitedNodes: string[];
  choiceHistory: ChoiceHistoryEntry[];
  isComplete: boolean;
  // ...
}
```

### Component Registration

```typescript
interface ComponentContext {
  gameState: GameState;
  inventory: InventoryItem[];
  visitedNodes: string[];
  sessionId: string;
  onComplete: () => void;
  onNavigate: (edgeId: string) => void;
  onStateUpdate: (updates: Partial<GameState>) => void;
  onInventoryUpdate: (item: InventoryItem, action: 'add' | 'remove' | 'update') => void;
}

interface ComponentProps<TData = Record<string, unknown>> {
  data: TData;
  context: ComponentContext;
  edges: StoryEdge[];
}

type StoryComponent<TData> = React.ComponentType<ComponentProps<TData>>;

interface ComponentRegistration<TData> {
  componentType: ComponentTypeName;
  version: string;
  Component: StoryComponent<TData>;
  propsSchema: unknown; // Zod schema
  defaultProps?: Partial<TData>;
  dependencies?: Record<ComponentTypeName, VersionConstraint>;
}
```

### Edge Conditions

```typescript
type EdgeConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'not_contains'
  | 'has_item'
  | 'not_has_item'
  | 'and'
  | 'or';

interface EdgeCondition {
  operator: EdgeConditionOperator;
  key?: string;
  value?: unknown;
  conditions?: EdgeCondition[]; // For and/or
}
```

## Usage

```typescript
import type {
  Story,
  StoryNode,
  ComponentProps,
  GameState
} from '@plotpoint/types';

function MyComponent({ data, context, edges }: ComponentProps<MyData>) {
  // ...
}
```

## Installation

```bash
pnpm add @plotpoint/types
```

Or in monorepo, reference via workspace:

```json
{
  "dependencies": {
    "@plotpoint/types": "workspace:*"
  }
}
```
