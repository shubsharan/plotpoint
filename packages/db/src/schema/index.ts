import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

// Story status
export const storyStatusEnum = pgEnum('story_status', ['draft', 'published', 'archived']);

// Shell types - determines story presentation
export const shellTypeEnum = pgEnum('shell_type', ['ebook', 'chat', 'map']);

// Geography type - how the story relates to locations
export const geographyTypeEnum = pgEnum('geography_type', [
  'single_city',
  'multi_region',
  'location_agnostic',
]);

// Node category - blocks are content, gates are unlock points
export const nodeCategoryEnum = pgEnum('node_category', ['block', 'gate']);

// Edge types
export const edgeTypeEnum = pgEnum('edge_type', ['default', 'choice', 'conditional']);

// Component categories for organization
export const componentCategoryEnum = pgEnum('component_category', [
  'block',
  'gate',
  'other',
]);

// Session status
export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'completed',
  'archived',
  'abandoned',
]);

// Multiplayer session status
export const multiplayerStatusEnum = pgEnum('multiplayer_status', [
  'waiting',
  'active',
  'completed',
  'abandoned',
]);

// Location type for geolocation gates
export const locationTypeEnum = pgEnum('location_type', ['specific', 'category', 'none']);

// Fallback behavior for geolocation
export const locationFallbackEnum = pgEnum('location_fallback', [
  'wait',
  'skip',
  'manual_confirm',
]);

// Sync point behavior for multiplayer
export const syncBehaviorEnum = pgEnum('sync_behavior', [
  'wait_screen',
  'side_content',
  'notification',
  'timeout_skip',
]);

// Event types for analytics
export const eventTypeEnum = pgEnum('event_type', [
  'story_started',
  'story_completed',
  'story_abandoned',
  'node_visited',
  'choice_made',
  'gate_unlocked',
  'gate_failed',
  'session_joined',
  'session_left',
  'achievement_unlocked',
]);

// Asset types for story media
export const assetTypeEnum = pgEnum('asset_type', [
  'image',
  'video',
  'audio',
  'document',
  'other',
]);

// ============================================
// GENRES
// ============================================
export const genres = pgTable(
  'genres',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('genres_slug_idx').on(table.slug)]
);

// ============================================
// VENUE CATEGORIES
// ============================================
export const venueCategories = pgTable(
  'venue_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(), // e.g., "coffee_shop", "park", "museum"
    displayName: text('display_name').notNull(),
    osmTags: jsonb('osm_tags').notNull(), // OpenStreetMap tags to match
    icon: text('icon'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('venue_categories_name_idx').on(table.name)]
);

// ============================================
// VENUES (cached from OSM + our data)
// ============================================
export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    osmId: text('osm_id'), // OpenStreetMap ID if from OSM
    categoryId: uuid('category_id')
      .notNull()
      .references(() => venueCategories.id),
    name: text('name').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    address: text('address'),
    city: text('city'),
    country: text('country'),
    isSponsored: boolean('is_sponsored').default(false).notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    sponsorPriority: integer('sponsor_priority').default(0),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('venues_category_idx').on(table.categoryId),
    index('venues_city_idx').on(table.city),
    index('venues_location_idx').on(table.latitude, table.longitude),
    uniqueIndex('venues_osm_idx').on(table.osmId),
  ]
);

