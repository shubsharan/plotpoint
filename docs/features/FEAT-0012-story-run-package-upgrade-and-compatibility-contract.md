| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0009-story-run-records-lobby-and-pinned-resume-contract](../features/FEAT-0009-story-run-records-lobby-and-pinned-resume-contract.md)<br>[FEAT-0010-story-run-lifecycle-replacement-and-completion-contract](../features/FEAT-0010-story-run-lifecycle-replacement-and-completion-contract.md)<br>[FEAT-0011-shared-state-commits-sync-gates-and-notification-contract](../features/FEAT-0011-shared-state-commits-sync-gates-and-notification-contract.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)<br>[story-run-lifecycle-and-state-ownership](../architecture/story-run-lifecycle-and-state-ownership.md) |

# FEAT-0012 - Story Run Package Upgrade and Compatibility Contract

## Goal

Define the explicit mid-run upgrade contract for pinned published package versions so an active `StoryRun` can move to a newer `storyPackageVersionId` only through an admin-triggered, fail-closed compatibility flow.

## Background and Context

`FEAT-0009` locks run pinning and resume against a stored `storyPackageVersionId`, and `EPIC-0003` left `DF-0001` open for the policy that would govern explicit upgrades later. `FEAT-0010` defines the run admin and lifecycle boundaries, and `FEAT-0011` defines stable shared-state coordination needed before an upgrade can run safely.

This feature is the EPIC-0004 resolution path for that deferred policy. It does not weaken pinning. Instead, it defines the only allowed way to move an active run to a newer published package version while preserving explicit compatibility checks and prior pinned-version safety on failure.

## Scope

### In scope

- Define the upgrade request surface for moving a run to a newer published package version.
- Define run-admin authorization and stable-boundary eligibility rules for upgrades.
- Define compatibility evaluation and migrator requirements for upgrades.
- Define durable persistence behavior for successful and failed upgrades.
- Define typed failures for authorization, compatibility, migration, and stale pinning attempts.
- Define post-upgrade resume and notification expectations.

### Out of scope

- Changing the core run record families defined in `FEAT-0009`.
- Redefining lifecycle statuses or completion semantics owned by `FEAT-0010`.
- Redefining sync-gate coordination semantics owned by `FEAT-0011`.
- Automatic upgrades based on additive heuristics or background publishing changes.
- Creator tooling for authoring or validating package migrators outside the runtime/run contract.

## Requirements

1. The feature must define an explicit upgrade request surface rather than allowing implicit package upgrades during load or resume.
2. Only the run admin defined by `FEAT-0010` may initiate an upgrade for MVP.
3. An upgrade may only start while the run is `active` and no sync gate is currently `collecting` or `ready`.
4. The target package version must be a newer published `storyPackageVersionId` for the same story as the current run pin.
5. Every upgrade attempt must run an explicit compatibility check before the run pin changes.
6. Compatibility must depend on an explicit run upgrade migrator contract. No heuristic "additive-only" upgrade path exists for MVP.
7. A successful upgrade must atomically persist the migrated shared and role-state snapshots plus any required run metadata updates, then update the run's pinned `storyPackageVersionId`.
8. A failed compatibility check or failed migration must preserve the prior pinned version and prior durable run state unchanged.
9. Resume after a successful upgrade must load the migrated state against the new pinned package version through the existing lifecycle/load contracts.
10. Upgrade attempts and results must surface through typed adapter errors and notification events.

## Locked Contracts

### Upgrade Request Surface

- `requestRunUpgrade(request)` is the only allowed upgrade entrypoint.
- The request contains `runId`, `requestedByParticipantId`, `targetStoryPackageVersionId`, and `expectedCurrentStoryPackageVersionId`.
- Requests that do not match the current durable run pin fail explicitly rather than silently retrying against the latest stored version.

### Upgrade Eligibility Rules

- Only the current run admin may call `requestRunUpgrade`.
- Eligible runs must be `active`.
- Eligible runs must not have an in-flight sync gate with status `collecting` or `ready`.
- Completed runs and runs pinned to a different story reject upgrade attempts.

### Compatibility Result Contract

