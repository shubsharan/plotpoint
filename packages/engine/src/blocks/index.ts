export type BlockScope = "game" | "user";

export type BlockRegistryEntry = {
  scope: BlockScope;
};

export type KnownBlockType = "clue" | "locked-door" | "qr-scanner" | "timer";

export const blockRegistry: Record<KnownBlockType, BlockRegistryEntry> = {
  clue: {
    scope: "user",
  },
  "locked-door": {
    scope: "user",
  },
  "qr-scanner": {
    scope: "user",
  },
  timer: {
    scope: "game",
  },
};

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);
