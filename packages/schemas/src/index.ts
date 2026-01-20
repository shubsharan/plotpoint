import { z } from 'zod';

// ============================================
// NOTE: Database entity types (Story, StoryNode, etc.) are now imported from @plotpoint/db
// This package contains ONLY validation schemas and runtime utility types
// ============================================

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
// Runtime Utility Schemas
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

// ============================================
// Authentication Schemas
// ============================================

// Base field schemas
export const emailSchema = z.string().email('Please enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const signInPasswordSchema = z
  .string()
  .min(1, 'Password is required');

export const displayNameSchema = z
  .string()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be less than 50 characters')
  .optional();

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
  .optional();

// Form schemas
export const signUpFormSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    displayName: displayNameSchema,
    username: usernameSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const signInFormSchema = z.object({
  email: emailSchema,
  password: signInPasswordSchema,
});

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const updateProfileFormSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  isPublic: z.boolean().optional(),
});

// ============================================
// API Validation Schemas
// ============================================

// Asset management
export const assetTypeSchema = z.enum(['image', 'video', 'audio', 'document', 'other']);

export const createStoryAssetSchema = z.object({
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
});

export const updateStoryAssetSchema = z.object({
  assetType: assetTypeSchema.optional(),
  filename: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  publicUrl: z.string().url().optional(),
  sizeBytes: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  referencedByNodes: z.array(z.string().uuid()).optional(),
  contentHash: z.string().optional(),
});

// ============================================
// BLOCK Props Schemas
// ============================================
export const baseComponentPropsSchema = z.object({
  className: z.string().optional(),
  testId: z.string().optional(),
});

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
export type EdgeConditionOperator = z.infer<typeof edgeConditionOperatorSchema>;
export type EdgeCondition = z.infer<typeof edgeConditionSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type CreateStoryAsset = z.infer<typeof createStoryAssetSchema>;
export type UpdateStoryAsset = z.infer<typeof updateStoryAssetSchema>;
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

// ============================================
// Component Registration & Runtime Types
// ============================================
// Import database types from @plotpoint/db
import type {
  Story,
  StoryNode,
  StoryEdge,
} from '@plotpoint/db';

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
// Utility Functions
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
