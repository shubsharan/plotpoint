| Field | Value |
|---|---|
| **Source** | [Shared Config Cleanup + Package Rename](https://www.notion.so/322997b3842e810a86aff93316e69de6) |
| **Type** | Task |
| **Status** | Done |
| **Project** | Monorepo Scaffold + Contracts |
| **Issue ID** | PPT-2 |
| **Last synced** | 2026-03-12 |

## Context

Rename `packages/schemas` to `packages/contracts` and add app-specific tsconfig overrides. Aligns with the architecture defined in the [Monorepo Scaffold + Contracts](../prds/monorepo-scaffold-contracts.md) PRD.

## Requirements

- Rename `packages/schemas/` directory to `packages/contracts/`
- Update package name in `package.json` from `@plotpoint/schemas` to `@plotpoint/contracts`
- Update all workspace references (root `package.json`, `turbo.json`, any imports)
- Add `packages/config/tsconfig/api.json` — extends base, targets Node
- Add `packages/config/tsconfig/mobile.json` — extends base, targets React Native/Expo
- Add `packages/config/tsconfig/library.json` — extends base, for shared packages
- Update `packages/config/package.json` exports/files so the new presets resolve via package specifiers
- Update each package/app `tsconfig.json` to extend the appropriate override instead of base directly

## Affected Packages & Files

- `packages/schemas/` -> `packages/contracts/` (rename)
- `packages/contracts/package.json` (update name)
- `packages/config/package.json` (export new tsconfig entries)
- `packages/config/tsconfig/api.json` (new)
- `packages/config/tsconfig/mobile.json` (new)
- `packages/config/tsconfig/library.json` (new)
- `packages/*/tsconfig.json` (update extends)
- `apps/*/tsconfig.json` (update extends)

## Acceptance Criteria

- [x] `packages/contracts/` exists with correct package name `@plotpoint/contracts`
- [x] App-specific tsconfig files exist and are used by their respective packages
- [x] `turbo build`, `turbo test`, `turbo typecheck` all pass
- [x] No references to `@plotpoint/schemas` remain in implementation files

## Dependencies

None — this is the first task.

## Technical Notes

This is a foundational rename that all subsequent tasks depend on. Ensure the rename is clean and no stale references remain.

## Delivery Notes

- This task intentionally closes as a narrow infrastructure change: contracts package rename plus shared `tsconfig` cleanup.
- Remaining package namespace consistency outside `packages/contracts` is follow-up work, not part of PPT-2.
- The repo remains scaffold-level after this task; API, engine, DB, and mobile feature implementation are out of scope here.
