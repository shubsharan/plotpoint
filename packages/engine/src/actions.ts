import type { InventoryItem } from '@plotpoint/schemas';

/**
 * External actions that components can invoke.
 * This is the "vocabulary" of what components can ask the engine to do.
 * Apps provide implementations; components declare which actions they need.
 */
export interface EngineActions {
  // Navigation
  navigate: (edgeId: string) => void;

  // Node completion (blocks use this to signal they're done)
  completeNode: () => void;

  // Gate outcomes
  unlockNode: () => void;
  rejectUnlock: (reason?: string) => void;

  // State mutations
  updateGameState: (key: string, value: unknown) => void;
  updateInventory: (item: InventoryItem, action: 'add' | 'remove') => void;
}

/**
 * Helper type for components to pick which actions they need.
 * Example: type MyActions = PickActions<'navigate' | 'completeNode'>;
 */
export type PickActions<K extends keyof EngineActions> = Pick<EngineActions, K>;
