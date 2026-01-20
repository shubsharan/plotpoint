// Type definitions for Plotpoint platform

// ============================================
// Semantic Versioning Types
// ============================================
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export type VersionConstraint = string; // e.g., "^1.0.0", ">=2.0.0", "1.2.3"

// ============================================
// Node Taxonomy
// ============================================
export type NodeCategory = 'block' | 'gate';

// BLOCKS - Content nodes (passive display)
export type BlockTypeName =
  | 'text_block'
  | 'image_block'
  | 'video_block'
  | 'audio_block';

// GATES - Unlock nodes (require input/condition)
export type GateTypeName =
  | 'choice_gate'
  | 'geolocation_gate'
  | 'password_gate'
  | 'qr_gate'
  | 'timer_gate';

// OTHER - Special node types
export type OtherNodeTypeName = 'inventory_action' | 'end';

// All component types
export type ComponentTypeName = BlockTypeName | GateTypeName | OtherNodeTypeName;

// Component categories for organization
export type ComponentCategory = 'block' | 'gate' | 'other';

// ============================================
// Shell Types
// ============================================
export type ShellType = 'ebook' | 'chat' | 'map';

export interface ShellConfig {
  type: ShellType;
  settings?: Record<string, unknown>;
}

// ============================================
// Location Types
// ============================================
export type LocationType = 'specific' | 'category' | 'none';
export type LocationFallback = 'wait' | 'skip' | 'manual_confirm';
export type GeographyType = 'single_city' | 'multi_region' | 'location_agnostic';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationConfig {
  locationType: LocationType;
  // For specific locations
  coordinates?: Coordinates;
  // For category-based locations
  venueCategory?: string;
  // Common settings
  radiusMeters?: number;
  fallback?: LocationFallback;
  locationName?: string;
}

// ============================================
// Venue Types
// ============================================
export interface VenueCategory {
  id: string;
  name: string;
  displayName: string;
  osmTags: Record<string, string | string[]>;
  icon?: string;
}

