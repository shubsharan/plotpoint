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
- **Portable**: Story bundles are self-contained and distributable.
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

### Resolution Order (Layered Overrides)
1. Story bundle **local packages** (overrides)
2. Central registry packages (marketplace)
3. Error if missing (or use fallback strategy)

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

> The "default pack" is simply a curated **list of registry packages** that stories can
> reference in their manifest. There is no app layer in this model.

### B) Story Bundle (author-provided)
```
/stories/<storyId>/bundle/
  manifest.json
  components/...
  shells/...
  plugins/...
  themes/...
  assets/...
```

### Resolution Strategy
- **Local packages first**: story bundle entries override registry packages.
- If no local match, resolve from the **central registry** by semver.
- If missing, use `fallback_strategy` or fail in strict mode.

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
  bundle_id (uuid, fk -> story_bundles.id)  -- story bundle metadata
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

### 4.4 Story Bundles
```
story_bundles:
  id (uuid, pk)
  story_id (uuid, fk -> stories.id)
  storage_path (text)                       -- CDN/S3 location
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
  local_packages (jsonb)                    -- [{ id, version, kind, path }]
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
  "localPackages": [
    {
      "id": "text_block",
      "version": "2.1.0",
      "kind": "component",
      "path": "components/text_block/2.1.0"
    }
  ],
  "fallbackStrategy": "strict"
}
```

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
1. Load story bundle metadata and read `localPackages`.
2. Resolve required components/shell/plugins/theme from the **registry** by semver.
3. Overlay any matching `localPackages` (local wins).
4. Validate capabilities and permissions.
5. Build a runtime context for rendering.

---

## 7) Engine Execution Flow (New)
1. Load story + nodes + edges.
2. Load story manifest + story bundle metadata.
3. Resolve registry packages and overlay local packages.
4. Validate:
   - engine version
   - required packages present
   - capability permissions
5. Initialize shell + plugins.
6. Render nodes via resolved component packages.
7. Emit analytics/events.

---

## 8) Authoring Workflow (New)

### Step 1: Create Story Bundle
```
manifest.json
components/
shells/
plugins/
themes/
assets/
```

### Step 2: Declare Requirements
Add to `story_manifests`:
- required components
- shell
- plugins
- theme
- localPackages (local overrides)
- fallback strategy

### Step 3: Publish
Upload story bundle and register manifest in DB.

---

## 9) Marketplace Requirements
- Package registry API
- Semver resolution
- Ratings/reviews
- Capability policy enforcement
- License tracking

---

## 10) Implementation Phases

### Phase 1: Core Data + Runtime
- Implement new DB schema (story_bundles, packages, manifest).
- Build registries (component/shell/plugin/theme).
- Build resolver pipeline.

### Phase 2: Bundle System
- Build packager format.
- Bundle loader (local + remote).
- Story bundle registry in DB.

### Phase 3: Shell + Theme System
- Shell registry and render pipeline.
- Theme token and override system.

### Phase 4: Plugin System
- Capability model.
- Permission checks.
- Plugin runtime hooks.

### Phase 5: Marketplace
- Package catalog service.
- Publish/update endpoints.
- Dependency validation.

---

## 11) Non-Goals (Explicit)
- Backwards compatibility with current schema/runtime.
- Migrating old stories automatically.
- Supporting mixed legacy and new formats in the same runtime.

---

## 12) Success Criteria
1. Story bundles can run independently if all required packages are local.
2. A story can override any component or shell without forking engine code.
3. Marketplace packages can be installed without code changes.
4. Authors can add new components by publishing a package.
