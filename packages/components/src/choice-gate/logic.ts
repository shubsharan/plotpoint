import type { StoryEdge } from '@plotpoint/db';

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffleChoices<T>(choices: T[], shouldShuffle: boolean): T[] {
  if (!shouldShuffle) return choices;

  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Validate that a selection is in the list of valid choices
 */
export function validateSelection(edgeId: string, validChoiceIds: string[]): boolean {
  return validChoiceIds.includes(edgeId);
}

/**
 * Get the default choice from a list of choices
 */
export function getDefaultChoice(
  choices: { id: string; isDefault?: boolean }[]
): string | null {
  const defaultChoice = choices.find(c => c.isDefault);
  return defaultChoice?.id ?? null;
}

/**
 * Filter edges to get only choice-type edges
 */
export function getChoiceEdges(edges: StoryEdge[]): StoryEdge[] {
  return edges.filter(e => e.edgeType === 'choice');
}
