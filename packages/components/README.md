# @plotpoint/components

Reusable component implementations for the Plotpoint AR storytelling platform.

## Overview

This package contains the core component implementations that power interactive story experiences. Each component represents a building block that can be used in stories to create narrative moments, player choices, media presentations, and game logic.

## Component Types

### Narrative Components

#### Text Block
Displays text content with optional continue button.

```typescript
import { TextBlock } from '@plotpoint/components/text-block';

const props = {
  content: "Welcome to the story...",
  showContinueButton: true,
};
```

### Interaction Components

#### Choice Gate
Presents players with multiple choice options.

```typescript
import { ChoiceGate } from '@plotpoint/components/choice-gate';

const props = {
  prompt: "What will you do?",
  choices: [
    { id: "option_1", text: "Go left", targetNodeKey: "left_path" },
    { id: "option_2", text: "Go right", targetNodeKey: "right_path" },
  ],
};
```

### Media Components

#### Video Block
Displays video content with playback controls.

```typescript
import { VideoBlock } from '@plotpoint/components/video-block';

const props = {
  videoUrl: "https://example.com/video.mp4",
  autoplay: false,
  showControls: true,
};
```

### Location Components

#### Geolocation Gate
Restricts progression based on player's physical location.

```typescript
import { GeolocationGate } from '@plotpoint/components/geolocation-gate';

const props = {
  latitude: 37.7749,
  longitude: -122.4194,
  radius: 100, // meters
  message: "You must be at the location to continue",
};
```

### Game Logic Components

#### Inventory Action
Manages player inventory (add/remove items, check requirements).

```typescript
import { InventoryAction } from '@plotpoint/components/inventory-action';

const props = {
  action: "add",
  itemId: "key_001",
  itemName: "Mysterious Key",
};
```

#### End
Marks the end of a story path.

```typescript
import { End } from '@plotpoint/components/end';

const props = {
  message: "The End",
  showReplayOption: true,
};
```

## Component Structure

Each component follows a consistent structure:

```
component-name/
├── index.ts          # Component export and registration
├── types.ts          # TypeScript types and interfaces
└── handler.ts        # Component logic and behavior (optional)
```

## Usage

### Importing Components

```typescript
// Import specific component
import { TextBlock } from '@plotpoint/components/text-block';

// Import all components
import * as Components from '@plotpoint/components';
```

### Component Props Validation

Components use schemas from `@plotpoint/schemas` for runtime validation:

```typescript
import { textBlockPropsSchema } from '@plotpoint/schemas';

// Validate props at runtime
const validatedProps = textBlockPropsSchema.parse(rawProps);
```

### Using with the Engine

Components are automatically registered with the engine:

```typescript
import { createEngine } from '@plotpoint/engine';
import '@plotpoint/components'; // Auto-registers all components

const engine = createEngine();
```

## Creating Custom Components

To create a new component:

1. Create a new directory in `src/`
2. Define types in `types.ts`
3. Implement logic in `handler.ts` (if needed)
4. Export from `index.ts`
5. Register in the main `index.ts`

Example:

```typescript
// src/my-component/types.ts
export interface MyComponentProps {
  message: string;
  duration: number;
}

// src/my-component/index.ts
export * from './types';

// src/index.ts
export * from './my-component';
```

## Component Lifecycle

1. **Initialization**: Props are validated against schema
2. **Rendering**: Component data is passed to the UI layer
3. **Interaction**: Player actions trigger state changes
4. **Transition**: Component signals completion and next node

## Related Packages

- `@plotpoint/schemas` - Validation schemas for component props
- `@plotpoint/engine` - Story execution engine that uses these components
- `@plotpoint/db` - Database types for storing component data
