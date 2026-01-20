import type { InventoryItem } from '@plotpoint/schemas';

/**
 * Get icon emoji for inventory action type
 */
export function getActionIcon(action: 'add' | 'remove' | 'check' | 'display'): string {
  switch (action) {
    case 'add':
      return '📦';
    case 'remove':
      return '🗑️';
    case 'check':
      return '🔍';
    case 'display':
      return '📋';
    default:
      return '📦';
  }
}

/**
 * Get title text for inventory action type
 */
export function getActionTitle(
  action: 'add' | 'remove' | 'check' | 'display',
  hasItem?: boolean
): string {
  switch (action) {
    case 'add':
      return 'Item Obtained!';
    case 'remove':
      return 'Item Removed';
    case 'check':
      return hasItem ? 'Item Found!' : 'Item Not Found';
    case 'display':
      return 'Your Inventory';
    default:
      return 'Inventory';
  }
}

/**
 * Check if an item exists in inventory with quantity > 0
 */
export function checkItem(inventory: InventoryItem[], itemId: string): boolean {
  return inventory.some((item) => item.id === itemId && item.quantity > 0);
}

/**
 * Add or update an item in inventory
 */
export function addItem(
  inventory: InventoryItem[],
  newItem: InventoryItem
): InventoryItem[] {
  const existingIndex = inventory.findIndex((item) => item.id === newItem.id);

  if (existingIndex !== -1) {
    // Update existing item quantity
    const updated = [...inventory];
    updated[existingIndex] = {
      ...updated[existingIndex],
      quantity: updated[existingIndex].quantity + newItem.quantity,
    };
    return updated;
  }

  // Add new item
  return [...inventory, newItem];
}

/**
 * Remove or decrease quantity of an item in inventory
 */
export function removeItem(
  inventory: InventoryItem[],
  itemId: string,
  quantity: number
): InventoryItem[] {
  return inventory
    .map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          quantity: Math.max(0, item.quantity - quantity),
        };
      }
      return item;
    })
    .filter((item) => item.quantity > 0);
}