// ============================================
// STORIES
// ============================================
export const stories = pgTable(
  'stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    status: storyStatusEnum('status').default('draft').notNull(),

    // Shell determines presentation
    shellType: shellTypeEnum('shell_type').default('ebook').notNull(),

    // Story metadata
    genreId: uuid('genre_id').references(() => genres.id),
    estimatedDurationMinutes: integer('estimated_duration_minutes'),
    difficultyLevel: integer('difficulty_level'), // 1-5 scale
    coverImageUrl: text('cover_image_url'),

    // Location settings
    geographyType: geographyTypeEnum('geography_type').default('location_agnostic').notNull(),
    primaryCity: text('primary_city'),
    primaryCountry: text('primary_country'),

    // Navigation
    startNodeId: uuid('start_node_id'),

    // Multiplayer settings
    isMultiplayer: boolean('is_multiplayer').default(false).notNull(),
    minPlayers: integer('min_players').default(1),
    maxPlayers: integer('max_players').default(1),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    publishedAt: timestamp('published_at'),
  },
  (table) => [
    uniqueIndex('stories_slug_idx').on(table.slug),
    index('stories_author_idx').on(table.authorId),
    index('stories_genre_idx').on(table.genreId),
    index('stories_status_idx').on(table.status),
    index('stories_city_idx').on(table.primaryCity),
  ]
);

// ============================================
// STORY ROLES (for multiplayer)
// ============================================
export const storyRoles = pgTable(
  'story_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g., "detective", "witness"
    displayName: text('display_name').notNull(),
    description: text('description'),
    isRequired: boolean('is_required').default(true).notNull(),
    order: integer('order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('story_roles_story_name_idx').on(table.storyId, table.name),
    index('story_roles_story_idx').on(table.storyId),
  ]
);

// ============================================
// CHAPTERS (optional grouping)
// ============================================
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    order: integer('order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('chapters_story_idx').on(table.storyId)]
);

// ============================================
// NODES
// ============================================
export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),

    // Node identification
    nodeKey: text('node_key').notNull(),
    nodeCategory: nodeCategoryEnum('node_category').notNull(), // block or gate
    nodeType: text('node_type').notNull(), // text_block, choice_gate, etc.

    // Optional chapter grouping
    chapterId: uuid('chapter_id').references(() => chapters.id),

    // Component version (for versioned rendering)
    componentVersionId: uuid('component_version_id').references(() => componentVersions.id),

    // Node content/configuration
    data: jsonb('data').default({}).notNull(),

    // Visual editor position
    position: jsonb('position').default({ x: 0, y: 0 }),
    order: integer('order').default(0),

    // Role restriction (for multiplayer)
    allowedRoles: jsonb('allowed_roles'), // Array of role IDs that can see this node

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('nodes_story_key_idx').on(table.storyId, table.nodeKey),
    index('nodes_story_idx').on(table.storyId),
    index('nodes_chapter_idx').on(table.chapterId),
    index('nodes_category_idx').on(table.nodeCategory),
    index('nodes_type_idx').on(table.nodeType),
    index('nodes_story_order_idx').on(table.storyId, table.order),
  ]
);

// ============================================
// EDGES (Connections between nodes)
// ============================================
export const edges = pgTable(
  'edges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceNodeId: uuid('source_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    targetNodeId: uuid('target_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    edgeType: edgeTypeEnum('edge_type').default('default').notNull(),
    label: text('label'), // For choice text
    condition: jsonb('condition'), // For conditional edges
    priority: integer('priority').default(0), // For ordering/evaluation
    allowedRoles: jsonb('allowed_roles'), // For multiplayer role-based edges
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('edges_source_idx').on(table.sourceNodeId),
    index('edges_target_idx').on(table.targetNodeId),
  ]
);

// ============================================
// SYNC POINTS (Multiplayer coordination)
// ============================================
export const syncPoints = pgTable(
  'sync_points',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    behavior: syncBehaviorEnum('behavior').default('wait_screen').notNull(),
    timeoutSeconds: integer('timeout_seconds'),
    sideContentNodeId: uuid('side_content_node_id').references(() => nodes.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sync_points_story_idx').on(table.storyId),
    uniqueIndex('sync_points_node_idx').on(table.nodeId),
  ]
);

// ============================================
// COMPONENT TYPES
// ============================================
export const componentTypes = pgTable(
  'component_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(), // text_block, choice_gate, etc.
    displayName: text('display_name').notNull(),
    description: text('description'),
    category: componentCategoryEnum('category').notNull(),
    icon: text('icon'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('component_types_name_idx').on(table.name)]
);

