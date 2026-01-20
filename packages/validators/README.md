# @plotpoint/validators

Shared Zod validation schemas for the Plotpoint engine.

## Overview

This package provides Zod schemas for runtime validation across all Plotpoint packages and apps. These schemas validate:

- Story and node data
- Component props
- Game state and inventory
- Edge conditions
- Session data

## Schema Categories

### Base Schemas

```typescript
import { semVerSchema, versionConstraintSchema } from '@plotpoint/validators';

// Validate semantic version
semVerSchema.parse({ major: 1, minor: 0, patch: 0 });

// Validate version constraint
versionConstraintSchema.parse('^1.0.0');
versionConstraintSchema.parse('>=2.0.0');
```

### Story Schemas

```typescript
import { storySchema, storyNodeSchema, storyEdgeSchema } from '@plotpoint/validators';

// Validate story data
const story = storySchema.parse(data);

// Validate node
const node = storyNodeSchema.parse(nodeData);

// Validate edge with conditions
const edge = storyEdgeSchema.parse(edgeData);
```

### Component Props Schemas

Each component type has a dedicated props schema:

```typescript
import {
  textChapterPropsSchema,
  choiceDialogPropsSchema,
  videoPlayerPropsSchema,
  inventoryActionPropsSchema,
  qrScannerPropsSchema,
  geolocationLockPropsSchema,
  puzzleSolverPropsSchema,
  endNodePropsSchema,
} from '@plotpoint/validators';

// Text Chapter props
const textProps = textChapterPropsSchema.parse({
  content: 'Story text here...',
  showContinueButton: true,
  typingEffect: false,
});

// Choice Dialog props
const choiceProps = choiceDialogPropsSchema.parse({
  prompt: 'What do you do?',
  timedChoice: true,
  timeLimit: 30,
});
```

### Game State Schemas

```typescript
import {
  gameStateSchema,
  inventoryItemSchema,
  storySessionSchema,
} from '@plotpoint/validators';

// Validate inventory item
const item = inventoryItemSchema.parse({
  id: 'key-001',
  name: 'Golden Key',
  quantity: 1,
});

// Validate session
const session = storySessionSchema.parse(sessionData);
```

### Edge Condition Schemas

```typescript
import { edgeConditionSchema } from '@plotpoint/validators';

// Simple condition
edgeConditionSchema.parse({
  operator: 'has_item',
  value: 'key-001',
});

// Compound condition
edgeConditionSchema.parse({
  operator: 'and',
  conditions: [
    { operator: 'has_item', value: 'key-001' },
    { operator: 'greater_than', key: 'courage', value: 50 },
  ],
});
```

## Type Inference

All schemas export inferred types:

```typescript
import type {
  TextChapterProps,
  ChoiceDialogProps,
  InventoryItem,
  EdgeCondition,
} from '@plotpoint/validators';

// Types are inferred from schemas
const props: TextChapterProps = {
  content: 'Hello world',
  showContinueButton: true,
};
```

## Component Props Reference

### TextChapterProps

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| title | string? | - | Chapter title |
| content | string | required | Main text content |
| showContinueButton | boolean | true | Show continue button |
| continueButtonText | string | "Continue" | Button text |
| autoAdvanceDelay | number? | - | Auto-advance in ms |
| typingEffect | boolean | false | Typewriter effect |
| typingSpeed | number | 30 | Ms per character |

### ChoiceDialogProps

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| prompt | string? | - | Question text |
| showPrompt | boolean | true | Display prompt |
| allowMultiple | boolean | false | Multi-select mode |
| minSelections | number | 1 | Minimum choices |
| maxSelections | number? | - | Maximum choices |
| shuffleChoices | boolean | false | Randomize order |
| timedChoice | boolean | false | Enable timer |
| timeLimit | number? | - | Seconds to choose |
| defaultChoice | string? | - | Edge ID if timeout |

### VideoPlayerProps

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| videoUrl | string | required | Video URL |
| posterUrl | string? | - | Thumbnail URL |
| autoPlay | boolean | false | Auto-start |
| loop | boolean | false | Loop playback |
| muted | boolean | false | Mute audio |
| showControls | boolean | true | Show controls |
| onEndAction | enum | "continue" | pause/continue/loop |

### InventoryActionProps

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| action | enum | required | add/remove/check/display |
| itemId | string? | - | Item identifier |
| itemName | string? | - | Display name |
| itemDescription | string? | - | Item description |
| itemImageUrl | string? | - | Item image |
| quantity | number | 1 | Amount to add/remove |
| message | string? | - | Action message |
| autoAdvance | boolean | true | Auto-continue |

## Usage

```bash
pnpm add @plotpoint/validators
```

```typescript
import { textChapterPropsSchema } from '@plotpoint/validators';

// Runtime validation
const result = textChapterPropsSchema.safeParse(props);
if (!result.success) {
  console.error(result.error);
}
```
