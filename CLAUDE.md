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

Notion is the source of truth for all product documentation. The repo receives docs via the `/notion-to-branch` pipeline skill. Every piece of work follows: **PRD → Task → branch → implement → review**.

### Document Hierarchy

| Notion artifact | Purpose | Repo location |
|---|---|---|
| **PRD** (Docs DB, Type=PRD) | Strategic context: goal, scope, requirements, architecture decisions | `docs/prds/PRD-{slug}.md` |
| **Task** (Tasks DB) | Implementation spec: requirements, affected files, acceptance criteria | `docs/tasks/PP-{id}-{slug}.md` |
| **ADR** (Docs DB, Type=ADR) | Architecture decision record | `docs/adrs/ADR-{slug}.md` |
| **Architecture** (Docs DB, Type=Architecture) | System design docs | `docs/architecture/{slug}.md` |

### Documentation Structure

```
docs/
  prds/              # Docs DB Type=PRD
  tasks/             # Tasks DB (imported per-task, named by Issue ID)
  adrs/              # Docs DB Type=ADR
  architecture/      # Docs DB Type=Architecture
```

### Rules

1. **Read before building.** Before starting any task, read the imported task spec in `docs/tasks/` and linked PRD in `docs/prds/`. If no spec exists, create it in Notion first.
2. **PRD before Tasks.** A PRD must exist in Notion before creating Tasks under it. Tasks carry implementation detail — run `superpowers:write-plan` against the task spec.
3. **ADRs for non-obvious decisions.** When a design choice has meaningful trade-offs, document it as an ADR in the Docs DB (Type=ADR). Reference the ADR from the relevant PRD or Task.
4. **Specs are living documents.** Update Notion specs when implementation reveals the design was wrong. Re-sync to repo. Don't let code and docs drift apart.
5. **Don't build what isn't specced.** If you discover something needs building that isn't in a spec, stop and spec it in Notion first — even if it's small.
6. **One Task = one branch = one PR.** Use `/notion-to-branch` to scaffold the branch and import specs from Notion.

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
