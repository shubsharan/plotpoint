# Engine Architecture Implementation Plan (Marketplace-Ready)

## 0) Purpose
Design a new engine architecture that supports a marketplace of story assets:
- **Components** (UI + behavior)
- **Shells** (experience container)
- **Plugins** (capabilities)
- **Themes** (style overrides)

No backward compatibility is required. This is a clean break.

---

## 1) Design Goals
- **Extensible**: New components/plugins/shells added without core changes.
- **Composable**: Defaults + story overrides via layered resolution.
- **Portable**: Stories can be packaged into offline bundles.
- **Deterministic**: Same inputs yield same runtime behavior.
- **Marketplace-ready**: Packages are versioned, discoverable, and permissioned.

---

## 2) Conceptual Model (New)

### Core Layers
1. **Engine Core** (pure logic)
2. **Component Runtime** (UI + behavior)
3. **Shell Runtime** (story UX container)
4. **Plugin Runtime** (capabilities)
5. **Theme Runtime** (style overrides)

### Resolution Order (Registry-First)
1. Resolve required packages from the **central registry** (marketplace).
2. Apply **default packages** (registry packages marked `is_default`) for any
   required component types not explicitly pinned in the story manifest.
3. Fail in strict mode if any required package is missing or incompatible.

---

## 3) Packages & Bundles (Filesystem + Packaging)

### A) Central Registry (marketplace packages)
```
/registry/
  components/
    text_block/2.0.0/
      component.json
      schema.json
      ui.tsx
      logic.ts
      theme.json
  shells/
    ebook/1.0.0/
      shell.json
      ui.tsx
  plugins/
    analytics/1.0.0/
      plugin.json
      runtime.ts
  themes/
    default/1.0.0/
      theme.json
```

> Defaults are registry packages flagged as `is_default`. They are automatically
> selected when a story does not pin a specific version for a required component type.

### B) Offline Bundle (generated, optional)
```
/offline/<storyId>/<bundleVersion>/
  engine/
  packages/
  assets/
  lockfile.json
```

### Resolution Strategy
- Use the **registry** to resolve packages by semver.
- If a required component type is not pinned, use the registry default (`is_default`).
- Store resolved versions in a **lockfile** at publish time for determinism.

---

## 4) Data Model (Database Schema)

### 4.1 Stories
```
stories:
  id (uuid, pk)
  title (text)
  slug (text)
  status (enum: draft, published, archived)
  start_node_id (uuid, fk -> nodes.id)
  offline_bundle_id (uuid, fk -> offline_bundles.id, nullable)
  created_at, updated_at (timestamp)
```

### 4.2 Nodes
```
nodes:
  id (uuid, pk)
  story_id (uuid, fk -> stories.id)
  node_key (text)
  node_type (text)                          -- component type ID
  data (jsonb)                              -- props
  component_ref (text)                      -- optional explicit package ref
  created_at, updated_at
```

### 4.3 Edges
```
edges:
  id (uuid, pk)
  source_node_id (uuid, fk -> nodes.id)
  target_node_id (uuid, fk -> nodes.id)
  edge_type (enum: default, choice, conditional)
  condition (jsonb)
  priority (int)
  created_at
```

### 4.4 Offline Bundles
```
offline_bundles:
  id (uuid, pk)
  story_id (uuid, fk -> stories.id)
  storage_path (text)                       -- CDN/S3 location
  lockfile (jsonb)                          -- resolved packages + engine version
  checksum (text)
  size_bytes (int)
  created_at, updated_at
```

### 4.5 Packages (Marketplace Assets)
```
packages:
  id (uuid, pk)
  name (text)                               -- unique slug
  version (text)                            -- semver
  kind (enum: component, shell, plugin, theme)
  visibility (enum: public, private)
  owner_id (uuid)                           -- org/account owner
  is_default (boolean)                      -- eligible as auto default
  manifest (jsonb)                          -- package metadata
  storage_path (text)                       -- bundle asset location
  created_at, updated_at
```

### 4.6 Story Manifests
```
story_manifests:
  story_id (uuid, pk, fk -> stories.id)
  engine_version (text)
  components (jsonb)                        -- { "text_block": "^2.0.0", ... }
  shell (jsonb)                             -- { "id": "ar_explore", "version": "^1.0.0" }
  plugins (jsonb)                           -- { "ar_anchor": "^1.0.0" }
  theme (jsonb)                             -- { "id": "dark_museum", "version": "^1.0.0" }
  resolved_packages (jsonb)                 -- lockfile stored at publish time
  fallback_strategy (enum: strict, latest, compatible)
  created_at, updated_at
```

---

## 5) Package Manifests (JSON Schemas)

### 5.1 Component Package Manifest (`component.json`)
```
{
  "id": "text_block",
  "version": "2.0.0",
  "kind": "component",
  "engine": "^2.0.0",
  "displayName": "Text Block",
  "category": "block",
  "visibility": "public",
  "isDefault": true,
  "schema": "./schema.json",
  "ui": "./ui.tsx",
  "logic": "./logic.ts",
  "theme": "./theme.json",
  "capabilities": [],
  "dependencies": {
    "pack:core-ui": "^1.0.0"
  }
}
```

