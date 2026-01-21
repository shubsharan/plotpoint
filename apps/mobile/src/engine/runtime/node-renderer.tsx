import React, { Component, useMemo, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import type {
  StoryNode,
  StoryEdge,
  StoryManifest,
  ComponentContext,
  ComponentTypeName,
  VersionConstraint,
} from "@plotpoint/schemas";
import {
  componentRegistry,
  getResolvedComponent,
  type FallbackStrategy,
} from "@plotpoint/engine/registry";

// ============================================
// Error Boundary
// ============================================
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  node: StoryNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ComponentErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Component error in node ${this.props.node.nodeKey}:`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 justify-center items-center p-6 bg-card">
          <Text className="text-destructive text-xl font-semibold mb-3">Component Error</Text>
          <Text className="text-foreground text-base text-center mb-2">
            The component for node "{this.props.node.nodeKey}" encountered an error.
          </Text>
          <Text className="text-muted-foreground text-sm text-center mb-6 font-mono">
            {this.state.error?.message}
          </Text>
          <Pressable
            className="bg-muted px-6 py-3 rounded"
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text className="text-foreground text-base">Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

// ============================================
// Missing Component Fallback
// ============================================
interface MissingComponentProps {
  nodeType: ComponentTypeName;
  version?: string;
  constraint?: VersionConstraint;
  node: StoryNode;
  context: ComponentContext;
}

function MissingComponent({ nodeType, version, constraint, node, context }: MissingComponentProps) {
  const availableVersions = componentRegistry.getVersionStrings(nodeType);

  return (
    <ScrollView
      className="flex-1 bg-card"
      contentContainerStyle={{ padding: 24, alignItems: "center" }}
    >
      <View className="mb-4">
        <Text className="text-5xl">⚠️</Text>
      </View>
      <Text className="text-amber-500 text-xl font-semibold mb-2">Component Not Found</Text>
      <Text className="text-foreground text-base text-center mb-6">
        Unable to render {nodeType}
        {version ? `@${version}` : constraint ? ` matching ${constraint}` : ""}
      </Text>

      {availableVersions.length > 0 && (
        <View className="bg-muted p-4 rounded-lg w-full mb-4">
          <Text className="text-muted-foreground text-sm mb-2">Available versions:</Text>
          {availableVersions.map((v) => (
            <Text key={v} className="text-foreground text-sm font-mono my-0.5">
              • {nodeType}@{v}
            </Text>
          ))}
        </View>
      )}

      <View className="bg-muted p-4 rounded-lg w-full mb-6">
        <Text className="text-muted-foreground text-sm mb-2">Debug Info</Text>
        <Text className="text-muted-foreground text-xs font-mono my-0.5">
          Node Key: {node.nodeKey}
        </Text>
        <Text className="text-muted-foreground text-xs font-mono my-0.5">Node ID: {node.id}</Text>
      </View>

      <Pressable
        className="bg-card border-1 border-muted px-6 py-3 rounded"
        onPress={context.onComplete}
      >
        <Text className="text-foreground text-base">Skip & Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ============================================
// Node Renderer Props
// ============================================
interface NodeRendererProps {
  node: StoryNode;
  edges: StoryEdge[];
  context: ComponentContext;
  manifest: StoryManifest | null;
  fallbackStrategy?: FallbackStrategy;
}

// ============================================
// Node Renderer Component
// ============================================
export function NodeRenderer({
  node,
  edges,
  context,
  manifest,
  fallbackStrategy = "compatible",
}: NodeRendererProps) {
  // Resolve the component version from manifest or use latest
  const resolvedComponent = useMemo(() => {
    const nodeType = node.nodeType as ComponentTypeName;

    // If manifest specifies a version constraint, use it
    if (manifest?.requiredComponents?.[nodeType]) {
      const constraint = manifest.requiredComponents[nodeType];
      return {
        component: getResolvedComponent(nodeType, constraint, fallbackStrategy),
        constraint,
      };
    }

    // If node has a specific component version ID, we need to look it up
    // For now, fall back to latest
    const latest = componentRegistry.getLatest(nodeType);
    return {
      component: latest,
      constraint: latest ? `^${latest.versionString}` : undefined,
    };
  }, [node.nodeType, node.componentVersionId, manifest, fallbackStrategy]);

  // Handle missing component
  if (!resolvedComponent.component) {
    return (
      <MissingComponent
        nodeType={node.nodeType as ComponentTypeName}
        constraint={resolvedComponent.constraint}
        node={node}
        context={context}
      />
    );
  }

  const { Component, propsSchema, defaultProps } = resolvedComponent.component;

  // Merge default props with node data
  const mergedData = {
    ...defaultProps,
    ...node.data,
  };

  // Validate props if we have a Zod schema
  let validatedData = mergedData;
  if (propsSchema && typeof propsSchema === "object" && "safeParse" in propsSchema) {
    const zodSchema = propsSchema as {
      safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: unknown };
    };
    const result = zodSchema.safeParse(mergedData);

    if (!result.success) {
      console.warn(
        `Props validation failed for ${node.nodeType}@${resolvedComponent.component.versionString}:`,
        result.error,
      );
      // Continue with unvalidated data, but log the warning
    } else {
      validatedData = result.data as typeof mergedData;
    }
  }

  return (
    <ComponentErrorBoundary node={node}>
      <Component data={validatedData} context={context} edges={edges} />
    </ComponentErrorBoundary>
  );
}

// ============================================
// Export
// ============================================
export { ComponentErrorBoundary };
