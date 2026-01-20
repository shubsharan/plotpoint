import React, { Component, useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import type {
  StoryNode,
  StoryEdge,
  StoryManifest,
  ComponentContext,
  ComponentTypeName,
  VersionConstraint,
} from '@plotpoint/schemas';
import {
  componentRegistry,
  getResolvedComponent,
  createDefaultManifest,
  type FallbackStrategy,
} from '@plotpoint/engine/registry';

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
    console.error(
      `Component error in node ${this.props.node.nodeKey}:`,
      error,
      errorInfo
    );
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Component Error</Text>
          <Text style={errorStyles.message}>
            The component for node "{this.props.node.nodeKey}" encountered an error.
          </Text>
          <Text style={errorStyles.detail}>{this.state.error?.message}</Text>
          <Pressable
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={errorStyles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1a1a1a',
  },
  title: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  detail: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'monospace',
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
  },
});

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

function MissingComponent({
  nodeType,
  version,
  constraint,
  node,
  context,
}: MissingComponentProps) {
  const availableVersions = componentRegistry.getVersionStrings(nodeType);

  return (
    <ScrollView style={missingStyles.container} contentContainerStyle={missingStyles.content}>
      <View style={missingStyles.iconContainer}>
        <Text style={missingStyles.icon}>⚠️</Text>
      </View>
      <Text style={missingStyles.title}>Component Not Found</Text>
      <Text style={missingStyles.message}>
        Unable to render {nodeType}
        {version ? `@${version}` : constraint ? ` matching ${constraint}` : ''}
      </Text>

      {availableVersions.length > 0 && (
        <View style={missingStyles.versionSection}>
          <Text style={missingStyles.versionTitle}>Available versions:</Text>
          {availableVersions.map((v) => (
            <Text key={v} style={missingStyles.versionItem}>
              • {nodeType}@{v}
            </Text>
          ))}
        </View>
      )}

      <View style={missingStyles.debugSection}>
        <Text style={missingStyles.debugTitle}>Debug Info</Text>
        <Text style={missingStyles.debugText}>Node Key: {node.nodeKey}</Text>
        <Text style={missingStyles.debugText}>Node ID: {node.id}</Text>
      </View>

      <Pressable style={missingStyles.button} onPress={context.onComplete}>
        <Text style={missingStyles.buttonText}>Skip & Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const missingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    color: '#ffa500',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  message: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  versionSection: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 16,
  },
  versionTitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 8,
  },
  versionItem: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  debugSection: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
  },
  debugTitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 8,
  },
  debugText: {
    color: '#666666',
    fontSize: 12,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  button: {
    backgroundColor: '#4a4a4a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
});

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
  fallbackStrategy = 'compatible',
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
  if (propsSchema && typeof propsSchema === 'object' && 'safeParse' in propsSchema) {
    const zodSchema = propsSchema as { safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: unknown } };
    const result = zodSchema.safeParse(mergedData);

    if (!result.success) {
      console.warn(
        `Props validation failed for ${node.nodeType}@${resolvedComponent.component.versionString}:`,
        result.error
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
