import type {
  ComponentTypeName,
  ComponentCategory,
  ComponentRegistration,
  RegisteredComponent,
  SemVer,
  VersionConstraint,
  StoryComponent,
  getComponentCategory,
} from '@plotpoint/schemas';
import { parseSemVer, semVerToString, compareSemVer, satisfies } from '../semver';

/**
 * ComponentRegistry is a singleton that stores all versioned component implementations.
 * Components are registered with their type, version, and implementation.
 * The registry provides methods to retrieve components by type and version constraint.
 *
 * Components are categorized as:
 * - BLOCKS: Content nodes (text, image, video, audio)
 * - GATES: Unlock nodes (choice, geolocation, password, qr, timer)
 * - OTHER: Special nodes (inventory_action, end)
 */
class ComponentRegistryClass {
  private components: Map<ComponentTypeName, Map<string, RegisteredComponent>> = new Map();
  private initialized = false;

  /**
   * Determine component category from type name
   */
  private getCategory(componentType: ComponentTypeName): ComponentCategory {
    if (componentType.endsWith('_block')) return 'block';
    if (componentType.endsWith('_gate')) return 'gate';
    return 'other';
  }

  /**
   * Register a component implementation
   */
  register<TData = Record<string, unknown>>(registration: ComponentRegistration<TData>): void {
    const { componentType, version, Component, propsSchema, defaultProps, dependencies } =
      registration;

    const parsedVersion = parseSemVer(version);
    if (!parsedVersion) {
      throw new Error(`Invalid version format: ${version}`);
    }

    // Get or create the version map for this component type
    if (!this.components.has(componentType)) {
      this.components.set(componentType, new Map());
    }
    const versionMap = this.components.get(componentType)!;

    // Check if this version already exists
    if (versionMap.has(version)) {
      console.warn(
        `Component ${componentType}@${version} is already registered. Overwriting.`
      );
    }

    // Register the component with category
    const registered: RegisteredComponent<TData> = {
      componentType,
      category: this.getCategory(componentType),
      version: parsedVersion,
      versionString: version,
      Component: Component as StoryComponent,
      propsSchema,
      defaultProps: defaultProps ?? {},
      dependencies: dependencies ?? ({} as Record<ComponentTypeName, string>),
    };

    versionMap.set(version, registered as RegisteredComponent);

    if (process.env.NODE_ENV === 'development') {
      console.log(`Registered ${registered.category}: ${componentType}@${version}`);
    }
  }

  /**
   * Get a specific version of a component
   */
  get(
    componentType: ComponentTypeName,
    version: string
  ): RegisteredComponent | null {
    const versionMap = this.components.get(componentType);
    if (!versionMap) return null;
    return versionMap.get(version) ?? null;
  }

  /**
   * Find the best matching component for a version constraint
   * @param componentType - The component type to find
   * @param constraint - Version constraint (e.g., "^1.0.0", ">=2.0.0")
   * @returns The best matching component or null
   */
  findByConstraint(
    componentType: ComponentTypeName,
    constraint: VersionConstraint
  ): RegisteredComponent | null {
    const versionMap = this.components.get(componentType);
    if (!versionMap) return null;

    // Get all versions that satisfy the constraint
    const satisfyingVersions: RegisteredComponent[] = [];
    for (const [_, component] of versionMap) {
      if (satisfies(component.version, constraint)) {
        satisfyingVersions.push(component);
      }
    }

    if (satisfyingVersions.length === 0) return null;

    // Return the highest version that satisfies the constraint
    return satisfyingVersions.reduce((best, current) =>
      compareSemVer(current.version, best.version) > 0 ? current : best
    );
  }

  /**
   * Get all registered versions of a component type
   */
  getVersions(componentType: ComponentTypeName): SemVer[] {
    const versionMap = this.components.get(componentType);
    if (!versionMap) return [];

    return Array.from(versionMap.values())
      .map((c) => c.version)
      .sort((a, b) => compareSemVer(b, a)); // Descending order
  }

