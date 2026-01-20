import { describe, it, expect, vi } from 'vitest';
import { createStoryExecutor } from '../story-executor';
import type { EngineEvent } from '../../events/event-emitter';
import {
  createLinearGraph,
  createSimpleTestGraph,
  createConditionalTestGraph,
} from '../../testing/graph-builders';

describe('createStoryExecutor', () => {
  it('should create a valid executor', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    expect(executor).toBeDefined();
    expect(typeof executor.start).toBe('function');
    expect(typeof executor.navigate).toBe('function');
    expect(typeof executor.getContext).toBe('function');
  });
});

describe('start', () => {
  it('should set currentNode to start node', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    const ctx = executor.start();

    expect(ctx.currentNode?.id).toBe('node-0');
  });

  it('should emit STORY_STARTED and NODE_ENTERED events', () => {
    const graph = createLinearGraph(3);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();

    expect(events.map((e) => e.type)).toEqual(['STORY_STARTED', 'NODE_ENTERED']);
  });

  it('should mark start node as visited', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    const ctx = executor.start();

    expect(ctx.visitedNodes).toContain('node-0');
  });
});

describe('navigate', () => {
  it('should move to target node via edge', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    const ctx = executor.navigate('edge-0');

    expect(ctx.currentNode?.id).toBe('node-1');
  });

  it('should throw for unavailable edge', () => {
    const graph = createConditionalTestGraph();
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.completeCurrentNode(); // Move to 'check' node

    // edge-2 is conditional (requires hasKey: true)
    expect(() => executor.navigate('edge-2')).toThrow();
  });

  it('should emit EDGE_TRAVERSED, NODE_EXITED, NODE_ENTERED events', () => {
    const graph = createLinearGraph(3);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    events.length = 0; // Clear start events

    executor.navigate('edge-0');

    expect(events.map((e) => e.type)).toEqual([
      'EDGE_TRAVERSED',
      'NODE_EXITED',
      'NODE_ENTERED',
    ]);
  });

  it('should record choice in history', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.navigate('edge-0');

    const state = executor.getState();
    expect(state.choiceHistory).toHaveLength(1);
    expect(state.choiceHistory[0].edgeId).toBe('edge-0');
  });
});

describe('completeCurrentNode', () => {
  it('should follow default edge', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    const ctx = executor.completeCurrentNode();

    expect(ctx.currentNode?.id).toBe('node-1');
  });

  it('should throw if no default edge', () => {
    const graph = createSimpleTestGraph(); // middle node has only choice edge
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.completeCurrentNode(); // Move to middle

    expect(() => executor.completeCurrentNode()).toThrow();
  });
});

describe('updateGameState', () => {
  it('should update game state', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.updateGameState({ score: 100, name: 'Player' });

    const ctx = executor.getContext();
    expect(ctx.gameState.score).toBe(100);
    expect(ctx.gameState.name).toBe('Player');
  });

  it('should emit STATE_UPDATED event', () => {
    const graph = createLinearGraph(3);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    events.length = 0;

    executor.updateGameState({ score: 100 });

    expect(events[0].type).toBe('STATE_UPDATED');
    expect(events[0].data?.updates).toEqual({ score: 100 });
  });
});

describe('updateInventory', () => {
  it('should add item to inventory', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.updateInventory({ id: 'key', name: 'Golden Key', quantity: 1 }, 'add');

    const ctx = executor.getContext();
    expect(ctx.inventory).toHaveLength(1);
    expect(ctx.inventory[0].id).toBe('key');
  });

  it('should remove item from inventory', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({
      graph,
      initialState: {
        inventory: [{ id: 'key', name: 'Golden Key', quantity: 2 }],
      },
    });

    executor.start();
    executor.updateInventory({ id: 'key', name: 'Golden Key', quantity: 1 }, 'remove');

    const ctx = executor.getContext();
    expect(ctx.inventory[0].quantity).toBe(1);
  });

  it('should emit INVENTORY_CHANGED event', () => {
    const graph = createLinearGraph(3);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    events.length = 0;

    executor.updateInventory({ id: 'key', name: 'Key', quantity: 1 }, 'add');

    expect(events[0].type).toBe('INVENTORY_CHANGED');
    expect(events[0].data?.action).toBe('add');
  });
});

describe('canNavigate', () => {
  it('should return true for available edge', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();

    expect(executor.canNavigate('edge-0')).toBe(true);
  });

  it('should return false for unavailable edge', () => {
    const graph = createConditionalTestGraph();
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.completeCurrentNode();

    // edge-2 requires hasKey: true
    expect(executor.canNavigate('edge-2')).toBe(false);
  });
});

describe('isAtEndNode', () => {
  it('should return false at non-end node', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();

    expect(executor.isAtEndNode()).toBe(false);
  });

  it('should return true at end node', () => {
    const graph = createLinearGraph(2);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.completeCurrentNode();

    expect(executor.isAtEndNode()).toBe(true);
  });
});

describe('serialize and restore', () => {
  it('should serialize state for persistence', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.updateGameState({ score: 100 });

    const serialized = executor.serialize();

    expect(serialized.currentNodeId).toBe('node-0');
    expect(serialized.gameState?.score).toBe(100);
  });

  it('should restore state from serialized data', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.restore({
      currentNodeId: 'node-1',
      gameState: { score: 200 },
      visitedNodes: ['node-0', 'node-1'],
    });

    const ctx = executor.getContext();
    expect(ctx.currentNode?.id).toBe('node-1');
    expect(ctx.gameState.score).toBe(200);
  });
});

describe('reset', () => {
  it('should clear state and return to start', () => {
    const graph = createLinearGraph(3);
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.updateGameState({ score: 100 });
    executor.completeCurrentNode();

    const ctx = executor.reset();

    expect(ctx.currentNode?.id).toBe('node-0');
    expect(ctx.gameState).toEqual({});
    expect(ctx.visitedNodes).toEqual(['node-0']);
  });

  it('should emit STORY_RESTARTED event', () => {
    const graph = createLinearGraph(3);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    events.length = 0;

    executor.reset();

    expect(events[0].type).toBe('STORY_RESTARTED');
  });
});

describe('conditional navigation', () => {
  it('should allow conditional edge when condition is met', () => {
    const graph = createConditionalTestGraph();
    const executor = createStoryExecutor({ graph });

    executor.start();
    executor.completeCurrentNode(); // Move to 'check'
    executor.updateGameState({ hasKey: true });

    // Now edge-2 (conditional to success) should be available
    expect(executor.canNavigate('edge-2')).toBe(true);

    const ctx = executor.navigate('edge-2');
    expect(ctx.currentNode?.id).toBe('success');
  });
});

describe('STORY_COMPLETED event', () => {
  it('should emit when reaching end node', () => {
    const graph = createLinearGraph(2);
    const events: EngineEvent[] = [];
    const executor = createStoryExecutor({
      graph,
      onEvent: (e) => events.push(e),
    });

    executor.start();
    executor.completeCurrentNode();

    expect(events.map((e) => e.type)).toContain('STORY_COMPLETED');
  });
});