// ============================================
// COMPONENT VERSIONS
// ============================================
export const componentVersions = pgTable(
  'component_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    componentTypeId: uuid('component_type_id')
      .notNull()
      .references(() => componentTypes.id, { onDelete: 'cascade' }),
    major: integer('major').notNull(),
    minor: integer('minor').notNull(),
    patch: integer('patch').notNull(),
    propsSchema: jsonb('props_schema').notNull(), // JSON Schema for validation
    defaultProps: jsonb('default_props').default({}),
    dependencies: jsonb('dependencies'), // Other component dependencies
    changelog: text('changelog'),
    isDeprecated: boolean('is_deprecated').default(false).notNull(),
    deprecationMessage: text('deprecation_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('component_versions_unique_idx').on(
      table.componentTypeId,
      table.major,
      table.minor,
      table.patch
    ),
    index('component_versions_type_idx').on(table.componentTypeId),
  ]
);

// ============================================
// STORY MANIFESTS
// ============================================
export const storyManifests = pgTable('story_manifests', {
  id: uuid('id').defaultRandom().primaryKey(),
  storyId: uuid('story_id')
    .notNull()
    .references(() => stories.id, { onDelete: 'cascade' })
    .unique(),
  requiredComponents: jsonb('required_components').notNull(), // { component_name: "^1.0.0" }
  engineVersion: text('engine_version').notNull(),
  resolvedComponents: jsonb('resolved_components'), // Cached resolution
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// PROFILES (User profiles)
// ============================================
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(), // Same as Supabase auth.users.id
    username: text('username'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    isPublic: boolean('is_public').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('profiles_username_idx').on(table.username)]
);

// ============================================
// ACHIEVEMENTS
// ============================================
export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    category: text('category'), // e.g., "exploration", "completion", "social"
    points: integer('points').default(0),
    isSecret: boolean('is_secret').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('achievements_slug_idx').on(table.slug)]
);

// ============================================
// USER ACHIEVEMENTS
// ============================================
export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => stories.id), // Which story triggered it
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_achievements_unique_idx').on(table.userId, table.achievementId),
    index('user_achievements_user_idx').on(table.userId),
  ]
);

// ============================================
// STORY SESSIONS (Single player progress)
// ============================================
export const storySessions = pgTable(
  'story_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    currentNodeId: uuid('current_node_id').references(() => nodes.id),
    status: sessionStatusEnum('status').default('active').notNull(),
    gameState: jsonb('game_state').default({}).notNull(),
    inventory: jsonb('inventory').default([]).notNull(),
    visitedNodes: jsonb('visited_nodes').default([]).notNull(),
    choiceHistory: jsonb('choice_history').default([]).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastPlayedAt: timestamp('last_played_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('story_sessions_user_idx').on(table.userId),
    index('story_sessions_story_idx').on(table.storyId),
    index('story_sessions_status_idx').on(table.status),
    index('story_sessions_user_status_idx').on(table.userId, table.status),
    // Allow multiple completed sessions, only one active per user per story
  ]
);

// ============================================
// MULTIPLAYER SESSIONS
// ============================================
export const multiplayerSessions = pgTable(
  'multiplayer_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => profiles.id),
    joinCode: text('join_code').notNull(), // For QR/deep link
    status: multiplayerStatusEnum('status').default('waiting').notNull(),
    sharedState: jsonb('shared_state').default({}).notNull(),
    sharedInventory: jsonb('shared_inventory').default([]).notNull(),
    currentSyncPointId: uuid('current_sync_point_id').references(() => syncPoints.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    uniqueIndex('multiplayer_sessions_join_code_idx').on(table.joinCode),
    index('multiplayer_sessions_story_idx').on(table.storyId),
    index('multiplayer_sessions_host_idx').on(table.hostUserId),
    index('multiplayer_sessions_status_idx').on(table.status),
    index('multiplayer_sessions_story_status_idx').on(table.storyId, table.status),
  ]
);

