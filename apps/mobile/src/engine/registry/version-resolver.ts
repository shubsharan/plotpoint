import type {
  ComponentTypeName,
  VersionConstraint,
  VersionResolutionResult,
  ManifestResolution,
  RegisteredComponent,
  StoryManifest,
} from '@plotpoint/types';
import { componentRegistry } from './component-registry';
import { semVerToString, parseSemVer } from '@lib/semver';

/**
 * Version resolution strategies for fallback behavior
 */
export type FallbackStrategy =
  | 'strict' // No fallback - must match constraint exactly
  | 'latest' // Fall back to latest version if no match
  | 'compatible'; // Fall back to any compatible version (same major)

/**
 * Resolve a version constraint to an actual registered component version
 */
export function resolveVersion(
  componentType: ComponentTypeName,
  constraint: VersionConstraint,
  strategy: FallbackStrategy = 'strict'
): VersionResolutionResult {
  // First, try to find a component that satisfies the constraint
  const component = componentRegistry.findByConstraint(componentType, constraint);

  if (component) {
    return {
      resolved: true,
      version: component.version,
      versionString: component.versionString,
    };
  }

  // Handle fallback strategies
  switch (strategy) {
    case 'latest': {
      const latest = componentRegistry.getLatest(componentType);
      if (latest) {
        console.warn(
          `No version satisfies ${componentType}@${constraint}, ` +
            `falling back to latest: ${latest.versionString}`
        );
        return {
          resolved: true,
          version: latest.version,
          versionString: latest.versionString,
          error: `No exact match for ${constraint}, using latest ${latest.versionString}`,
        };
      }
      break;
    }

    case 'compatible': {
      // Try to find any version with the same major number
      const constraintVersion = parseSemVer(constraint.replace(/^[\^~>=<]+/, ''));
      if (constraintVersion) {
        const versions = componentRegistry.getVersions(componentType);
        const compatible = versions.find((v) => v.major === constraintVersion.major);
        if (compatible) {
          const versionString = semVerToString(compatible);
          console.warn(
            `No version satisfies ${componentType}@${constraint}, ` +
              `falling back to compatible: ${versionString}`
          );
          return {
            resolved: true,
            version: compatible,
            versionString,
            error: `No exact match for ${constraint}, using compatible ${versionString}`,
          };
        }
      }
      break;
    }

    case 'strict':
    default:
      // No fallback
      break;
  }

  // No resolution found
  return {
    resolved: false,
    version: null,
    versionString: null,
    error: componentRegistry.hasComponentType(componentType)
      ? `No version of ${componentType} satisfies constraint ${constraint}. ` +
        `Available versions: ${componentRegistry.getVersionStrings(componentType).join(', ')}`
      : `Component type ${componentType} is not registered`,
  };
}

/**
 * Resolve all component requirements from a story manifest
 */
export function resolveManifest(
  manifest: Pick<StoryManifest, 'requiredComponents'>,
  strategy: FallbackStrategy = 'strict'
): ManifestResolution {
  const resolved: Record<ComponentTypeName, string> = {} as Record<ComponentTypeName, string>;
  const errors: ManifestResolution['errors'] = [];

  for (const [componentType, constraint] of Object.entries(manifest.requiredComponents)) {
    const result = resolveVersion(
      componentType as ComponentTypeName,
      constraint as VersionConstraint,
      strategy
    );

    if (result.resolved && result.versionString) {
      resolved[componentType as ComponentTypeName] = result.versionString;
    } else {
      errors.push({
        componentType: componentType as ComponentTypeName,
        constraint: constraint as VersionConstraint,
        error: result.error ?? 'Unknown resolution error',
      });
    }
  }

  return {
    success: errors.length === 0,
    resolved,
    errors,
  };
}

/**
 * Resolve component dependencies recursively
 * Returns a flat map of all required components with their resolved versions
 */
export function resolveWithDependencies(
  componentType: ComponentTypeName,
  constraint: VersionConstraint,
  strategy: FallbackStrategy = 'strict',
  visited: Set<string> = new Set()
): ManifestResolution {
  const resolved: Record<ComponentTypeName, string> = {} as Record<ComponentTypeName, string>;
  const errors: ManifestResolution['errors'] = [];

  // Prevent circular dependencies
  const key = `${componentType}@${constraint}`;
  if (visited.has(key)) {
    return { success: true, resolved, errors };
  }
  visited.add(key);

  // Resolve the main component
  const result = resolveVersion(componentType, constraint, strategy);

  if (!result.resolved || !result.versionString) {
    errors.push({
      componentType,
      constraint,
      error: result.error ?? 'Unknown resolution error',
    });
    return { success: false, resolved, errors };
  }

  resolved[componentType] = result.versionString;

  // Get the registered component to check for dependencies
  const component = componentRegistry.get(componentType, result.versionString);
  if (component && component.dependencies) {
    for (const [depType, depConstraint] of Object.entries(component.dependencies)) {
      const depResolution = resolveWithDependencies(
        depType as ComponentTypeName,
        depConstraint,
        strategy,
        visited
      );

      if (!depResolution.success) {
        errors.push(...depResolution.errors);
      } else {
        Object.assign(resolved, depResolution.resolved);
      }
    }
  }

  return {
    success: errors.length === 0,
    resolved,
    errors,
  };
}

/**
 * Get a resolved component for rendering
 * Combines resolution and retrieval in one call
 */
export function getResolvedComponent(
  componentType: ComponentTypeName,
  constraint: VersionConstraint,
  strategy: FallbackStrategy = 'strict'
): RegisteredComponent | null {
  const result = resolveVersion(componentType, constraint, strategy);

  if (!result.resolved || !result.versionString) {
    return null;
  }

  return componentRegistry.get(componentType, result.versionString);
}

/**
 * Validate that all components in a manifest are available
 * Does not resolve - just checks availability
 */
export function validateManifest(
  manifest: Pick<StoryManifest, 'requiredComponents'>
): { valid: boolean; missing: ComponentTypeName[] } {
  const missing: ComponentTypeName[] = [];

  for (const componentType of Object.keys(manifest.requiredComponents)) {
    if (!componentRegistry.hasComponentType(componentType as ComponentTypeName)) {
      missing.push(componentType as ComponentTypeName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Create a default manifest for a story based on its nodes
 * Useful when a story doesn't have an explicit manifest
 */
export function createDefaultManifest(
  nodeTypes: ComponentTypeName[]
): Pick<StoryManifest, 'requiredComponents' | 'engineVersion'> {
  const requiredComponents: Record<ComponentTypeName, VersionConstraint> = {} as Record<
    ComponentTypeName,
    VersionConstraint
  >;

  // Get unique node types
  const uniqueTypes = [...new Set(nodeTypes)];

  for (const type of uniqueTypes) {
    const latest = componentRegistry.getLatest(type);
    if (latest) {
      // Use caret constraint to allow compatible updates
      requiredComponents[type] = `^${latest.versionString}`;
    }
  }

  return {
    requiredComponents,
    engineVersion: '1.0.0',
  };
}
