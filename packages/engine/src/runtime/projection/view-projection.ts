import type { StoryPackage } from '../../story-packages/schema.js';
import { resolveEffectiveBlockStateOrThrow } from '../context/block-resolution.js';
import type { CurrentNodeView, RuntimeView, SessionState, TraversableEdge } from '../types.js';

type StoryNode = StoryPackage['graph']['nodes'][number];

export const createCurrentNodeViewOrThrow = (
  state: SessionState,
  node: StoryNode,
): CurrentNodeView => ({
  blocks: node.blocks.map((block) => resolveEffectiveBlockStateOrThrow(state, node.id, block).currentNodeBlock),
  id: node.id,
  title: node.title,
});

export const createRuntimeView = (
  currentNode: CurrentNodeView,
  traversableEdges: TraversableEdge[],
): RuntimeView => ({
  currentNode,
  traversableEdges,
});
