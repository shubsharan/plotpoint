import { z } from 'zod';

// ============================================
// Base Schemas
// ============================================
export const semVerSchema = z.object({
  major: z.number().int().min(0),
  minor: z.number().int().min(0),
  patch: z.number().int().min(0),
});

export const versionConstraintSchema = z.string().regex(
  /^(\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+$/,
  'Invalid version constraint format'
);

// ============================================
// Node Taxonomy Schemas
// ============================================
export const nodeCategorySchema = z.enum(['block', 'gate']);

// BLOCKS - Content nodes (passive display)
export const blockTypeNameSchema = z.enum([
  'text_block',
  'image_block',
  'video_block',
  'audio_block',
]);

// GATES - Unlock nodes (require input/condition)
export const gateTypeNameSchema = z.enum([
  'choice_gate',
  'geolocation_gate',
  'password_gate',
  'qr_gate',
  'timer_gate',
]);

// OTHER - Special node types
export const otherNodeTypeNameSchema = z.enum(['inventory_action', 'end']);

// All component types
export const componentTypeNameSchema = z.enum([
  // Blocks
  'text_block',
  'image_block',
  'video_block',
  'audio_block',
  // Gates
  'choice_gate',
  'geolocation_gate',
  'password_gate',
  'qr_gate',
  'timer_gate',
  // Other
  'inventory_action',
  'end',
]);

export const componentCategorySchema = z.enum(['block', 'gate', 'other']);

// ============================================
// Shell Schemas
// ============================================
export const shellTypeSchema = z.enum(['ebook', 'chat', 'map']);

export const shellConfigSchema = z.object({
  type: shellTypeSchema,
  settings: z.record(z.string(), z.unknown()).optional(),
});

// ============================================
// Location Schemas
// ============================================
export const locationTypeSchema = z.enum(['specific', 'category', 'none']);
export const locationFallbackSchema = z.enum(['wait', 'skip', 'manual_confirm']);
export const geographyTypeSchema = z.enum(['single_city', 'multi_region', 'location_agnostic']);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const locationConfigSchema = z.object({
  locationType: locationTypeSchema,
  coordinates: coordinatesSchema.optional(),
  venueCategory: z.string().optional(),
  radiusMeters: z.number().min(1).optional(),
  fallback: locationFallbackSchema.optional(),
  locationName: z.string().optional(),
});

// ============================================
// Venue Schemas
// ============================================
export const venueCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  osmTags: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  icon: z.string().optional(),
});

export const venueSchema = z.object({
  id: z.string().uuid(),
  osmId: z.string().optional(),
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  isSponsored: z.boolean(),
  isVerified: z.boolean(),
  sponsorPriority: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================
// Genre Schema
// ============================================
export const genreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

// ============================================
// Edge Condition Schemas
// ============================================
export const edgeConditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
  'not_contains',
  'has_item',
  'not_has_item',
  'and',
  'or',
]);

export const edgeConditionSchema: z.ZodType<{
  operator: z.infer<typeof edgeConditionOperatorSchema>;
  key?: string;
  value?: unknown;
  conditions?: Array<{
    operator: z.infer<typeof edgeConditionOperatorSchema>;
    key?: string;
    value?: unknown;
    conditions?: unknown[];
  }>;
}> = z.lazy(() =>
  z.object({
    operator: edgeConditionOperatorSchema,
    key: z.string().optional(),
    value: z.unknown().optional(),
    conditions: z.array(edgeConditionSchema).optional(),
  })
);

// ============================================
// Story & Node Schemas
// ============================================
export const storySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().nullable(),
  authorId: z.string().uuid(),
  status: z.enum(['draft', 'published', 'archived']),
  // Shell
  shellType: shellTypeSchema,
  // Metadata
  genreId: z.string().uuid().nullable(),
  estimatedDurationMinutes: z.number().int().min(1).nullable(),
  difficultyLevel: z.number().int().min(1).max(5).nullable(),
  coverImageUrl: z.string().url().nullable(),
  // Location
  geographyType: geographyTypeSchema,
  primaryCity: z.string().nullable(),
  primaryCountry: z.string().nullable(),
  // Navigation
  startNodeId: z.string().uuid().nullable(),
  // Multiplayer
  isMultiplayer: z.boolean(),
  minPlayers: z.number().int().min(1).nullable(),
  maxPlayers: z.number().int().min(1).nullable(),
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});

export const chapterSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  order: z.number().int(),
});

