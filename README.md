# Plotpoint

Adventure is out there! Get up. Get out. Grab your friends. With Plotpoint, there's mystery, romance, and adventure on every corner.

## Objective

Deliver a playable Plotpoint story that builds on the 2025 beta: a single mobile app where small groups can discover a story, join a session, receive roles, and complete a real-world narrative run authored internally as a `StoryPackage`. Plotpoint is optimizing for story quality, execution clarity, and a clean release pipeline before it optimizes for openness, scale, or creator tooling breadth.

## Goals

- Ship a curated co-op story loop that players can browse, join, play, resume, and finish.
- Let internal creators publish and update `StoryPackage` releases without per-story custom code.
- Keep runtime behavior deterministic across player-scoped and shared game-scoped state.
- Support repeatable playtests and a predictable improvement loop as the MVP catalog expands.

## Roadmap, As Execution Logic

`docs/product/product-roadmap.md` defines strategic sequencing. `docs/index.md` is the operational source of truth for current implementation state.

The roadmap is ordered the way the system needs to be built:

- `EPIC-0001` came first to clean up the monorepo, package boundaries, and shared config surface. Without that baseline, every later feature would pay architecture debt.
- `EPIC-0002` came next to lock the content contract and publishing pipeline. Plotpoint needed stable `StoryPackage` inputs and repeatable published artifacts before runtime semantics could be trusted.
- `EPIC-0003` is the current runtime epic. `FEAT-0006` established the engine public surface and pinned runtime state model. `FEAT-0007` added deterministic block execution and the block registry.
- `FEAT-0008` is the current gating milestone. It replaces the temporary unconditional-edge-only traversal behavior with real condition evaluation and graph traversal semantics.
- Only after runtime semantics are complete does it make sense to layer in session lifecycle, multiplayer persistence, renderer UX, structured playtest operations, and launch hardening.

This sequencing is deliberate: stable contracts first, deterministic execution second, traversal semantics third, then session and product surfaces on top.

## Engineering Approach

- The engine is pure TypeScript and headless. Gameplay authority lives in `packages/engine`, not in API handlers or UI components.
- Hexagonal boundaries are strict. The engine owns runtime contracts and ports; API and mobile adapt around it; only API owns DB wiring.
- Runtime state is intentionally sparse. Persisted `playerState` and `sharedState` store only mutated block state, while hydrated snapshots expose the current node state that hosts need to render and orchestrate play.
- Documentation has explicit ownership. Strategy and sequencing live in `docs/product/`; current implementation state lives in `docs/index.md`; scoped contracts and trade-offs live in epics, features, and ADRs.
- Verification is part of the delivery system, not cleanup work. `pnpm verify` and `pnpm docs:check` exist to keep code, contracts, and repo documentation moving together.

## Repo Operating Model

This repository is designed to be legible to both humans and agents. Intent is written down before implementation, state changes have a single current-source document, architectural boundaries are explicit, and verification is scripted.

That operating model keeps AI assistance useful without making the codebase fuzzy. Narrow interfaces, explicit docs ownership, deterministic runtime contracts, and fast verification loops make it easier to move quickly without losing control of the product surface.

## Engineering Quickstart

### Workspace

- `apps/api` - Hono API application
- `apps/mobile` - Expo mobile application
- `packages/db` - database schema, queries, and repository adapters
- `packages/engine` - headless gameplay engine
- `packages/config` - shared TypeScript and OXC configuration

### Commands

Run workspace commands from the repo root:

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

## Core Docs

- Current implementation status: `docs/index.md`
- Product strategy: `docs/product/product-strategy.md`
- MVP roadmap: `docs/product/product-roadmap.md`
- Architecture direction: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Delivery workflow: `docs/runbooks/spec-driven-delivery-workflow.md`
- Active epic: `docs/epics/EPIC-0003-headless-runtime-engine-and-condition-system.md`
- Active feature: `docs/features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md`
