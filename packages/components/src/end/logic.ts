import type { InventoryItem } from '@plotpoint/schemas';

export interface EndingConfig {
  icon: string;
  defaultTitle: string;
  backgroundColor: string;
  accentColor: string;
}

/**
 * Get configuration for different ending types
 */
export function getEndingConfig(
  endingType: 'success' | 'failure' | 'secret' | 'neutral'
): EndingConfig {
  switch (endingType) {
    case 'success':
      return {
        icon: '🏆',
        defaultTitle: 'Victory!',
        backgroundColor: '#1a3d1a',
        accentColor: '#4ade80',
      };
    case 'failure':
      return {
        icon: '💀',
        defaultTitle: 'Game Over',
        backgroundColor: '#3d1a1a',
        accentColor: '#f87171',
      };
    case 'secret':
      return {
        icon: '🌟',
        defaultTitle: 'Secret Ending',
        backgroundColor: '#3d3d1a',
        accentColor: '#fbbf24',
      };
    case 'neutral':
    default:
      return {
        icon: '📖',
        defaultTitle: 'The End',
        backgroundColor: '#1a1a1a',
        accentColor: '#94a3b8',
      };
  }
}

/**
 * Calculate total items in inventory
 */
export function calculateTotalItems(inventory: InventoryItem[]): number {
  return inventory.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Calculate journey statistics
 */
export function calculateStats(
  visitedNodes: string[],
  inventory: InventoryItem[]
): {
  nodesVisited: number;
  itemsCollected: number;
} {
  return {
    nodesVisited: visitedNodes.length,
    itemsCollected: calculateTotalItems(inventory),
  };
}
