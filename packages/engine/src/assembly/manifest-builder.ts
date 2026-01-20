import type { StoryManifest } from '@plotpoint/db';
import type { ComponentTypeName, VersionConstraint } from '@plotpoint/schemas';
import type { StoryGraph } from '../graph/story-graph';
import { getAllNodes } from '../graph/story-graph';
import { componentRegistry } from '../registry/component-registry';
import { checkEngineCompatibility } from '../compatibility';

/**
 * Build a manifest from a story graph by analyzing required component types.
 * Uses the latest version of each component by default.
 */
export function buildManifestFromGraph(
  graph: StoryGraph
): Pick<StoryManifest, 'requiredComponents'> {
  const allNodes = getAllNodes(graph);
  const componentTypes = new Set<ComponentTypeName>();

  // Collect all unique component types
  for (const node of allNodes) {
    componentTypes.add(node.nodeType);
  }

  // Build required components map with version constraints
  const requiredComponents: Record<ComponentTypeName, VersionConstraint> = {} as Record<
    ComponentTypeName,
    VersionConstraint
  >;

  for (const componentType of componentTypes) {
    // Try to get latest version
    const latest = componentRegistry.getLatest(componentType);
    if (latest) {
      // Use caret range to allow compatible updates
      requiredComponents[componentType] = `^${latest.versionString}`;
    } else {
      // Component not registered, use wildcard
      console.warn(
        `Component type '${componentType}' not registered, using wildcard version constraint`
      );
      requiredComponents[componentType] = '*';
    }
  }

  return { requiredComponents };
}

/**
 * Validate manifest compatibility with the current engine version.
 * Returns errors if the manifest requires an incompatible engine version.
 */
export function validateManifestCompatibility(manifest: StoryManifest): {
  compatible: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check engine version compatibility
  const engineCompatibility = checkEngineCompatibility(manifest.engineVersion);
  if (!engineCompatibility.compatible) {
    errors.push(
      `Story requires engine version ${manifest.engineVersion}, but current engine is ${engineCompatibility.currentVersion}`
    );
  }

  // Check if all required components are available
  for (const [componentType, constraint] of Object.entries(manifest.requiredComponents)) {
    if (!componentRegistry.hasComponentType(componentType as ComponentTypeName)) {
      errors.push(`Required component type '${componentType}' is not registered`);
    }
  }

  return {
    compatible: errors.length === 0,
    errors,
  };
}

/**
 * Build a complete default manifest for a graph with current engine version.
 */
export function buildDefaultManifest(graph: StoryGraph, storyId: string): StoryManifest {
  const { requiredComponents } = buildManifestFromGraph(graph);

  return {
    id: `${storyId}-manifest`,
    storyId,
    requiredComponents,
    engineVersion: '1.0.0', // Current engine version
    resolvedComponents: null,
  };
}

/**
 * Merge two manifests, preferring the second one's constraints.
 */
export function mergeManifests(
  base: Pick<StoryManifest, 'requiredComponents'>,
  override: Pick<StoryManifest, 'requiredComponents'>
): Pick<StoryManifest, 'requiredComponents'> {
  return {
    requiredComponents: {
      ...base.requiredComponents,
      ...override.requiredComponents,
    },
  };
}

/**
 * Check if a manifest has all required components registered.
 */
export function areAllComponentsRegistered(manifest: StoryManifest): boolean {
  for (const componentType of Object.keys(manifest.requiredComponents)) {
    if (!componentRegistry.hasComponentType(componentType as ComponentTypeName)) {
      return false;
    }
  }
  return true;
}

/**
 * Get missing component types from a manifest.
 */
export function getMissingComponents(manifest: StoryManifest): ComponentTypeName[] {
  const missing: ComponentTypeName[] = [];

  for (const componentType of Object.keys(manifest.requiredComponents)) {
    if (!componentRegistry.hasComponentType(componentType as ComponentTypeName)) {
      missing.push(componentType as ComponentTypeName);
    }
  }

  return missing;
}
