| Field           | Value                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| **Source**      | [Monorepo Scaffold + Contracts](https://www.notion.so/321997b3842e81929d84dc1272a1ea51) |
| **Type**        | PRD                                                                                     |
| **Feature ID**  | FEAT-0001                                                                               |
| **Status**      | Completed                                                                               |
| **Epic**        | EPIC-0001                                                                               |
| **Owner**       | product-engineering                                                                     |
| **Domains**     | Infrastructure, Engine, API, Data Model                                                 |
| **Last synced** | 2026-03-19                                                                              |

# FEAT-0001 - Monorepo and Shared Config Finalization

## Goal

Close the remaining monorepo foundation gaps so downstream MVP work starts from stable package boundaries, shared tooling, and reliable workspace commands instead of ad hoc scaffold cleanup.

## Background and Context

Plotpoint already has a scaffold-stage monorepo, but EPIC-0001 still needs one foundation feature that codifies what "ready to build on" means. In this feature, "ready" means the repo shape, naming, shared config, and root workspace commands are clean and reliable before deeper runtime and mobile work begins.

The scope stays intentionally narrow: this feature finalizes the platform foundation. It does not pre-build future story-runtime behavior that belongs to later epics.

## Scope

### In scope

- pnpm workspace and Turborepo task orchestration that runs cleanly from the repo root
- shared TypeScript and lint config in `packages/config/`
- Vitest setup across apps and packages
- stable package boundaries for `packages/db`, `packages/engine`, `apps/api`, and `apps/mobile`
- consistent `@plotpoint/*` workspace package naming across both `apps/` and `packages/`
- placeholder entrypoints that make intended package ownership and dependency direction visible without pre-building future feature logic
- cleanup of foundation-level docs and references so they match the current repo structure

### Out of scope

- story bundle schema design and publishing rules for future epics
- engine runtime logic, traversal, or condition evaluation
- player-facing mobile gameplay UI
- auth, deployment, analytics, and launch operations

## Requirements

1. Root workspace commands succeed for `build`, `test`, `typecheck`, and `lint`.
2. Each app/package is self-contained with its own `package.json`, `tsconfig.json`, and `vitest.config.ts` where applicable.
3. Shared config in `packages/config/` is the only source for common TypeScript and lint configuration.
4. Workspace package names follow a single `@plotpoint/*` namespace while preserving the `apps/` and `packages/` folder split.
5. `packages/db` and `packages/engine` expose intentional scaffold boundaries only; concrete runtime contracts, schema, and ports are deferred to later features.
6. Placeholder entrypoints and tests compile cleanly without leaking future runtime behavior into this feature.
7. Repo docs and references that describe the foundation stage align with the actual package layout and naming conventions.

## Architecture and Technical Notes

- Primary architecture reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- This feature should reinforce the dependency flow `mobile -> api -> engine <- db`.
- The dependency flow is a boundary target for scaffold ownership in this feature, not yet a requirement for concrete implementations.
- Zod remains the planned source of truth for shared schema shapes in later feature work.
- Story bundle schema work is intentionally deferred to `EPIC-0002`.
- No new ADR is required unless foundation cleanup reveals a non-obvious package-boundary trade-off.

## Acceptance Criteria

- [x] Root workspace `build`, `test`, `typecheck`, and `lint` commands run successfully.
- [x] Foundation packages and apps expose the expected boundaries and compile cleanly.
- [x] Shared TypeScript and lint config are centralized in `packages/config/`.
- [x] Workspace packages use consistent `@plotpoint/*` naming while keeping the `apps/` and `packages/` folder split.
- [x] Placeholder scaffolds remain intentionally lightweight and do not imply unfinished runtime behavior belongs in this feature.
- [x] Foundation docs and references match the repo's actual structure and naming.

## Test Plan

- Run `pnpm build`.
- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Manually verify that package boundaries and docs references match the repo layout.

## Rollout and Observability

- No end-user rollout; this is internal foundation work.
- Success is observed through clean workspace commands and reduced setup friction for the next feature.

## Risks and Mitigations

- Risk: this feature accidentally grows into future story-runtime design. Mitigation: defer story bundle and runtime behavior to later epics.
- Risk: foundation cleanup changes package boundaries in ways that contradict the existing architecture doc. Mitigation: keep `docs/architecture/hexagonal-feature-slice-architecture.md` as the source of truth and update it if a real decision changes.

## Open Questions

- None. This feature stops at repo shape, naming, shared config centralization, and clean scaffold boundaries.

## Implementation Notes

- The finalized foundation workspace includes `apps/api`, `apps/mobile`, `packages/db`, `packages/engine`, and `packages/config`.
- `packages/components` and `packages/types` were removed because they were not part of the FEAT-0001 scaffold boundary contract.
- App `build` commands now emit compiled placeholder entrypoints instead of succeeding through echo-only stubs.