// ============================================
// MULTIPLAYER PLAYERS (Player slots in session)
// ============================================
export const multiplayerPlayers = pgTable(
  'multiplayer_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => multiplayerSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    roleId: uuid('role_id').references(() => storyRoles.id),
    currentNodeId: uuid('current_node_id').references(() => nodes.id),
    personalState: jsonb('personal_state').default({}).notNull(),
    visitedNodes: jsonb('visited_nodes').default([]).notNull(),
    isConnected: boolean('is_connected').default(true).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('multiplayer_players_session_user_idx').on(table.sessionId, table.userId),
    index('multiplayer_players_session_idx').on(table.sessionId),
    index('multiplayer_players_user_idx').on(table.userId),
  ]
);

// ============================================
// STORY DOWNLOADS (Offline mode)
// ============================================
export const storyDownloads = pgTable(
  'story_downloads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    version: text('version').notNull(), // Story version downloaded
    sizeBytes: integer('size_bytes'),
    downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    uniqueIndex('story_downloads_user_story_idx').on(table.userId, table.storyId),
    index('story_downloads_user_idx').on(table.userId),
  ]
);

// ============================================
// STORY ASSETS (Media per story for offline/cleanup)
// ============================================
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

// ============================================
// EVENTS (Analytics/Telemetry)
// ============================================
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => profiles.id),
    sessionId: uuid('session_id'), // story_sessions or multiplayer_sessions id
    storyId: uuid('story_id').references(() => stories.id),
    nodeId: uuid('node_id').references(() => nodes.id),
    eventType: eventTypeEnum('event_type').notNull(),
    eventData: jsonb('event_data').default({}),
    deviceInfo: jsonb('device_info').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('events_user_idx').on(table.userId),
    index('events_story_idx').on(table.storyId),
    index('events_type_idx').on(table.eventType),
    index('events_created_idx').on(table.createdAt),
    index('events_story_created_idx').on(table.storyId, table.createdAt),
  ]
);

// ============================================
// RELATIONS
// ============================================

export const genresRelations = relations(genres, ({ many }) => ({
  stories: many(stories),
}));

export const venueCategoriesRelations = relations(venueCategories, ({ many }) => ({
  venues: many(venues),
}));

