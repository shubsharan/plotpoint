import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type {
  Story,
  StoryNode,
  StoryEdge,
  StorySession,
  StoryManifest,
} from '@plotpoint/db';
import type {
  GameState,
  InventoryItem,
  ComponentContext,
  EdgeCondition,
} from '@plotpoint/schemas';
import { supabase } from '../../lib/supabase';
import { NodeRenderer } from './node-renderer';

// ============================================
// Types
// ============================================
interface StoryRunnerContextValue {
  // Story data
  story: Story | null;
  currentNode: StoryNode | null;
  edges: StoryEdge[];
  manifest: StoryManifest | null;

  // Session state
  session: StorySession | null;
  gameState: GameState;
  inventory: InventoryItem[];
  visitedNodes: string[];

  // Loading states
  isLoading: boolean;
  error: Error | null;

  // Actions
  navigateToNode: (nodeId: string) => void;
  navigateByEdge: (edgeId: string) => void;
  updateGameState: (updates: Partial<GameState>) => void;
  updateInventory: (item: InventoryItem, action: 'add' | 'remove' | 'update') => void;
  completeCurrentNode: () => void;
  restartStory: () => void;
}

const StoryRunnerContext = createContext<StoryRunnerContextValue | null>(null);

// ============================================
// Hook
// ============================================
export function useStoryRunner(): StoryRunnerContextValue {
  const context = useContext(StoryRunnerContext);
  if (!context) {
    throw new Error('useStoryRunner must be used within a StoryRunner');
  }
  return context;
}

// ============================================
// Condition Evaluator
// ============================================
function evaluateCondition(
  condition: EdgeCondition,
  gameState: GameState,
  inventory: InventoryItem[]
): boolean {
  switch (condition.operator) {
    case 'equals':
      return gameState[condition.key!] === condition.value;

    case 'not_equals':
      return gameState[condition.key!] !== condition.value;

    case 'greater_than':
      return (gameState[condition.key!] as number) > (condition.value as number);

    case 'less_than':
      return (gameState[condition.key!] as number) < (condition.value as number);

    case 'contains':
      return String(gameState[condition.key!]).includes(String(condition.value));

    case 'not_contains':
      return !String(gameState[condition.key!]).includes(String(condition.value));

    case 'has_item':
      return inventory.some((item) => item.id === condition.value && item.quantity > 0);

    case 'not_has_item':
      return !inventory.some((item) => item.id === condition.value && item.quantity > 0);

    case 'and':
      return (condition.conditions ?? []).every((c) =>
        evaluateCondition(c, gameState, inventory)
      );

    case 'or':
      return (condition.conditions ?? []).some((c) =>
        evaluateCondition(c, gameState, inventory)
      );

    default:
      return true;
  }
}

// ============================================
// Data Fetching Hooks
// ============================================
function useStoryData(storyId: string) {
  return useQuery({
    queryKey: ['story', storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      if (error) throw error;
      return data as unknown as Story;
    },
  });
}

