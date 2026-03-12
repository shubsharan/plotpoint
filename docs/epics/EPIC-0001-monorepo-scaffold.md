# Epic: Monorepo Scaffold + Core Types

| Field       | Value                        |
|-------------|------------------------------|
| **Phase**   | 1                            |
| **Status**  | In Progress                  |
| **Depends** | —                            |
| **Blocks**  | Phase 2 (Story Engine)       |

## Goal

Establish a clean monorepo with build tooling, shared TypeScript types, Zod validation schemas, Drizzle database skeleton, and the canonical Story JSON format — so every subsequent phase builds on a validated, consistent foundation.

## Background & References

- [Product overview & architecture decisions](../product/overview.md)
- [Product roadmap — Phase 1 definition](../product/roadmap.md#phase-1-monorepo-scaffold--core-types)
- [CLAUDE.md — tech stack & code conventions](../../CLAUDE.md)

## Scope

### In scope

- pnpm workspaces + Turborepo configuration
- Shared TypeScript config (strict mode)
- Vitest setup (per-package)
- Zod schemas for the core domain
- TypeScript types inferred from those schemas
- Drizzle ORM skeleton tables for Supabase Postgres
- Story JSON format definition
- Empty app shells (`apps/mobile/`, `apps/api/`)
- `engineVersion` field on story manifests
- `category` field on location nodes (ad-ready)

### Out of scope

- Any runtime logic, UI, or business logic
- Engine implementation (Phase 2)
- Component system (Phase 3)
- Multiplayer / Realtime (Phase 4)
- Story validation beyond schema-level (Phase 2 — StoryValidator)

## Monorepo Structure

```
apps/
  mobile/              # Expo app (empty shell)
  api/                 # Hono API (empty shell)
packages/
  engine/              # Story graph engine (empty — Phase 2)
  components/          # Component system (empty — Phase 3)
  types/               # Shared TypeScript types (inferred from schemas)
  schemas/             # Zod validation schemas
  db/                  # Drizzle ORM + Postgres schema
docs/
  product/
    overview.md
    roadmap.md
  epics/
  features/
  adrs/
```

Each package is self-contained with its own `package.json`, `tsconfig.json`, and `vitest.config.ts`.

## Deliverables

### 1. Monorepo & Build Tooling

- **pnpm workspaces** — workspace definitions covering `apps/*` and `packages/*`
- **Turborepo** — `turbo.json` with pipelines for `build`, `test`, `lint`, `typecheck`
- **Shared TypeScript config** — base `tsconfig.json` with strict mode, extended by each package
- **Vitest** — per-package `vitest.config.ts`, runnable via Turborepo pipeline

### 2. Core Domain Schemas (`packages/schemas/`)

Zod schemas for the fundamental domain objects:

- **Story** — top-level manifest including `engineVersion`, metadata, list of node/edge IDs, component manifest references
- **Node** — scene/checkpoint definition; location nodes include a `category` field for future ad support
- **Edge** — connection between nodes with a condition tree and optional priority
- **Condition** — condition tree nodes supporting `equals`, `greater_than`, `matches_pattern`, `player_has_role`, `node_visited`, `shared_state_check`, composed with AND/OR operators
- **Role** — role definition (name, description, starting node)
- **ComponentManifest** — declares components a story uses, their versions, per-node config, and `compatibleEngineVersions`
- **PlayerState** — per-player state (current node, visited nodes, local variables)
- **SharedGameState** — cross-player shared state (variables visible to all players in a session)

### 3. TypeScript Types (`packages/types/`)

Types inferred from the Zod schemas using `z.infer<>`. No duplicated type definitions — schemas are the single source of truth.

### 4. Database Schema (`packages/db/`)

Drizzle skeleton tables for Supabase Postgres:

- `stories` — story metadata, `engine_version`, storage URLs
- `nodes` — node definitions, `category` field
- `edges` — edge definitions with condition references
- `users` — player accounts (Supabase auth integration)
- `sessions` — game sessions (skeleton — Phase 4 extends with invite codes, shared state)
- `roles` — role definitions per story

These are skeleton tables. Phase 4 extends session-related tables with additional columns and joins.

### 5. Story JSON Format Definition

The canonical JSON authoring format, defined alongside the schemas so that:

- All test stories from Phase 2 onward validate against the real format
- Creators have a clear contract for hand-authored JSON
- The format includes `engineVersion` at the top level

## Cross-Cutting Concerns

These concerns from the roadmap are relevant to Phase 1 and should be reflected in the schemas:

- **`engineVersion`** — present on the Story schema from day one. No migration adapters yet, but the field exists so the extension point is clear.
- **`category` on location nodes** — the Node schema supports a `category` field for nodes with location requirements, enabling future ad-service integration without schema changes.
- **`MigrationAdapter` interface** — defined in Phase 2 but informed by the `engineVersion` field established here.

## Acceptance Criteria

- [ ] Monorepo installs cleanly with `pnpm install` from root
- [ ] `pnpm turbo build` succeeds across all packages
- [ ] `pnpm turbo test` runs Vitest in every package with at least one passing test per schema/table
- [ ] `pnpm turbo typecheck` passes with strict TypeScript
- [ ] All Zod schemas parse valid fixtures and reject invalid ones
- [ ] TypeScript types are inferred from Zod schemas (no duplicated type definitions)
- [ ] Drizzle schema compiles and represents the skeleton tables listed above
- [ ] Story JSON format is documented and has at least one valid example fixture
- [ ] `apps/mobile/` is a bootable Expo shell (even if blank screen)
- [ ] `apps/api/` is a runnable Hono server (even if no routes beyond health check)
- [ ] No runtime logic, UI components, or business logic exists in any package

## Feature Specs Needed

The following feature specs should be created in `docs/features/` before implementation begins:

| Feature spec file                         | Covers                                                        |
|-------------------------------------------|---------------------------------------------------------------|
| `monorepo-tooling.md`                     | pnpm workspaces, Turborepo, shared tsconfig, Vitest setup     |
| `core-domain-schemas.md`                  | All Zod schemas and inferred types                            |
| `database-skeleton.md`                    | Drizzle table definitions and Supabase integration            |
| `story-json-format.md`                    | Canonical JSON authoring format and example fixtures          |
| `app-shells.md`                           | Empty Expo and Hono app scaffolds                             |