export const venuesRelations = relations(venues, ({ one }) => ({
  category: one(venueCategories, {
    fields: [venues.categoryId],
    references: [venueCategories.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  author: one(profiles, {
    fields: [stories.authorId],
    references: [profiles.id],
  }),
  genre: one(genres, {
    fields: [stories.genreId],
    references: [genres.id],
  }),
  startNode: one(nodes, {
    fields: [stories.startNodeId],
    references: [nodes.id],
    relationName: 'startNode',
  }),
  nodes: many(nodes),
  chapters: many(chapters),
  roles: many(storyRoles),
  syncPoints: many(syncPoints),
  manifest: one(storyManifests),
  sessions: many(storySessions),
  multiplayerSessions: many(multiplayerSessions),
  downloads: many(storyDownloads),
  assets: many(storyAssets),
}));

export const storyRolesRelations = relations(storyRoles, ({ one, many }) => ({
  story: one(stories, {
    fields: [storyRoles.storyId],
    references: [stories.id],
  }),
  players: many(multiplayerPlayers),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  story: one(stories, {
    fields: [chapters.storyId],
    references: [stories.id],
  }),
  nodes: many(nodes),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  story: one(stories, {
    fields: [nodes.storyId],
    references: [stories.id],
  }),
  chapter: one(chapters, {
    fields: [nodes.chapterId],
    references: [chapters.id],
  }),
  componentVersion: one(componentVersions, {
    fields: [nodes.componentVersionId],
    references: [componentVersions.id],
  }),
  outgoingEdges: many(edges, { relationName: 'sourceEdges' }),
  incomingEdges: many(edges, { relationName: 'targetEdges' }),
  syncPoint: one(syncPoints),
}));

export const edgesRelations = relations(edges, ({ one }) => ({
  sourceNode: one(nodes, {
    fields: [edges.sourceNodeId],
    references: [nodes.id],
    relationName: 'sourceEdges',
  }),
  targetNode: one(nodes, {
    fields: [edges.targetNodeId],
    references: [nodes.id],
    relationName: 'targetEdges',
  }),
}));

export const syncPointsRelations = relations(syncPoints, ({ one }) => ({
  story: one(stories, {
    fields: [syncPoints.storyId],
    references: [stories.id],
  }),
  node: one(nodes, {
    fields: [syncPoints.nodeId],
    references: [nodes.id],
  }),
  sideContentNode: one(nodes, {
    fields: [syncPoints.sideContentNodeId],
    references: [nodes.id],
  }),
}));

export const componentTypesRelations = relations(componentTypes, ({ many }) => ({
  versions: many(componentVersions),
}));

export const componentVersionsRelations = relations(componentVersions, ({ one }) => ({
  componentType: one(componentTypes, {
    fields: [componentVersions.componentTypeId],
    references: [componentTypes.id],
  }),
}));

export const storyManifestsRelations = relations(storyManifests, ({ one }) => ({
  story: one(stories, {
    fields: [storyManifests.storyId],
    references: [stories.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
  stories: many(stories),
  sessions: many(storySessions),
  multiplayerPlayers: many(multiplayerPlayers),
  hostedSessions: many(multiplayerSessions),
  achievements: many(userAchievements),
  downloads: many(storyDownloads),
  events: many(events),
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(profiles, {
    fields: [userAchievements.userId],
    references: [profiles.id],
  }),
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
  story: one(stories, {
    fields: [userAchievements.storyId],
    references: [stories.id],
  }),
}));

export const storySessionsRelations = relations(storySessions, ({ one }) => ({
  user: one(profiles, {
    fields: [storySessions.userId],
    references: [profiles.id],
  }),
  story: one(stories, {
    fields: [storySessions.storyId],
    references: [stories.id],
  }),
  currentNode: one(nodes, {
    fields: [storySessions.currentNodeId],
    references: [nodes.id],
  }),
}));

export const multiplayerSessionsRelations = relations(multiplayerSessions, ({ one, many }) => ({
  story: one(stories, {
    fields: [multiplayerSessions.storyId],
    references: [stories.id],
  }),
  host: one(profiles, {
    fields: [multiplayerSessions.hostUserId],
    references: [profiles.id],
  }),
  currentSyncPoint: one(syncPoints, {
    fields: [multiplayerSessions.currentSyncPointId],
    references: [syncPoints.id],
  }),
  players: many(multiplayerPlayers),
}));

export const multiplayerPlayersRelations = relations(multiplayerPlayers, ({ one }) => ({
  session: one(multiplayerSessions, {
    fields: [multiplayerPlayers.sessionId],
    references: [multiplayerSessions.id],
  }),
  user: one(profiles, {
    fields: [multiplayerPlayers.userId],
    references: [profiles.id],
  }),
  role: one(storyRoles, {
    fields: [multiplayerPlayers.roleId],
    references: [storyRoles.id],
  }),
  currentNode: one(nodes, {
    fields: [multiplayerPlayers.currentNodeId],
    references: [nodes.id],
  }),
}));

export const storyDownloadsRelations = relations(storyDownloads, ({ one }) => ({
  user: one(profiles, {
    fields: [storyDownloads.userId],
    references: [profiles.id],
  }),
  story: one(stories, {
    fields: [storyDownloads.storyId],
    references: [stories.id],
  }),
}));

export const storyAssetsRelations = relations(storyAssets, ({ one }) => ({
  story: one(stories, {
    fields: [storyAssets.storyId],
    references: [stories.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(profiles, {
    fields: [events.userId],
    references: [profiles.id],
  }),
  story: one(stories, {
    fields: [events.storyId],
    references: [stories.id],
  }),
  node: one(nodes, {
    fields: [events.nodeId],
    references: [nodes.id],
  }),
}));
