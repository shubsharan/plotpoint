| Field | Value |
|---|---|
| **Source** | [Monorepo Scaffold + Contracts](https://www.notion.so/321997b3842e81929d84dc1272a1ea51) |
| **Type** | PRD |
| **Status** | Backlog |
| **Project** | Monorepo Scaffold + Contracts |
| **Domains** | Infrastructure, Engine, API, Data Model |
| **Last synced** | 2026-03-12 |

## Goal
Ship a clean, buildable monorepo with the four core packages scaffolded, shared tooling configured, and the contracts + database schema defined — so that all downstream projects (Engine, API, Mobile) can start implementation against stable interfaces.

## Background & Context
Plotpoint is a narrative-first, location-based experience platform. Before any runtime logic can be built, the project needs a solid foundation: workspace tooling, package boundaries, shared configuration, API contracts, and a database schema. This PRD covers that foundational layer.

The architecture follows hexagonal principles (engine defines ports, db implements them) and feature-slice organization for the API. See the linked Architecture doc for full details.

## Scope

### In scope
- pnpm workspaces + Turborepo configuration
- Shared TypeScript config in `packages/config/`
- Vitest setup across all packages
- `packages/contracts/` — Zod request/response schemas for all API routes
- `packages/db/` — Drizzle schema for Supabase Postgres (stories, players, user_saves, game_saves tables)
- `packages/engine/` — empty shell with `ports.ts` type definitions
- `apps/api/` — empty Hono shell
- `apps/mobile/` — empty Expo shell
- Story JSON format definition (canonical authoring format, Zod-validated)

### Out of scope
- Any runtime logic, UI, or business logic
- Engine internals (block system, graph traversal, executor) — that's a separate project
- Auth, middleware, deployment
- Mobile UI components

## High-level Requirements
1. **Workspace tooling:** pnpm workspaces with Turborepo for task orchestration. `turbo.json` defines build, test, lint pipelines.
2. **Shared config:** Base `tsconfig.json` in `packages/config/tsconfig/` with app-specific extends (api, mobile, library). Shared lint config.
3. **Testing:** Vitest configured per-package. Each package has its own `vitest.config.ts`.
4. **Contracts package:** Zod schemas for every API route's request and response shapes. Types inferred from Zod — no duplicate type definitions. Routes: start-session, submit-action, list-stories, get-story, create-story, update-story, delete-story, publish-story.
5. **Database schema:** Drizzle ORM table definitions for `stories`, `players`, `user_saves`, `game_saves`. Client setup for Supabase Postgres.
6. **Engine ports:** Abstract dependency types in `engine/ports.ts` — StoryRepo, UserSaveRepo, GameSaveRepo, LocationReader. No implementation.
7. **Story JSON format:** Zod schema defining the canonical story bundle structure (graph, nodes, edges, block instances, conditions). Lives in engine package.

## Architecture & Key Decisions
- **Types live in their respective packages.** No standalone `types` or `schemas` package. Domain types in engine, API contracts in contracts, DB types in db.
- **Dependency flow:** `mobile → contracts ← api → engine ← db`. Engine imports nothing external.
- **Engine ports pattern:** Engine defines abstract port types. `db/repos/` provides thin wrappers implementing those ports. See linked Architecture doc.
- **Zod as single source of truth:** All shared types are inferred from Zod schemas. No manual TypeScript type definitions that duplicate schema shapes.

## Cross-cutting Concerns
- All packages must build cleanly with `turbo build`
- All packages must pass `turbo test` (even if tests are trivial/empty initially)
- Strict TypeScript everywhere — no `any`, no `as` casts without justification
- Named exports only, barrel exports only at package root

## Open Questions
None — architecture decisions are documented in the linked Architecture doc.