- `StoryRunUpgradeCompatibilityResult` contains `decision = 'compatible' | 'incompatible'`, `fromStoryPackageVersionId`, `toStoryPackageVersionId`, `migratorId`, and an explicit rejection reason when incompatible.
- Compatibility is evaluated against the current durable run aggregate, not against route-local request payloads.
- Missing migrator metadata is an incompatible result, not a fallback to best-effort resume.

### Story Run Upgrade Migrator Contract

- A `StoryRunUpgradeMigrator` is the explicit compatibility contract between one pinned package version and a newer target version.
- The migrator consumes the current durable run aggregate needed for resume, including shared state, per-role state, current pinned version, role-slot/binding context, and run admin metadata where needed.
- The migrator returns the fully migrated durable run aggregate required for later `loadSession` calls against the target package version.
- Migrators must be deterministic and fail explicitly when the existing run state cannot be represented safely on the target package version.

### Typed Upgrade Errors

- `run_upgrade_unauthorized`
- `run_upgrade_ineligible`
- `run_upgrade_target_missing`
- `run_upgrade_target_invalid`
- `run_upgrade_migrator_missing`
- `run_upgrade_incompatible`
- `run_upgrade_migration_failed`
- `run_upgrade_pin_stale`

## Architecture and Technical Notes

- Upgrade authority stays adapter-owned. The engine remains the gameplay executor before and after migration, but adapters own eligibility checks, migrator selection, and durable state rewrite.
- The success path is intentionally narrow: check admin authorization, verify stable sync-gate boundary, load the current durable run aggregate, run compatibility and migration, persist the migrated aggregate, then update the pinned package version.
- Fail closed behavior is mandatory. Any failure before durable migration commit leaves the run pinned to its prior published package version with its prior durable state intact.
- Notification requirements follow the same transport-agnostic rule as `FEAT-0011`. Participants need explicit upgrade-started, upgrade-succeeded, or upgrade-failed signals, but the provider remains an implementation detail.

## Acceptance Criteria

- [ ] The feature defines an explicit, admin-only run upgrade request surface.
- [ ] Upgrade eligibility is limited to stable active runs with no in-flight sync-gate coordination.
- [ ] Compatibility requires an explicit migrator contract and never falls back to heuristic or implicit upgrades.
- [ ] Failed compatibility or migration preserves the prior pinned version and prior durable run state.
- [ ] Successful upgrades rewrite durable state and resume against the new pinned package version through existing lifecycle contracts.
- [ ] Typed upgrade failures are explicit enough for implementation without reopening run pinning rules.

## Test Plan

- Add contract tests proving only the current run admin can initiate an upgrade.
- Add eligibility tests proving upgrades are rejected while a sync gate is in progress or after run completion.
- Add compatibility tests proving missing migrators and incompatible targets fail closed without changing the current pin or durable state.
- Add migration tests proving a successful migrator rewrites the durable run aggregate, including role/shared state, and updates the pinned `storyPackageVersionId`.
- Add resume tests proving a successfully upgraded run loads against the new pinned package version and a failed upgrade continues to load against the prior pin.

## Rollout and Observability

- Land this feature after lifecycle and shared-state contracts so upgrade eligibility can depend on stable admin and sync-gate rules instead of redefining them.
- Record upgrade request, compatibility result, migration failure, and upgrade success events with typed metadata for operational debugging.
- Keep the run pinned to its previous version until the migrated aggregate is durably stored so partial upgrades are observable as failures rather than ambiguous run drift.

## Risks and Mitigations

- Risk: upgrade requests weaken the existing pin-by-default policy. Mitigation: keep upgrade entrypoints explicit, admin-only, and fail closed.
- Risk: compatibility logic becomes implicit or heuristic. Mitigation: require an explicit deterministic migrator contract for every successful upgrade.
- Risk: migration partially rewrites durable state and leaves the run unusable. Mitigation: treat durable pin update and migrated state persistence as one successful outcome, otherwise preserve the prior aggregate unchanged.
- Risk: sync-gate and upgrade eligibility rules drift apart. Mitigation: make stable-boundary eligibility depend directly on `FEAT-0011` sync-gate statuses.

## Open Questions

- None. This feature is the planned EPIC-0004 resolution path for the existing package-upgrade follow-up and should not defer a second upgrade-policy feature.
