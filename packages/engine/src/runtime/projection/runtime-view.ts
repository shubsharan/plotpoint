import type { StoryPackageNode } from '../../story-packages/schema.js';
import { resolveEffectiveBlockStateOrThrow } from '../context/block-resolution.js';
import type { CurrentNodeView, RuntimeView, SessionState, TraversableEdge } from '../types.js';

export const projectCurrentNodeViewOrThrow = (
  state: SessionState,
  node: StoryPackageNode,
): CurrentNodeView => ({
  blocks: node.blocks.map(
    (block) => resolveEffectiveBlockStateOrThrow(state, node.id, block).currentNodeBlock,
  ),
  id: node.id,
  title: node.title,
});

export const projectRuntimeView = (
  currentNode: CurrentNodeView,
  traversableEdges: TraversableEdge[],
): RuntimeView => ({
  currentNode,
  traversableEdges,
});
