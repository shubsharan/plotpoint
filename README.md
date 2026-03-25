# Plotpoint

Plotpoint is a narrative-first, location-based gaming platform. This repository is the monorepo foundation for the API, mobile app, and shared packages described in `docs/product/product-strategy.md` and `docs/architecture/hexagonal-feature-slice-architecture.md`.

The current checkout is still scaffold-stage. This foundation pass finalizes the monorepo shape, package naming, shared config ownership, and root workspace commands while intentionally leaving the engine, API routes, database schema, and mobile UI as placeholders for later features.

## Workspace

- `apps/api` - scaffold for the Hono API app
- `apps/mobile` - scaffold for the Expo mobile app
- `packages/db` - scaffold for the database layer
- `packages/engine` - scaffold for the headless game engine
- `packages/config` - shared TypeScript and lint config exports

## Commands

Run all workspace tasks from the repo root:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm verify
```

Package-scoped examples:

```sh
pnpm --filter @plotpoint/engine test
pnpm --filter @plotpoint/api typecheck
```

## Current Foundation Scope

- pnpm workspaces and Turborepo orchestration
- shared TypeScript and lint config under `packages/config/`
- placeholder package/app entrypoints with Vitest coverage
- consistent `@plotpoint/*` workspace package naming across `apps/` and `packages/`

## Docs

- Product strategy: `docs/product/product-strategy.md`
- Product roadmap: `docs/product/product-roadmap.md`
- Delivery workflow runbook: `docs/runbooks/spec-driven-delivery-workflow.md`
- Foundation feature PRD: `docs/features/FEAT-0001-monorepo-and-shared-config-finalization.md`
- Architecture target: `docs/architecture/hexagonal-feature-slice-architecture.md`
