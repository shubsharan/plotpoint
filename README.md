# Plotpoint

Plotpoint is a narrative-first, location-based gaming platform. This repository is the monorepo foundation for the API, mobile app, and shared packages described in `docs/strategy/product-strategy.md` and `docs/architecture/hexagonal-feature-slice-architecture.md`.

The current checkout is still scaffold-stage. The workspace, package boundaries, shared TypeScript config, and test/lint/typecheck surfaces are in place, but the engine, API routes, database schema, and mobile UI are still placeholders.

## Workspace

- `apps/api` - scaffold for the Hono API app
- `apps/mobile` - scaffold for the Expo mobile app
- `packages/contracts` - shared API contracts package
- `packages/db` - scaffold for the database layer
- `packages/engine` - scaffold for the headless game engine
- `packages/components` - scaffold for shared UI components
- `packages/types` - placeholder package retained in the scaffold for now
- `packages/config` - shared TypeScript config exports

## Commands

Run all workspace tasks from the repo root:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Package-scoped examples:

```sh
pnpm --filter @plotpoint/contracts test
pnpm --filter @apps/api typecheck
```

## Current Foundation Scope

- pnpm workspaces and Turborepo orchestration
- shared TypeScript config under `packages/config/tsconfig/`
- placeholder package/app entrypoints with Vitest coverage
- `packages/contracts` rename from the earlier `packages/schemas` scaffold

## Docs

- Product strategy: `docs/strategy/product-strategy.md`
- Foundation PRD: `docs/prds/monorepo-scaffold-contracts.md`
- Architecture target: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Current task record: `docs/tasks/PPT-2-shared-config-cleanup-package-rename.md`