export const storyNodeSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  nodeKey: z.string().min(1),
  nodeCategory: nodeCategorySchema,
  nodeType: componentTypeNameSchema,
  chapterId: z.string().uuid().nullable(),
  componentVersionId: z.string().uuid().nullable(),
  data: z.record(z.string(), z.unknown()),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  order: z.number().int(),
  allowedRoles: z.array(z.string().uuid()).nullable(),
});

export const storyEdgeSchema = z.object({
  id: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  edgeType: z.enum(['default', 'choice', 'conditional']),
  label: z.string().nullable(),
  condition: edgeConditionSchema.nullable(),
  priority: z.number().int(),
  allowedRoles: z.array(z.string()).nullable(),
});

// ============================================
// Role Schemas (Multiplayer)
// ============================================
export const storyRoleSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable(),
  isRequired: z.boolean(),
  order: z.number().int(),
});

// ============================================
// Sync Point Schemas (Multiplayer)
// ============================================
export const syncBehaviorSchema = z.enum([
  'wait_screen',
  'side_content',
  'notification',
  'timeout_skip',
]);

export const syncPointSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  nodeId: z.string().uuid(),
  behavior: syncBehaviorSchema,
  timeoutSeconds: z.number().int().min(1).nullable(),
  sideContentNodeId: z.string().uuid().nullable(),
});

// ============================================
// Inventory & State Schemas
// ============================================
export const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  quantity: z.number().int().min(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const gameStateSchema = z.record(z.string(), z.unknown());

export const choiceHistoryEntrySchema = z.object({
  nodeId: z.string().uuid(),
  edgeId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

// ============================================
// Session Schemas
// ============================================
export const sessionStatusSchema = z.enum(['active', 'completed', 'archived', 'abandoned']);

export const storySessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  storyId: z.string().uuid(),
  currentNodeId: z.string().uuid().nullable(),
  status: sessionStatusSchema,
  gameState: gameStateSchema,
  inventory: z.array(inventoryItemSchema),
  visitedNodes: z.array(z.string().uuid()),
  choiceHistory: z.array(choiceHistoryEntrySchema),
  startedAt: z.string().datetime(),
  lastPlayedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const multiplayerStatusSchema = z.enum(['waiting', 'active', 'completed', 'abandoned']);

export const multiplayerPlayerSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid().nullable(),
  currentNodeId: z.string().uuid().nullable(),
  personalState: gameStateSchema,
  visitedNodes: z.array(z.string().uuid()),
  isConnected: z.boolean(),
  joinedAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});

export const multiplayerSessionSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  hostUserId: z.string().uuid(),
  joinCode: z.string().min(6).max(20),
  status: multiplayerStatusSchema,
  sharedState: gameStateSchema,
  sharedInventory: z.array(inventoryItemSchema),
  currentSyncPointId: z.string().uuid().nullable(),
  players: z.array(multiplayerPlayerSchema),
});

// Legacy type for backward compatibility
export const playerSlotSchema = z.object({
  userId: z.string().uuid(),
  role: z.string(),
  joinedAt: z.string().datetime(),
  isReady: z.boolean(),
});

// ============================================
// Profile & Achievements Schemas
// ============================================
export const profileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  bio: z.string().nullable(),
  isPublic: z.boolean(),
});

export const achievementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  category: z.string().nullable(),
  points: z.number().int().min(0),
  isSecret: z.boolean(),
});

export const userAchievementSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  achievementId: z.string().uuid(),
  storyId: z.string().uuid().nullable(),
  unlockedAt: z.string().datetime(),
});

// ============================================
// Story Assets Schemas
// ============================================
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