### 5.2 Shell Package Manifest (`shell.json`)
```
{
  "id": "ar_explore",
  "version": "1.0.0",
  "kind": "shell",
  "engine": "^2.0.0",
  "visibility": "public",
  "ui": "./ui.tsx",
  "theme": "./theme.json",
  "capabilities": ["camera", "location"]
}
```

### 5.3 Plugin Manifest (`plugin.json`)
```
{
  "id": "ar_anchor",
  "version": "1.0.0",
  "kind": "plugin",
  "engine": "^2.0.0",
  "visibility": "public",
  "runtime": "./runtime.ts",
  "capabilities": ["camera", "location"]
}
```

### 5.4 Theme Manifest (`theme.json`)
```
{
  "id": "dark_museum",
  "version": "1.0.0",
  "kind": "theme",
  "visibility": "public",
  "tokens": {
    "color.primary": "#6b4eff",
    "font.body": "Gothic-Regular"
  },
  "componentOverrides": {
    "text_block": {
      "titleStyle": { "fontSize": 26 },
      "bodyStyle": { "lineHeight": 28 }
    }
  }
}
```

### 5.5 Story Manifest (`manifest.json`)
```
{
  "engineVersion": "2.0.0",
  "components": {
    "text_block": "^2.0.0",
    "choice_gate": "^1.0.0"
  },
  "shell": { "id": "ar_explore", "version": "^1.0.0" },
  "plugins": { "ar_anchor": "^1.0.0" },
  "theme": { "id": "dark_museum", "version": "^1.0.0" },
  "fallbackStrategy": "strict"
}
```

> `resolvedPackages` is generated at publish time and stored in `story_manifests.resolved_packages`
> as a lockfile for deterministic runtime and offline bundling.

---

## 6) Runtime Registries

### 6.1 Registries (In-Memory)
- `ComponentRegistry`
- `ShellRegistry`
- `PluginRegistry`
- `ThemeRegistry`

Each registry indexes by:
```
{ id -> { version -> package } }
```

### 6.2 Resolver
Given a story manifest:
1. Resolve required components/shell/plugins/theme from the **registry** by semver.
2. For any required component type not pinned, select the registry package marked `is_default`.
3. Enforce package visibility (public/private) and ownership rules.
4. Validate capabilities and permissions.
5. Write resolved versions into `resolved_packages` at publish time.

---

## 7) Engine Execution Flow (New)
1. Load story + nodes + edges.
2. Load story manifest + resolved packages lockfile.
3. Resolve packages from lockfile (or compute if missing in dev).
4. Validate:
   - engine version
   - required packages present
   - capability permissions
5. Initialize shell + plugins.
6. Render nodes via resolved component packages.
7. Emit analytics/events.

---

## 8) Authoring Workflow (New)

### Step 1: Create Story + Manifest
```
manifest.json
assets/
```

### Step 2: Declare Requirements
Add to `story_manifests`:
- required components
- shell
- plugins
- theme
- fallback strategy

### Step 3: Publish (Validation + Lockfile)
- Resolve dependencies via registry.
- Run validators.
- Write `resolved_packages` lockfile.

### Step 4: Optional Offline Bundle
- Build offline bundle containing engine + packages + assets.
- Store in `offline_bundles`.

---

## 9) Publish-Time Validators (Required)
- Engine version compatibility
- Package availability (registry + private visibility)
- Component schema validation against node props
- Dependency graph resolution (no cycles)
- Capability permissions (camera/location/network)
- Platform compatibility (web/ios/android)
- Asset reference integrity
- Theme override validation

---

## 10) Marketplace Requirements
- Package registry API
- Semver resolution
- Ratings/reviews
- Capability policy enforcement
- License tracking

---

## 11) Implementation Phases

### Phase 1: Core Data + Registry
- Implement new DB schema (offline_bundles, packages, manifest).
- Add registry metadata (visibility, is_default).
- Build registries (component/shell/plugin/theme).
- Build resolver pipeline.

### Phase 2: Publish Validators
- Build validator suite.
- Generate and store `resolved_packages` lockfile.

### Phase 3: Shell + Theme System
- Shell registry and render pipeline.
- Theme token and override system.

### Phase 4: Plugin System
- Capability model.
- Permission checks.
- Plugin runtime hooks.

### Phase 5: Offline Bundles
- Offline bundle builder (engine + packages + assets).
- Bundle distribution + caching.

### Phase 6: Marketplace
- Package catalog service.
- Publish/update endpoints.
- Dependency validation.

---

## 12) Non-Goals (Explicit)
- Backwards compatibility with current schema/runtime.
- Migrating old stories automatically.
- Supporting mixed legacy and new formats in the same runtime.

---

## 13) Success Criteria
1. Stories resolve deterministically using `resolved_packages`.
2. Defaults are applied automatically via `is_default` packages.
3. Private packages can be used without local overrides.
4. Offline bundles can run without registry access.
5. Marketplace packages can be installed without code changes.