export interface Venue {
  id: string;
  osmId?: string;
  categoryId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  isSponsored: boolean;
  isVerified: boolean;
  sponsorPriority: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Genre Types
// ============================================
export interface Genre {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
}

// ============================================
// Story & Node Types
// ============================================
export interface Story {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  authorId: string;
  status: 'draft' | 'published' | 'archived';
  // Shell
  shellType: ShellType;
  // Metadata
  genreId: string | null;
  estimatedDurationMinutes: number | null;
  difficultyLevel: number | null;
  coverImageUrl: string | null;
  // Location
  geographyType: GeographyType;
  primaryCity: string | null;
  primaryCountry: string | null;
  // Navigation
  startNodeId: string | null;
  // Multiplayer
  isMultiplayer: boolean;
  minPlayers: number | null;
  maxPlayers: number | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface StoryNode {
  id: string;
  storyId: string;
  nodeKey: string;
  nodeCategory: NodeCategory;
  nodeType: ComponentTypeName;
  chapterId: string | null;
  componentVersionId: string | null;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  order: number;
  allowedRoles: string[] | null;
}

export interface StoryEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: 'default' | 'choice' | 'conditional';
  label: string | null;
  condition: EdgeCondition | null;
  priority: number;
  allowedRoles: string[] | null;
}

export interface Chapter {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  order: number;
}

// ============================================
// Role Types (Multiplayer)
// ============================================
export interface StoryRole {
  id: string;
  storyId: string;
  name: string;
  displayName: string;
  description: string | null;
  isRequired: boolean;
  order: number;
}

// ============================================
// Sync Point Types (Multiplayer)
// ============================================
export type SyncBehavior = 'wait_screen' | 'side_content' | 'notification' | 'timeout_skip';

export interface SyncPoint {
  id: string;
  storyId: string;
  nodeId: string;
  behavior: SyncBehavior;
  timeoutSeconds: number | null;
  sideContentNodeId: string | null;
}

// ============================================
// Edge Conditions
// ============================================
export type EdgeConditionOperator =
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

export interface EdgeCondition {
  operator: EdgeConditionOperator;
  // For comparison operations
  key?: string; // State key to check
  value?: unknown; // Value to compare against
  // For logical operations (and/or)
  conditions?: EdgeCondition[];
}

// ============================================
// Game State & Session
// ============================================
export interface GameState {
  [key: string]: unknown;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface ChoiceHistoryEntry {
  nodeId: string;
  edgeId: string;
  timestamp: string;
}

export type SessionStatus = 'active' | 'completed' | 'archived' | 'abandoned';

export interface StorySession {
  id: string;
  userId: string;
  storyId: string;
  currentNodeId: string | null;
  status: SessionStatus;
  gameState: GameState;
  inventory: InventoryItem[];
  visitedNodes: string[];
  choiceHistory: ChoiceHistoryEntry[];
  startedAt: string;
  lastPlayedAt: string;
  completedAt: string | null;
}

// ============================================
// Story Manifest
// ============================================
export interface StoryManifest {
  id: string;
  storyId: string;
  requiredComponents: Record<ComponentTypeName, VersionConstraint>;
  engineVersion: string;
  resolvedComponents: Record<ComponentTypeName, string> | null;
}

// ============================================
// Component Registration
// ============================================
export interface ComponentContext {
  gameState: GameState;
  inventory: InventoryItem[];
  visitedNodes: string[];
  sessionId: string;
  // Shell context
  shellType: ShellType;
  // Callbacks
  onComplete: () => void;
  onNavigate: (edgeId: string) => void;
  onStateUpdate: (updates: Partial<GameState>) => void;
  onInventoryUpdate: (item: InventoryItem, action: 'add' | 'remove' | 'update') => void;
}

export interface ComponentProps<TData = Record<string, unknown>> {
  data: TData;
  context: ComponentContext;
  edges: StoryEdge[];
}

export type StoryComponent<TData = Record<string, unknown>> = any; // React.ComponentType<ComponentProps<TData>> - defined in consuming app

export interface ComponentRegistration<TData = Record<string, unknown>> {
  componentType: ComponentTypeName;
  version: string;
  Component: StoryComponent<TData>;
  propsSchema: unknown; // Zod schema
  defaultProps?: Partial<TData>;
  dependencies?: Record<ComponentTypeName, VersionConstraint>;
}

export interface RegisteredComponent<TData = Record<string, unknown>> {
  componentType: ComponentTypeName;
  category: ComponentCategory;
  version: SemVer;
  versionString: string;
  Component: StoryComponent<TData>;
  propsSchema: unknown;
  defaultProps: Partial<TData>;
  dependencies: Record<ComponentTypeName, VersionConstraint>;
}

// ============================================
// Profile & Achievements
// ============================================
export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPublic: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  points: number;
  isSecret: boolean;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  storyId: string | null;
  unlockedAt: string;
}

// ============================================
// Multiplayer Types
// ============================================
export type MultiplayerStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

export interface MultiplayerPlayer {
  id: string;
  sessionId: string;
  userId: string;
  roleId: string | null;
  currentNodeId: string | null;
  personalState: GameState;
  visitedNodes: string[];
  isConnected: boolean;
  joinedAt: string;
  lastActiveAt: string;
}

export interface MultiplayerSession {
  id: string;
  storyId: string;
  hostUserId: string;
  joinCode: string;
  status: MultiplayerStatus;
  sharedState: GameState;
  sharedInventory: InventoryItem[];
  currentSyncPointId: string | null;
  players: MultiplayerPlayer[];
}

// Legacy type for backward compatibility
export interface PlayerSlot {
  userId: string;
  role: string;
  joinedAt: string;
  isReady: boolean;
}

// ============================================
// Offline & Downloads
// ============================================
export interface StoryDownload {
  id: string;
  userId: string;
  storyId: string;
  version: string;
  sizeBytes: number | null;
  downloadedAt: string;
  lastAccessedAt: string | null;
  expiresAt: string | null;
}

// ============================================
// Analytics & Events
// ============================================
export type EventType =
  | 'story_started'
  | 'story_completed'
  | 'story_abandoned'
  | 'node_visited'
  | 'choice_made'
  | 'gate_unlocked'
  | 'gate_failed'
  | 'session_joined'
  | 'session_left'
  | 'achievement_unlocked';

export interface AnalyticsEvent {
  id: string;
  userId: string | null;
  sessionId: string | null;
  storyId: string | null;
  nodeId: string | null;
  eventType: EventType;
  eventData: Record<string, unknown>;
  deviceInfo: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// Engine Types
// ============================================
export interface VersionResolutionResult {
  resolved: boolean;
  version: SemVer | null;
  versionString: string | null;
  error?: string;
}

export interface ManifestResolution {
  success: boolean;
  resolved: Record<ComponentTypeName, string>;
  errors: Array<{
    componentType: ComponentTypeName;
    constraint: VersionConstraint;
    error: string;
  }>;
}

// ============================================
// Utility Types
// ============================================

// Helper to determine category from component type
export function getComponentCategory(componentType: ComponentTypeName): ComponentCategory {
  if (componentType.endsWith('_block')) return 'block';
  if (componentType.endsWith('_gate')) return 'gate';
  return 'other';
}

// Helper to check if a component type is a block
export function isBlockType(componentType: ComponentTypeName): componentType is BlockTypeName {
  return componentType.endsWith('_block');
}

// Helper to check if a component type is a gate
export function isGateType(componentType: ComponentTypeName): componentType is GateTypeName {
  return componentType.endsWith('_gate');
}