  /**
   * Get all registered version strings of a component type
   */
  getVersionStrings(componentType: ComponentTypeName): string[] {
    return this.getVersions(componentType).map(semVerToString);
  }

  /**
   * Get the latest version of a component type
   */
  getLatest(componentType: ComponentTypeName): RegisteredComponent | null {
    const versions = this.getVersions(componentType);
    if (versions.length === 0) return null;
    return this.get(componentType, semVerToString(versions[0]));
  }

  /**
   * Check if a component type is registered
   */
  hasComponentType(componentType: ComponentTypeName): boolean {
    return this.components.has(componentType) && this.components.get(componentType)!.size > 0;
  }

  /**
   * Check if a specific version is registered
   */
  hasVersion(componentType: ComponentTypeName, version: string): boolean {
    const versionMap = this.components.get(componentType);
    if (!versionMap) return false;
    return versionMap.has(version);
  }

  /**
   * Get all registered component types
   */
  getComponentTypes(): ComponentTypeName[] {
    return Array.from(this.components.keys());
  }

  /**
   * Get all registered component types by category
   */
  getComponentTypesByCategory(category: ComponentCategory): ComponentTypeName[] {
    return this.getComponentTypes().filter((type) => this.getCategory(type) === category);
  }

  /**
   * Get all block component types
   */
  getBlockTypes(): ComponentTypeName[] {
    return this.getComponentTypesByCategory('block');
  }

  /**
   * Get all gate component types
   */
  getGateTypes(): ComponentTypeName[] {
    return this.getComponentTypesByCategory('gate');
  }

  /**
   * Get total count of registered components (all versions)
   */
  getComponentCount(): number {
    let count = 0;
    for (const versionMap of this.components.values()) {
      count += versionMap.size;
    }
    return count;
  }

  /**
   * Clear all registered components (useful for testing)
   */
  clear(): void {
    this.components.clear();
    this.initialized = false;
  }

  /**
   * Mark the registry as initialized (after all components are registered)
   */
  markInitialized(): void {
    this.initialized = true;
    const blocks = this.getBlockTypes().length;
    const gates = this.getGateTypes().length;
    const other = this.getComponentTypes().length - blocks - gates;
    console.log(
      `Component registry initialized with ${this.getComponentCount()} components ` +
        `(${blocks} blocks, ${gates} gates, ${other} other)`
    );
  }

  /**
   * Check if the registry has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a summary of all registered components (for debugging)
   */
  getSummary(): Record<string, string[]> {
    const summary: Record<string, string[]> = {};
    for (const [type, versionMap] of this.components) {
      summary[type] = Array.from(versionMap.keys()).sort();
    }
    return summary;
  }

  /**
   * Get a categorized summary of all registered components
   */
  getCategorizedSummary(): { blocks: Record<string, string[]>; gates: Record<string, string[]>; other: Record<string, string[]> } {
    const summary = {
      blocks: {} as Record<string, string[]>,
      gates: {} as Record<string, string[]>,
      other: {} as Record<string, string[]>,
    };

    for (const [type, versionMap] of this.components) {
      const category = this.getCategory(type);
      const versions = Array.from(versionMap.keys()).sort();

      if (category === 'block') {
        summary.blocks[type] = versions;
      } else if (category === 'gate') {
        summary.gates[type] = versions;
      } else {
        summary.other[type] = versions;
      }
    }

    return summary;
  }
}

// Singleton instance
export const componentRegistry = new ComponentRegistryClass();

// Factory function for non-singleton use (SSR, testing)
export function createComponentRegistry() {
  return new ComponentRegistryClass();
}

// Helper function for registering components with better type inference
export function registerComponent<TData = Record<string, unknown>>(
  registration: ComponentRegistration<TData>
): void {
  componentRegistry.register(registration);
}
