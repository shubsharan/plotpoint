import type { ComponentProps } from '@plotpoint/types';

export interface InventoryActionData {
  action: 'add' | 'remove' | 'check' | 'display';
  itemId?: string;
  itemName?: string;
  itemDescription?: string;
  itemImageUrl?: string;
  quantity?: number;
  message?: string;
  autoAdvance?: boolean;
}

export type InventoryActionProps = ComponentProps<InventoryActionData>;