export const updateStoryAssetSchema = storyAssetSchema.partial().omit({
  id: true,
  storyId: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// Offline & Downloads Schemas
// ============================================
export const storyDownloadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  storyId: z.string().uuid(),
  version: z.string(),
  sizeBytes: z.number().int().nullable(),
  downloadedAt: z.string().datetime(),
  lastAccessedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

// ============================================
// Analytics & Events Schemas
// ============================================
export const eventTypeSchema = z.enum([
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

export const analyticsEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
  storyId: z.string().uuid().nullable(),
  nodeId: z.string().uuid().nullable(),
  eventType: eventTypeSchema,
  eventData: z.record(z.string(), z.unknown()),
  deviceInfo: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

// ============================================
// Manifest Schemas
// ============================================
export const storyManifestSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  requiredComponents: z.record(componentTypeNameSchema, versionConstraintSchema),
  engineVersion: z.string(),
  resolvedComponents: z.record(componentTypeNameSchema, z.string()).nullable(),
});

// ============================================
// Component Prop Schemas (Base)
// ============================================
export const baseComponentPropsSchema = z.object({
  className: z.string().optional(),
  testId: z.string().optional(),
});

// ============================================
// BLOCK Props Schemas
// ============================================

// Text Block Props
export const textBlockPropsSchema = baseComponentPropsSchema.extend({
  title: z.string().optional(),
  content: z.string().min(1),
  showContinueButton: z.boolean().default(true),
  continueButtonText: z.string().default('Continue'),
  autoAdvanceDelay: z.number().int().min(0).optional(),
  typingEffect: z.boolean().default(false),
  typingSpeed: z.number().int().min(1).max(100).default(30),
});

// Image Block Props
export const imageBlockPropsSchema = baseComponentPropsSchema.extend({
  imageUrl: z.string().url(),
  altText: z.string().optional(),
  caption: z.string().optional(),
  showContinueButton: z.boolean().default(true),
  continueButtonText: z.string().default('Continue'),
  fitMode: z.enum(['contain', 'cover', 'fill']).default('contain'),
});

// Video Block Props
export const videoBlockPropsSchema = baseComponentPropsSchema.extend({
  videoUrl: z.string().url(),
  posterUrl: z.string().url().optional(),
  autoPlay: z.boolean().default(false),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  showControls: z.boolean().default(true),
  onEndAction: z.enum(['pause', 'continue', 'loop']).default('continue'),
});

// Audio Block Props
export const audioBlockPropsSchema = baseComponentPropsSchema.extend({
  audioUrl: z.string().url(),
  title: z.string().optional(),
  artist: z.string().optional(),
  coverUrl: z.string().url().optional(),
  autoPlay: z.boolean().default(false),
  loop: z.boolean().default(false),
  showControls: z.boolean().default(true),
  showContinueButton: z.boolean().default(true),
  continueButtonText: z.string().default('Continue'),
  onEndAction: z.enum(['pause', 'continue', 'loop']).default('continue'),
});

// ============================================
// GATE Props Schemas
// ============================================

// Choice Gate Props
export const choiceGatePropsSchema = baseComponentPropsSchema.extend({
  prompt: z.string().optional(),
  showPrompt: z.boolean().default(true),
  shuffleChoices: z.boolean().default(false),
  timedChoice: z.boolean().default(false),
  timeLimit: z.number().int().min(1).optional(),
  defaultChoice: z.string().optional(),
});

// Geolocation Gate Props
export const geolocationGatePropsSchema = baseComponentPropsSchema.extend({
  // Location configuration
  locationType: locationTypeSchema.default('specific'),
  // For specific locations
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // For category-based locations
  venueCategory: z.string().optional(),
  // Common settings
  radiusMeters: z.number().min(1).default(50),
  locationName: z.string().optional(),
  hintText: z.string().default('Go to the specified location to continue'),
  showMap: z.boolean().default(true),
  showDistance: z.boolean().default(true),
  fallback: locationFallbackSchema.default('wait'),
});

// Password Gate Props
export const passwordGatePropsSchema = baseComponentPropsSchema.extend({
  expectedValue: z.string().min(1),
  isCaseSensitive: z.boolean().default(false),
  isNumeric: z.boolean().default(false),
  hintText: z.string().default('Enter the password to continue'),
  placeholder: z.string().default('Enter code...'),
  successMessage: z.string().default('Correct!'),
  errorMessage: z.string().default('Incorrect. Try again.'),
  maxAttempts: z.number().int().min(0).default(0), // 0 = unlimited
  storeAs: z.string().optional(),
});

// QR Gate Props
export const qrGatePropsSchema = baseComponentPropsSchema.extend({
  expectedValue: z.string().optional(),
  hintText: z.string().default('Scan a QR code to continue'),
  successMessage: z.string().default('QR code scanned successfully!'),
  errorMessage: z.string().default('Invalid QR code. Try again.'),
  storeAs: z.string().optional(),
});

// Timer Gate Props
export const timerGatePropsSchema = baseComponentPropsSchema.extend({
  // Duration-based timer
  durationSeconds: z.number().int().min(1).optional(),
  // Time-based timer (wait until specific time)
  targetTime: z.string().datetime().optional(),
  // Display options
  showCountdown: z.boolean().default(true),
  message: z.string().default('Please wait...'),
  completionMessage: z.string().default('You may now continue'),
  autoAdvance: z.boolean().default(true),
});

// ============================================
// OTHER Props Schemas
// ============================================

// Inventory Action Props
export const inventoryActionPropsSchema = baseComponentPropsSchema.extend({
  action: z.enum(['add', 'remove', 'check', 'display']),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  itemDescription: z.string().optional(),
  itemImageUrl: z.string().url().optional(),
  quantity: z.number().int().default(1),
  message: z.string().optional(),
  autoAdvance: z.boolean().default(true),
});

// End Node Props
export const endNodePropsSchema = baseComponentPropsSchema.extend({
  endingType: z.enum(['success', 'failure', 'neutral', 'secret']).default('neutral'),
  title: z.string().optional(),
  message: z.string().optional(),
  showStats: z.boolean().default(false),
  allowRestart: z.boolean().default(true),
  showCredits: z.boolean().default(false),
});

// ============================================
// Legacy Aliases (for backward compatibility)
// ============================================
export const textChapterPropsSchema = textBlockPropsSchema;
export const choiceDialogPropsSchema = choiceGatePropsSchema;
export const videoPlayerPropsSchema = videoBlockPropsSchema;
export const qrScannerPropsSchema = qrGatePropsSchema;
export const geolocationLockPropsSchema = geolocationGatePropsSchema;

// ============================================
// Export type inference helpers
// ============================================
export type SemVer = z.infer<typeof semVerSchema>;
export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type NodeCategory = z.infer<typeof nodeCategorySchema>;
export type BlockTypeName = z.infer<typeof blockTypeNameSchema>;
export type GateTypeName = z.infer<typeof gateTypeNameSchema>;
export type OtherNodeTypeName = z.infer<typeof otherNodeTypeNameSchema>;
export type ComponentTypeName = z.infer<typeof componentTypeNameSchema>;
export type ComponentCategory = z.infer<typeof componentCategorySchema>;
export type ShellType = z.infer<typeof shellTypeSchema>;
export type ShellConfig = z.infer<typeof shellConfigSchema>;
export type LocationType = z.infer<typeof locationTypeSchema>;
export type LocationFallback = z.infer<typeof locationFallbackSchema>;
export type GeographyType = z.infer<typeof geographyTypeSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type LocationConfig = z.infer<typeof locationConfigSchema>;
export type VenueCategory = z.infer<typeof venueCategorySchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Genre = z.infer<typeof genreSchema>;
export type EdgeCondition = z.infer<typeof edgeConditionSchema>;
export type Story = z.infer<typeof storySchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type StoryNode = z.infer<typeof storyNodeSchema>;
export type StoryEdge = z.infer<typeof storyEdgeSchema>;
export type StoryRole = z.infer<typeof storyRoleSchema>;
export type SyncBehavior = z.infer<typeof syncBehaviorSchema>;
export type SyncPoint = z.infer<typeof syncPointSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type ChoiceHistoryEntry = z.infer<typeof choiceHistoryEntrySchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type StorySession = z.infer<typeof storySessionSchema>;
export type MultiplayerStatus = z.infer<typeof multiplayerStatusSchema>;
export type MultiplayerPlayer = z.infer<typeof multiplayerPlayerSchema>;
export type MultiplayerSession = z.infer<typeof multiplayerSessionSchema>;
export type PlayerSlot = z.infer<typeof playerSlotSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type UserAchievement = z.infer<typeof userAchievementSchema>;
export type StoryDownload = z.infer<typeof storyDownloadSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type StoryAsset = z.infer<typeof storyAssetSchema>;
export type CreateStoryAsset = z.infer<typeof createStoryAssetSchema>;
export type UpdateStoryAsset = z.infer<typeof updateStoryAssetSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type StoryManifest = z.infer<typeof storyManifestSchema>;
// Block props
export type TextBlockProps = z.infer<typeof textBlockPropsSchema>;
export type ImageBlockProps = z.infer<typeof imageBlockPropsSchema>;
export type VideoBlockProps = z.infer<typeof videoBlockPropsSchema>;
export type AudioBlockProps = z.infer<typeof audioBlockPropsSchema>;
// Gate props
export type ChoiceGateProps = z.infer<typeof choiceGatePropsSchema>;
export type GeolocationGateProps = z.infer<typeof geolocationGatePropsSchema>;
export type PasswordGateProps = z.infer<typeof passwordGatePropsSchema>;
export type QRGateProps = z.infer<typeof qrGatePropsSchema>;
export type TimerGateProps = z.infer<typeof timerGatePropsSchema>;
// Other props
export type InventoryActionProps = z.infer<typeof inventoryActionPropsSchema>;
export type EndNodeProps = z.infer<typeof endNodePropsSchema>;
// Legacy aliases
export type TextChapterProps = TextBlockProps;
export type ChoiceDialogProps = ChoiceGateProps;
export type VideoPlayerProps = VideoBlockProps;
export type QRScannerProps = QRGateProps;
export type GeolocationLockProps = GeolocationGateProps;
