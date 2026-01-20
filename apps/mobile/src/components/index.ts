/**
 * Components Index
 *
 * This file exports the component registry and component types.
 * Import this file to ensure all components are registered.
 */

// Re-export the registry initialization
export { componentRegistry } from './_registry';

// Export registry functions
export { registerComponent } from '@engine/registry';

// ============================================
// BLOCK Component Types
// ============================================
export type { TextBlockProps, TextBlockData } from './blocks/text-block/v1.0.0/types';
export type { VideoBlockProps, VideoBlockData } from './blocks/video-block/v1.0.0/types';

// ============================================
// GATE Component Types
// ============================================
export type { ChoiceGateProps, ChoiceGateData } from './gates/choice-gate/v1.0.0/types';

// ============================================
// OTHER Component Types
// ============================================
export type { InventoryActionProps, InventoryActionData } from './other/inventory-action/v1.0.0/types';
export type { EndNodeProps, EndNodeData } from './other/end/v1.0.0/types';

// ============================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================
export type { TextChapterProps, TextChapterData } from './text-chapter/v1.0.0/types';
export type { ChoiceDialogProps, ChoiceDialogData } from './choice-dialog/v1.0.0/types';
export type { VideoPlayerProps, VideoPlayerData } from './video-player/v1.0.0/types';
