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

## Doc-First Workflow

Every piece of work follows this flow: **spec → plan → implement → review**.

### Documentation Structure

```
docs/
  product/
    overview.md        # Architecture & product decisions (source of truth)
    roadmap.md         # Phased product roadmap
  epics/               # One file per epic (maps to roadmap phases)
  features/            # Granular feature specs (implementation-ready)
  adrs/                # Architecture Decision Records
```

### Rules

1. **Read before building.** Before starting any epic or feature, read the relevant spec in `docs/`. If no spec exists, write one first.
2. **Epics before features.** An epic doc must exist before creating feature files within it. A feature file must exist before writing code for it.
3. **ADRs for non-obvious decisions.** When a design choice has meaningful trade-offs (e.g., separate components vs. single component with modes), document it as an ADR in `docs/adrs/`. Reference the ADR from the relevant feature spec.
4. **Specs are living documents.** Update specs when implementation reveals the design was wrong. Don't let code and docs drift apart.
5. **Don't build what isn't specced.** If you discover something needs building that isn't in a spec, stop and spec it first — even if it's small.

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
