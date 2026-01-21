# @plotpoint/schemas

Runtime validation schemas and utility types for the Plotpoint platform.

## Purpose

This package contains Zod schemas for:

- **Form validation** (authentication, user input)
- **Component props validation** (blocks, gates, and other UI components)
- **API input/output validation**
- **Runtime utility types** (ComponentContext, GameState, etc.)

**Note:** Database entity types (Story, StoryNode, etc.) are imported from `@plotpoint/db`, not defined here.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Drizzle Schema (@plotpoint/db)                             │
│  - Single source of truth for database structure             │
│  - Exports InferSelectModel/InferInsertModel types          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  @plotpoint/schemas                                          │
│  - Form validation (signUpFormSchema, etc.)                 │
│  - Component props validation (textBlockPropsSchema, etc.)  │
│  - Runtime utility types (ComponentContext, GameState)      │
│  - Imports database types from @plotpoint/db               │
└─────────────────────────────────────────────────────────────┘
```

## What's Here vs What's in @plotpoint/db

### In @plotpoint/db

- `Story`, `StoryNode`, `StoryEdge` - Database entity types
- `StorySession`, `StoryManifest` - Session and metadata types
- `Profile`, `Achievement`, `Venue` - User and content types
- All `New*` insert types (e.g., `NewStory`, `NewStoryNode`)

### In @plotpoint/schemas

- Form validation: `signUpFormSchema`, `signInFormSchema`, etc.
- Component props: `textBlockPropsSchema`, `choiceGatePropsSchema`, etc.
- API validation: `createStoryAssetSchema`, `updateStoryAssetSchema`
- Runtime types: `ComponentContext`, `ComponentProps`, `GameState`, `InventoryItem`
- Enum schemas: `componentTypeNameSchema`, `shellTypeSchema`, etc.
- Utility functions: `getComponentCategory()`, `isBlockType()`, etc.

## Usage Examples

### Form Validation

```typescript
import { signUpFormSchema } from "@plotpoint/schemas";

const result = signUpFormSchema.safeParse(formData);
if (result.success) {
  // Valid form data
  const { email, password } = result.data;
}
```

### Component Props Validation

```typescript
import { textBlockPropsSchema } from "@plotpoint/schemas";

const props = textBlockPropsSchema.parse({
  content: "Hello world",
  showContinueButton: true,
});
```

### Using Database Types

```typescript
import type { Story, StoryNode, StoryEdge } from "@plotpoint/db";
import type { ComponentContext, GameState } from "@plotpoint/schemas";

function processStory(story: Story, nodes: StoryNode[]) {
  // Work with database entities
}

function renderComponent(context: ComponentContext) {
  // Use runtime types
}
```

### API Input Validation

```typescript
import { createStoryAssetSchema } from "@plotpoint/schemas";

// Validate API input before processing
const validatedData = createStoryAssetSchema.parse(requestBody);
```

## Migration from Old Architecture

Previously, this package duplicated database entity schemas. Now:

**Before:**

```typescript
// DON'T: Import database types from schemas
import type { Story, StoryNode } from "@plotpoint/schemas";
```

**After:**

```typescript
// DO: Import database types from db
import type { Story, StoryNode } from "@plotpoint/db";
import type { GameState, ComponentContext } from "@plotpoint/schemas";
```

## Type Categories

### Validation Schemas

Use these for runtime validation of user input or API data:

- Form schemas: `signUpFormSchema`, `updateProfileFormSchema`
- Component prop schemas: All `*PropsSchema` exports
- API schemas: `createStoryAssetSchema`, `updateStoryAssetSchema`

### Type-Only Exports

Use these for TypeScript type checking only:

- Database entities: Import from `@plotpoint/db`
- Runtime utilities: `ComponentContext`, `ComponentProps`, `GameState`
- Enums: `ComponentTypeName`, `ShellType`, `LocationType`

## Best Practices

1. **Use Drizzle types for database entities**

   ```typescript
   import type { Story } from "@plotpoint/db"; // ✅
   ```

2. **Use Zod schemas for validation at boundaries**

   ```typescript
   const validated = signUpFormSchema.parse(input); // ✅
   ```

3. **Keep validation schemas focused**
   - Don't create schemas for internal data structures
   - Use schemas where data enters/exits the system

4. **Import types, not schemas, for type checking**
   ```typescript
   import type { TextBlockProps } from "@plotpoint/schemas"; // ✅
   import { textBlockPropsSchema } from "@plotpoint/schemas"; // Only when validating
   ```

## Related Packages

- `@plotpoint/db` - Database schema and types (Drizzle ORM)
- `@plotpoint/engine` - Story execution engine
- `@plotpoint/components` - Reusable component logic
