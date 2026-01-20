# Plotpoint Backend Architecture Improvements

## Overview

Targeted schema improvements based on project requirements:
- **Node types**: Slow evolution (Plotpoint team controlled)
- **Assets**: Per-story (not shared)
- **State**: Flexible user/shared state via JSONB
- **Offline**: Important for core playback
- **Security**: RLS policies (published = public, draft = author only)

---

## Schema Changes

### 1. New Table: `story_assets`

Track media assets per story for offline downloads and cleanup.

```typescript
// packages/db/src/schema/index.ts

export const assetTypeEnum = pgEnum('asset_type', [
  'image',
  'video',
  'audio',
  'document',
  'other',
]);

export const storyAssets = pgTable(
  'story_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    assetType: assetTypeEnum('asset_type').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type'),
    storagePath: text('storage_path').notNull(),
    publicUrl: text('public_url'),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    referencedByNodes: jsonb('referenced_by_nodes').default([]),
    contentHash: text('content_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('story_assets_story_idx').on(table.storyId),
    index('story_assets_type_idx').on(table.assetType),
    uniqueIndex('story_assets_storage_path_idx').on(table.storagePath),
  ]
);
```

### 2. Fix: `stories.authorId` Foreign Key

```typescript
// Change line ~169 in schema/index.ts
// FROM:
authorId: uuid('author_id').notNull(),

// TO:
authorId: uuid('author_id')
  .notNull()
  .references(() => profiles.id),
```

### 3. Add Missing Indexes

```typescript
// Add to nodes table indexes (around line 285):
index('nodes_type_idx').on(table.nodeType),
index('nodes_story_order_idx').on(table.storyId, table.order),

// Add to story_sessions table indexes:
index('story_sessions_user_status_idx').on(table.userId, table.status),

// Add to multiplayer_sessions table indexes:
index('multiplayer_sessions_story_status_idx').on(table.storyId, table.status),

// Add to events table indexes:
index('events_story_created_idx').on(table.storyId, table.createdAt),
```

### 4. Add Relations

```typescript
// Add storyAssets relation to storiesRelations:
export const storiesRelations = relations(stories, ({ one, many }) => ({
  author: one(profiles, {  // ADD
    fields: [stories.authorId],
    references: [profiles.id],
  }),
  // ... existing relations ...
  assets: many(storyAssets),  // ADD
}));

// Add new storyAssetsRelations:
export const storyAssetsRelations = relations(storyAssets, ({ one }) => ({
  story: one(stories, {
    fields: [storyAssets.storyId],
    references: [stories.id],
  }),
}));

// Add stories to profilesRelations:
export const profilesRelations = relations(profiles, ({ many }) => ({
  stories: many(stories),  // ADD
  // ... existing relations ...
}));
```

---

## Types Updates

### packages/types/src/index.ts

```typescript
// Add asset types
export type AssetType = 'image' | 'video' | 'audio' | 'document' | 'other';

export interface StoryAsset {
  id: string;
  storyId: string;
  assetType: AssetType;
  filename: string;
  mimeType?: string;
  storagePath: string;
  publicUrl?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  referencedByNodes: string[];
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
}

// Update Story interface to include author relation
export interface Story {
  // ... existing fields ...
  author?: Profile;  // ADD (optional for queries without join)
  assets?: StoryAsset[];  // ADD
}
```

---

## Validators Updates

### packages/validators/src/index.ts

```typescript
// Add asset validation schemas
export const assetTypeSchema = z.enum(['image', 'video', 'audio', 'document', 'other']);

export const storyAssetSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  assetType: assetTypeSchema,
  filename: z.string().min(1),
  mimeType: z.string().optional(),
  storagePath: z.string().min(1),
  publicUrl: z.string().url().optional(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  referencedByNodes: z.array(z.string().uuid()).default([]),
  contentHash: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createStoryAssetSchema = storyAssetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
```

---

## RLS Policies

Create these in Supabase SQL editor or as migrations:

### Stories Table

```sql
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Anyone can read published stories
CREATE POLICY "Published stories are public"
ON stories FOR SELECT
USING (status = 'published');

-- Authors can read their own drafts
CREATE POLICY "Authors can read own drafts"
ON stories FOR SELECT
USING (author_id = auth.uid());

-- Authors can create stories
CREATE POLICY "Authors can create stories"
ON stories FOR INSERT
WITH CHECK (author_id = auth.uid());

-- Authors can update/delete their own stories
CREATE POLICY "Authors can modify own stories"
ON stories FOR UPDATE
USING (author_id = auth.uid());

CREATE POLICY "Authors can delete own stories"
ON stories FOR DELETE
USING (author_id = auth.uid());
```

### Nodes Table

```sql
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- Nodes readable if parent story is readable
CREATE POLICY "Nodes follow story visibility"
ON nodes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = nodes.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify nodes in their stories
CREATE POLICY "Authors can modify own story nodes"
ON nodes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = nodes.story_id
    AND s.author_id = auth.uid()
  )
);
```

### Story Assets Table

```sql
ALTER TABLE story_assets ENABLE ROW LEVEL SECURITY;

-- Assets follow story visibility
CREATE POLICY "Assets follow story visibility"
ON story_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_assets.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can manage their story assets
CREATE POLICY "Authors can manage own story assets"
ON story_assets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_assets.story_id
    AND s.author_id = auth.uid()
  )
);
```

### Sessions Tables

```sql
-- Story sessions: Users can only access their own
ALTER TABLE story_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their sessions"
ON story_sessions FOR ALL
USING (user_id = auth.uid());

-- Multiplayer sessions
ALTER TABLE multiplayer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read their sessions"
ON multiplayer_sessions FOR SELECT
USING (
  host_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM multiplayer_players mp
    WHERE mp.session_id = multiplayer_sessions.id
    AND mp.user_id = auth.uid()
  )
);

CREATE POLICY "Host can modify session"
ON multiplayer_sessions FOR UPDATE
USING (host_user_id = auth.uid());
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/db/src/schema/index.ts` | Add storyAssets table, fix authorId FK, add indexes, add relations |
| `packages/types/src/index.ts` | Add AssetType, StoryAsset interface, update Story interface |
| `packages/validators/src/index.ts` | Add asset validation schemas |

---

## Implementation Order

1. **Schema changes** (`packages/db/src/schema/index.ts`)
   - Add `assetTypeEnum`
   - Add `storyAssets` table with indexes
   - Fix `stories.authorId` FK reference
   - Add new indexes to existing tables
   - Add `storyAssetsRelations`
   - Update `storiesRelations` with author and assets
   - Update `profilesRelations` with stories

2. **Generate and push migration**
   ```bash
   pnpm --filter db db:generate
   pnpm --filter db db:push
   ```

3. **Types updates** (`packages/types/src/index.ts`)
   - Add AssetType and StoryAsset
   - Update Story interface

4. **Validators updates** (`packages/validators/src/index.ts`)
   - Add asset schemas

5. **RLS policies** (Supabase dashboard or migration)
   - Apply policies to stories, nodes, story_assets, sessions

---

## Verification

1. **Schema compiles**: `pnpm --filter db db:generate`
2. **Type check passes**: `pnpm typecheck`
3. **Test RLS policies**:
   - Verify published stories readable by anon
   - Verify draft stories only readable by author
   - Verify assets follow story visibility
4. **Test asset tracking**:
   - Create story with assets
   - Query total download size: `SELECT SUM(size_bytes) FROM story_assets WHERE story_id = ?`
