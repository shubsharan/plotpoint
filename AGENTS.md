# Plotpoint

Narrative-first, location-based experience platform. Players run co-op stories (murder mysteries, treasure hunts) inside a single mobile app. Creators publish via JSON authoring.

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Mobile:** Expo (React Native)
- **API:** Hono (deployment-agnostic)
- **Database:** Supabase (auth, Postgres, Realtime)
- **ORM:** Drizzle
- **Validation:** Zod
- **Testing:** Vitest
- **Language:** TypeScript (strict)

## Notion-First Workflow

Notion is the source of truth for all product documentation. The repo receives docs via sync/automation workflows. Every piece of work follows: **Roadmap -> current Epic -> Architecture (as needed for the current epic) -> Feature PRD -> branch -> implement -> review**.

### Document Hierarchy

| Notion artifact | Purpose | Repo location |
|---|---|---|
| **Roadmap** | Ordered MVP epic queue and high-level sequencing | `docs/product/product-roadmap.md` |
| **Runbook** | Operational guides and repeatable delivery workflows | `docs/runbooks/{runbook-slug}.md` |
| **Epic** | Broader initiative with strategic and sequencing context | `docs/epics/{epic-slug}.md` |
| **Feature PRD** | Actionable implementation unit with requirements and acceptance criteria | `docs/features/{feature-slug}.md` |
| **ADR** (Docs DB, Type=ADR) | Architecture decision record | `docs/adrs/ADR-{slug}.md` |
| **Architecture** (Docs DB, Type=Architecture) | System design docs | `docs/architecture/{slug}.md` |

### Documentation Structure

```
docs/
  product/           # Strategy and roadmap
  runbooks/          # Operational guides and team workflows
  epics/             # Strategic initiatives
  features/          # Feature-level PRDs (implementation units)
  adrs/              # Docs DB Type=ADR
  architecture/      # Docs DB Type=Architecture
```

### Rules

1. **Read before building.** Before implementing, read the target feature PRD in `docs/features/`, its linked epic in `docs/epics/`, and any linked architecture docs.
2. **Roadmap before epics, epics before features.** Keep decomposition order strict: roadmap -> current epic -> feature PRD.
3. **Plan just in time.** The roadmap can list many future epics, but only the current epic should be fully documented. Do not pre-write future epic, architecture, or feature docs unless they are required to unblock current work.
4. **ADRs for non-obvious decisions.** When a design choice has meaningful trade-offs, document it as an ADR and link it from the epic or feature PRD.
5. **Specs are living documents.** Update specs when implementation reveals the design was wrong. Do not let code and docs drift.
6. **Don't build what isn't specced.** If needed work is missing from feature PRDs, stop and write/update the feature spec first.
7. **One Feature PRD = one branch = one PR.** Start implementation by setting the feature PRD to `In Progress` and opening a draft PR with a scaffolding docs commit.
8. **Status hygiene.** On merge, update feature, epic, and roadmap statuses to keep planning artifacts accurate.

## Architecture Principles

- **Engine is pure TypeScript.** Zero dependency on React, React Native, Expo, or any UI framework. Fully headless-testable.
- **Components are logic-first.** State machines and action vocabularies are decoupled from rendering. Components define a render function but logic never depends on UI.
- **Actions flow upward.** Components trigger actions → ActionDispatcher routes to engine → engine mutates state. Components never mutate game state directly.
- **Supabase for infrastructure, Hono for compute.** Auth, database, and realtime via Supabase. Server-side logic (webhooks, publishing, analytics) via Hono API. No Supabase Edge Functions.

## Code Conventions

- Infer TypeScript types from Zod schemas — don't duplicate type definitions.
- Each package is self-contained with its own `package.json`, `tsconfig.json`, and `vitest.config.ts`.
- Test files live next to the code they test (`foo.ts` → `foo.test.ts`).
- No default exports. Use named exports everywhere.
- Barrel exports (`index.ts`) only at the package root level. No nested barrel files — they increase circular dependency risk.
- Test files go in `__tests__/` folders, not next to source files (e.g., `src/__tests__/foo.test.ts`, not `src/foo.test.ts`).