function useStoryManifest(storyId: string) {
  return useQuery({
    queryKey: ['story-manifest', storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('story_manifests')
        .select('*')
        .eq('story_id', storyId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data as unknown as StoryManifest | null;
    },
  });
}

function useStoryNodes(storyId: string) {
  return useQuery({
    queryKey: ['story-nodes', storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('*')
        .eq('story_id', storyId)
        .order('order');

      if (error) throw error;
      return data as unknown as StoryNode[];
    },
  });
}

function useStoryEdges(storyId: string) {
  return useQuery({
    queryKey: ['story-edges', storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('edges')
        .select('*')
        .in(
          'source_node_id',
          supabase.from('nodes').select('id').eq('story_id', storyId)
        );

      if (error) throw error;
      return (data ?? []) as unknown as StoryEdge[];
    },
  });
}

function useStorySession(storyId: string, userId: string) {
  return useQuery({
    queryKey: ['story-session', storyId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('story_sessions')
        .select('*')
        .eq('story_id', storyId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as unknown as StorySession | null;
    },
  });
}

// ============================================
// Props
// ============================================
interface StoryRunnerProps {
  storyId: string;
  userId?: string;
}

// ============================================
// Component
// ============================================
export function StoryRunner({ storyId, userId = 'anonymous' }: StoryRunnerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Fetch all story data
  const storyQuery = useStoryData(storyId);
  const manifestQuery = useStoryManifest(storyId);
  const nodesQuery = useStoryNodes(storyId);
  const edgesQuery = useStoryEdges(storyId);
  const sessionQuery = useStorySession(storyId, userId);

  // Local state for game progress
  const [localSession, setLocalSession] = React.useState<Partial<StorySession>>({
    gameState: {},
    inventory: [],
    visitedNodes: [],
    choiceHistory: [],
    isComplete: false,
  });

  // Initialize session when story loads
  React.useEffect(() => {
    if (sessionQuery.data) {
      setLocalSession(sessionQuery.data);
    } else if (storyQuery.data?.startNodeId) {
      setLocalSession((prev) => ({
        ...prev,
        currentNodeId: storyQuery.data.startNodeId,
      }));
    }
  }, [sessionQuery.data, storyQuery.data]);

  // Session mutation for persisting progress
  const updateSessionMutation = useMutation({
    mutationFn: async (updates: Partial<StorySession>) => {
      const { error } = await supabase
        .from('story_sessions')
        .upsert({
          user_id: userId,
          story_id: storyId,
          ...localSession,
          ...updates,
          last_played_at: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story-session', storyId, userId] });
    },
  });

  // Derived state
  const currentNodeId = localSession.currentNodeId;
  const nodes = nodesQuery.data ?? [];
  const allEdges = edgesQuery.data ?? [];

  const currentNode = useMemo(
    () => nodes.find((n) => n.id === currentNodeId) ?? null,
    [nodes, currentNodeId]
  );

  const currentEdges = useMemo(
    () =>
      allEdges
        .filter((e) => e.sourceNodeId === currentNodeId)
        .filter((e) => {
          // Filter out conditional edges that don't pass
          if (e.edgeType === 'conditional' && e.condition) {
            return evaluateCondition(
              e.condition,
              localSession.gameState ?? {},
              localSession.inventory ?? []
            );
          }
          return true;
        })
        .sort((a, b) => a.priority - b.priority),
    [allEdges, currentNodeId, localSession.gameState, localSession.inventory]
  );

  // Actions
  const navigateToNode = useCallback(
    (nodeId: string) => {
      const newVisited = [...(localSession.visitedNodes ?? [])];
      if (!newVisited.includes(nodeId)) {
        newVisited.push(nodeId);
      }

      const updates: Partial<StorySession> = {
        currentNodeId: nodeId,
        visitedNodes: newVisited,
      };

      setLocalSession((prev) => ({ ...prev, ...updates }));
      updateSessionMutation.mutate(updates);
    },
    [localSession.visitedNodes, updateSessionMutation]
  );

  const navigateByEdge = useCallback(
    (edgeId: string) => {
      const edge = allEdges.find((e) => e.id === edgeId);
      if (!edge) {
        console.error(`Edge ${edgeId} not found`);
        return;
      }

      const newHistory = [
        ...(localSession.choiceHistory ?? []),
        {
          nodeId: currentNodeId!,
          edgeId,
          timestamp: new Date().toISOString(),
        },
      ];

      const updates: Partial<StorySession> = {
        choiceHistory: newHistory,
      };

      setLocalSession((prev) => ({ ...prev, ...updates }));
      navigateToNode(edge.targetNodeId);
    },
    [allEdges, currentNodeId, localSession.choiceHistory, navigateToNode]
  );

  const updateGameState = useCallback(
    (stateUpdates: Partial<GameState>) => {
      const newState = { ...localSession.gameState, ...stateUpdates };
      const updates: Partial<StorySession> = { gameState: newState };

      setLocalSession((prev) => ({ ...prev, ...updates }));
      updateSessionMutation.mutate(updates);
    },
    [localSession.gameState, updateSessionMutation]
  );

  const updateInventory = useCallback(
    (item: InventoryItem, action: 'add' | 'remove' | 'update') => {
      let newInventory = [...(localSession.inventory ?? [])];

      switch (action) {
        case 'add': {
          const existing = newInventory.find((i) => i.id === item.id);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            newInventory.push(item);
          }
          break;
        }
        case 'remove': {
          const idx = newInventory.findIndex((i) => i.id === item.id);
          if (idx !== -1) {
            newInventory[idx].quantity -= item.quantity;
            if (newInventory[idx].quantity <= 0) {
              newInventory.splice(idx, 1);
            }
          }
          break;
        }
        case 'update': {
          const idx = newInventory.findIndex((i) => i.id === item.id);
          if (idx !== -1) {
            newInventory[idx] = item;
          }
          break;
        }
      }

      const updates: Partial<StorySession> = { inventory: newInventory };
      setLocalSession((prev) => ({ ...prev, ...updates }));
      updateSessionMutation.mutate(updates);
    },
    [localSession.inventory, updateSessionMutation]
  );

  const completeCurrentNode = useCallback(() => {
    // Find the default edge (first non-choice, non-conditional edge)
    const defaultEdge = currentEdges.find((e) => e.edgeType === 'default');
    if (defaultEdge) {
      navigateByEdge(defaultEdge.id);
    }
  }, [currentEdges, navigateByEdge]);

  const restartStory = useCallback(() => {
    const startNodeId = storyQuery.data?.startNodeId;
    if (!startNodeId) return;

    const updates: Partial<StorySession> = {
      currentNodeId: startNodeId,
      gameState: {},
      inventory: [],
      visitedNodes: [startNodeId],
      choiceHistory: [],
      isComplete: false,
    };

    setLocalSession(updates);
    updateSessionMutation.mutate(updates);
  }, [storyQuery.data?.startNodeId, updateSessionMutation]);

  // Build context value
  const contextValue = useMemo<StoryRunnerContextValue>(
    () => ({
      story: storyQuery.data ?? null,
      currentNode,
      edges: currentEdges,
      manifest: manifestQuery.data ?? null,
      session: localSession as StorySession,
      gameState: localSession.gameState ?? {},
      inventory: localSession.inventory ?? [],
      visitedNodes: localSession.visitedNodes ?? [],
      isLoading:
        storyQuery.isLoading ||
        nodesQuery.isLoading ||
        edgesQuery.isLoading ||
        sessionQuery.isLoading,
      error:
        storyQuery.error ?? nodesQuery.error ?? edgesQuery.error ?? sessionQuery.error ?? null,
      navigateToNode,
      navigateByEdge,
      updateGameState,
      updateInventory,
      completeCurrentNode,
      restartStory,
    }),
    [
      storyQuery.data,
      storyQuery.isLoading,
      storyQuery.error,
      manifestQuery.data,
      nodesQuery.isLoading,
      nodesQuery.error,
      edgesQuery.isLoading,
      edgesQuery.error,
      sessionQuery.isLoading,
      sessionQuery.error,
      currentNode,
      currentEdges,
      localSession,
      navigateToNode,
      navigateByEdge,
      updateGameState,
      updateInventory,
      completeCurrentNode,
      restartStory,
    ]
  );

  // Component context for child components
  const componentContext = useMemo<ComponentContext>(
    () => ({
      gameState: localSession.gameState ?? {},
      inventory: localSession.inventory ?? [],
      visitedNodes: localSession.visitedNodes ?? [],
      sessionId: localSession.id ?? 'local',
      onComplete: completeCurrentNode,
      onNavigate: navigateByEdge,
      onStateUpdate: updateGameState,
      onInventoryUpdate: updateInventory,
    }),
    [
      localSession.gameState,
      localSession.inventory,
      localSession.visitedNodes,
      localSession.id,
      completeCurrentNode,
      navigateByEdge,
      updateGameState,
      updateInventory,
    ]
  );

  // Loading state
  if (contextValue.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (contextValue.error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error loading story</Text>
          <Text style={styles.errorDetail}>{contextValue.error.message}</Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // No story found
  if (!contextValue.story) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Story not found</Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // No current node
  if (!currentNode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>No starting point</Text>
          <Text style={styles.errorDetail}>This story has no start node configured.</Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <StoryRunnerContext.Provider value={contextValue}>
      <SafeAreaView style={styles.container}>
        <NodeRenderer
          node={currentNode}
          edges={currentEdges}
          context={componentContext}
          manifest={contextValue.manifest}
        />
      </SafeAreaView>
    </StoryRunnerContext.Provider>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#888888',
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetail: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
});
