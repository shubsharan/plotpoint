import type {
  ComponentTypeName,
  GameState,
  InventoryItem,
  StoryEdge,
  StoryManifest,
} from '@plotpoint/schemas';
import type { StoryGraph } from '../graph/story-graph';
import type { StoryExecutor } from '../executor/story-executor';
import { createStoryExecutor } from '../executor/story-executor';

/**
 * A single step in a story simulation.
 */
export interface SimulationStep {
  nodeId: string;
  nodeType: ComponentTypeName;
  availableEdges: StoryEdge[];
  gameState: GameState;
  inventory: InventoryItem[];
}

/**
 * Result of a story simulation.
 */
export interface SimulationResult {
  steps: SimulationStep[];
  endNode: { id: string; type: ComponentTypeName } | null;
  totalSteps: number;
  visitedNodes: string[];
  success: boolean;
  error?: string;
}

/**
 * Story simulator interface for testing stories without UI.
 */
export interface StorySimulator {
  simulateAutoPath: (maxSteps?: number) => SimulationResult;
  simulateChoicePath: (edgeIds: string[]) => SimulationResult;
  simulateWithState: (initialState: Partial<GameState>, edgeIds: string[]) => SimulationResult;
  getExecutor: () => StoryExecutor;
}

/**
 * Create a story simulator for testing story execution.
 */
export function createStorySimulator(
  graph: StoryGraph,
  manifest?: StoryManifest
): StorySimulator {
  function simulateAutoPath(maxSteps: number = 100): SimulationResult {
    const steps: SimulationStep[] = [];
    const executor = createStoryExecutor({ graph, manifest });

    try {
      // Start the story
      let context = executor.start();

      // Follow default edges until we reach an end or max steps
      for (let i = 0; i < maxSteps; i++) {
        // Record current step
        if (context.currentNode) {
          steps.push({
            nodeId: context.currentNode.id,
            nodeType: context.currentNode.nodeType,
            availableEdges: Array.from(context.resolvedEdges.available),
            gameState: { ...context.gameState },
            inventory: [...context.inventory],
          });
        }

        // Check if at end
        if (context.isAtEndNode) {
          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: true,
          };
        }

        // Try to follow default edge
        if (context.resolvedEdges.default) {
          context = executor.navigate(context.resolvedEdges.default.id);
        } else {
          // No default edge available
          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: false,
            error: 'No default edge available (simulation stopped)',
          };
        }
      }

      // Reached max steps without ending
      return {
        steps,
        endNode: context.currentNode
          ? { id: context.currentNode.id, type: context.currentNode.nodeType }
          : null,
        totalSteps: steps.length,
        visitedNodes: context.visitedNodes,
        success: false,
        error: `Reached maximum steps (${maxSteps}) without ending`,
      };
    } catch (error) {
      return {
        steps,
        endNode: null,
        totalSteps: steps.length,
        visitedNodes: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function simulateChoicePath(edgeIds: string[]): SimulationResult {
    const steps: SimulationStep[] = [];
    const executor = createStoryExecutor({ graph, manifest });

    try {
      // Start the story
      let context = executor.start();

      // Follow specified edges
      for (const edgeId of edgeIds) {
        // Record current step
        if (context.currentNode) {
          steps.push({
            nodeId: context.currentNode.id,
            nodeType: context.currentNode.nodeType,
            availableEdges: Array.from(context.resolvedEdges.available),
            gameState: { ...context.gameState },
            inventory: [...context.inventory],
          });
        }

        // Check if we can navigate this edge
        if (!executor.canNavigate(edgeId)) {
          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: false,
            error: `Cannot navigate edge ${edgeId} - not available or conditions not met`,
          };
        }

        // Navigate
        context = executor.navigate(edgeId);

        // Check if at end
        if (context.isAtEndNode) {
          // Record final step
          if (context.currentNode) {
            steps.push({
              nodeId: context.currentNode.id,
              nodeType: context.currentNode.nodeType,
              availableEdges: Array.from(context.resolvedEdges.available),
              gameState: { ...context.gameState },
              inventory: [...context.inventory],
            });
          }

          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: true,
          };
        }
      }

      // Finished following edges
      return {
        steps,
        endNode: context.currentNode
          ? { id: context.currentNode.id, type: context.currentNode.nodeType }
          : null,
        totalSteps: steps.length,
        visitedNodes: context.visitedNodes,
        success: context.isComplete,
      };
    } catch (error) {
      return {
        steps,
        endNode: null,
        totalSteps: steps.length,
        visitedNodes: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function simulateWithState(
    initialState: Partial<GameState>,
    edgeIds: string[]
  ): SimulationResult {
    const steps: SimulationStep[] = [];
    const executor = createStoryExecutor({
      graph,
      manifest,
      initialState: { gameState: initialState },
    });

    try {
      // Start the story with initial state
      let context = executor.start();

      // Follow specified edges
      for (const edgeId of edgeIds) {
        // Record current step
        if (context.currentNode) {
          steps.push({
            nodeId: context.currentNode.id,
            nodeType: context.currentNode.nodeType,
            availableEdges: Array.from(context.resolvedEdges.available),
            gameState: { ...context.gameState },
            inventory: [...context.inventory],
          });
        }

        // Check if we can navigate this edge
        if (!executor.canNavigate(edgeId)) {
          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: false,
            error: `Cannot navigate edge ${edgeId} - not available or conditions not met`,
          };
        }

        // Navigate
        context = executor.navigate(edgeId);

        // Check if at end
        if (context.isAtEndNode) {
          // Record final step
          if (context.currentNode) {
            steps.push({
              nodeId: context.currentNode.id,
              nodeType: context.currentNode.nodeType,
              availableEdges: Array.from(context.resolvedEdges.available),
              gameState: { ...context.gameState },
              inventory: [...context.inventory],
            });
          }

          return {
            steps,
            endNode: context.currentNode
              ? { id: context.currentNode.id, type: context.currentNode.nodeType }
              : null,
            totalSteps: steps.length,
            visitedNodes: context.visitedNodes,
            success: true,
          };
        }
      }

      // Finished following edges
      return {
        steps,
        endNode: context.currentNode
          ? { id: context.currentNode.id, type: context.currentNode.nodeType }
          : null,
        totalSteps: steps.length,
        visitedNodes: context.visitedNodes,
        success: context.isComplete,
      };
    } catch (error) {
      return {
        steps,
        endNode: null,
        totalSteps: steps.length,
        visitedNodes: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function getExecutor(): StoryExecutor {
    return createStoryExecutor({ graph, manifest });
  }

  return {
    simulateAutoPath,
    simulateChoicePath,
    simulateWithState,
    getExecutor,
  };
}
