// Export all schema definitions
export * from './schema';

// ============================================
// Drizzle-Inferred Types
// ============================================
// These types are automatically inferred from the Drizzle schema.
// They serve as the single source of truth for database types.

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  stories,
  nodes,
  edges,
  chapters,
  storyRoles,
  syncPoints,
  genres,
  venueCategories,
  venues,
  componentTypes,
  componentVersions,
  storyManifests,
  profiles,
  achievements,
  userAchievements,
  storySessions,
  multiplayerSessions,
  multiplayerPlayers,
  storyDownloads,
  storyAssets,
  events,
} from './schema';

// ============================================
// Story & Content Types
// ============================================
export type Story = InferSelectModel<typeof stories>;
export type NewStory = InferInsertModel<typeof stories>;

export type StoryNode = InferSelectModel<typeof nodes>;
export type NewStoryNode = InferInsertModel<typeof nodes>;

export type StoryEdge = InferSelectModel<typeof edges>;
export type NewStoryEdge = InferInsertModel<typeof edges>;

export type Chapter = InferSelectModel<typeof chapters>;
export type NewChapter = InferInsertModel<typeof chapters>;

export type StoryRole = InferSelectModel<typeof storyRoles>;
export type NewStoryRole = InferInsertModel<typeof storyRoles>;

export type SyncPoint = InferSelectModel<typeof syncPoints>;
export type NewSyncPoint = InferInsertModel<typeof syncPoints>;

// ============================================
// Component System Types
// ============================================
export type ComponentType = InferSelectModel<typeof componentTypes>;
export type NewComponentType = InferInsertModel<typeof componentTypes>;

export type ComponentVersion = InferSelectModel<typeof componentVersions>;
export type NewComponentVersion = InferInsertModel<typeof componentVersions>;

export type StoryManifest = InferSelectModel<typeof storyManifests>;
export type NewStoryManifest = InferInsertModel<typeof storyManifests>;

// ============================================
// Location Types
// ============================================
export type Genre = InferSelectModel<typeof genres>;
export type NewGenre = InferInsertModel<typeof genres>;

export type VenueCategory = InferSelectModel<typeof venueCategories>;
export type NewVenueCategory = InferInsertModel<typeof venueCategories>;

export type Venue = InferSelectModel<typeof venues>;
export type NewVenue = InferInsertModel<typeof venues>;

// ============================================
// User & Profile Types
// ============================================
export type Profile = InferSelectModel<typeof profiles>;
export type NewProfile = InferInsertModel<typeof profiles>;

export type Achievement = InferSelectModel<typeof achievements>;
export type NewAchievement = InferInsertModel<typeof achievements>;

export type UserAchievement = InferSelectModel<typeof userAchievements>;
export type NewUserAchievement = InferInsertModel<typeof userAchievements>;

// ============================================
// Session Types
// ============================================
export type StorySession = InferSelectModel<typeof storySessions>;
export type NewStorySession = InferInsertModel<typeof storySessions>;

export type MultiplayerSession = InferSelectModel<typeof multiplayerSessions>;
export type NewMultiplayerSession = InferInsertModel<typeof multiplayerSessions>;

export type MultiplayerPlayer = InferSelectModel<typeof multiplayerPlayers>;
export type NewMultiplayerPlayer = InferInsertModel<typeof multiplayerPlayers>;

// ============================================
// Asset & Download Types
// ============================================
export type StoryDownload = InferSelectModel<typeof storyDownloads>;
export type NewStoryDownload = InferInsertModel<typeof storyDownloads>;

export type StoryAsset = InferSelectModel<typeof storyAssets>;
export type NewStoryAsset = InferInsertModel<typeof storyAssets>;

// ============================================
// Analytics Types
// ============================================
export type AnalyticsEvent = InferSelectModel<typeof events>;
export type NewAnalyticsEvent = InferInsertModel<typeof events>;
