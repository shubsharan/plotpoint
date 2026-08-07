import type { JsonObject } from "@plotpoint/runtime";

export type PlayerState = JsonObject & {
  readonly attempts: number;
  readonly solved: boolean;
};

export type PuzzleContent = JsonObject & {
  readonly answerLabel: string;
  readonly clue: string;
  readonly clueAsset: "minimal.clue-image";
  readonly prompt: string;
  readonly title: string;
};

export function initializeMinimal(_content: PuzzleContent): PlayerState {
  return { attempts: 0, solved: false };
}
