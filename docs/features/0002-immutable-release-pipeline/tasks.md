# Tasks: Immutable Release Pipeline

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Governance**: [ADR 0001](../../adrs/0001-deterministic-runtime-contract.md) and [ADR 0002](../../adrs/0002-immutable-release-format.md) are Accepted and govern implementation.

**Tests**: The specification requires deterministic golden builds, source-free inspection, invalid-project coverage, interruption evidence, and release mutation tests. Each story therefore begins with tests that must fail before its implementation tasks.

**Organization**: Tasks are grouped by user story so each product outcome has an independent acceptance checkpoint. Shared public types, canonical byte primitives, and diagnostics live in the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps work to User Story 1 through User Story 4.
- Every task names the concrete file or directory it changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire the existing compiler and protocol packages for Gate 2 development without creating a new workspace package.

- [ ] T001 Add exact `rolldown@1.2.2`, `oxc-parser@0.143.0`, Ajv 8.20.0, `@noble/hashes@2.2.0`, and test dependencies plus compiler CLI/build/test scripts in `packages/compiler/package.json`, `packages/protocol/package.json`, `package.json`, and `pnpm-lock.yaml`
- [ ] T002 [P] Add compiler production/test TypeScript boundaries in `packages/compiler/tsconfig.json` and `packages/compiler/tsconfig.test.json`
- [ ] T003 [P] Add protocol production/test TypeScript boundaries in `packages/protocol/tsconfig.json` and `packages/protocol/tsconfig.test.json`
- [ ] T004 Register isolated `compiler` and `protocol` Vitest projects and public-package aliases in `vitest.config.ts`

**Checkpoint**: Compiler and protocol packages build, type-check, and discover empty Gate 2 test suites.

---

## Phase 2: Foundational Contracts (Blocking Prerequisites)

**Purpose**: Establish the public persisted types and deterministic primitives required by every story.

**CRITICAL**: No user-story implementation begins until this phase passes its unit tests and public-export checks.

- [ ] T005 Define release-format v1, manifest, inventory, compatibility, capability, identity, result, and diagnostic types in `packages/protocol/src/release/types.ts`
- [ ] T006 [P] Implement RFC 8785 canonical JSON encoding and strict decoding in `packages/protocol/src/release/canonical-json.ts`
- [ ] T007 [P] Implement canonical archive path validation and ordinal comparison in `packages/protocol/src/release/paths.ts`
- [ ] T008 [P] Implement CRC-32 and algorithm-qualified SHA-256 byte identities in `packages/protocol/src/release/identity.ts`
- [ ] T009 Define compiler input, project configuration, registration, snapshot, result, and structured location types in `packages/compiler/src/project/config.ts`
- [ ] T010 [P] Implement stable compiler diagnostic codes, constructors, canonical details, ordering, and prose rendering in `packages/compiler/src/diagnostics/codes.ts`, `packages/compiler/src/diagnostics/create.ts`, `packages/compiler/src/diagnostics/order.ts`, and `packages/compiler/src/diagnostics/render.ts`
- [ ] T011 [P] Implement project-root containment, realpath, symlink, case-alias, source-path, and release-destination policy in `packages/compiler/src/project/path-policy.ts`
- [ ] T012 Export only the planned release types/primitives from `packages/protocol/src/index.ts` and compiler types from `packages/compiler/src/index.ts`
- [ ] T013 Add foundational canonical JSON, path, digest, diagnostic ordering, and package-root export tests in `packages/protocol/test/foundations.test.ts`, `packages/compiler/test/unit/diagnostics.test.ts`, and `packages/compiler/test/contract/public-api.test.ts`

**Checkpoint**: Foundation ready; stories can build against stable types, byte primitives, path rules, and diagnostics.

---

## Phase 3: User Story 1 - Compile a Complete Immutable Release (Priority: P1) MVP

**Goal**: Compile one frozen external project into a complete, deterministic, self-contained `.pprelease` whose full emitted bytes determine its identity.

**Independent Test**: Compile the minimal external puzzle 20 times, compare complete bytes and identity, remove source/dependency access, and inventory all logic, presentation, content, progression, schema, component, and asset entries from the artifact alone.

### Tests for User Story 1

- [ ] T014 [P] [US1] Add canonical manifest and deterministic store-only container contract tests in `packages/protocol/test/release-format.test.ts` and `packages/protocol/test/manifest.test.ts`
- [ ] T015 [P] [US1] Add strict project loading, immutable snapshot, input-change, and registry happy-path tests in `packages/compiler/test/unit/project.test.ts` and `packages/compiler/test/unit/snapshot.test.ts`
- [ ] T016 [P] [US1] Create the external-consumer minimal local puzzle with config, exports, schemas, progression, content, component, and asset in `examples/releases/minimal-local-puzzle/`
- [ ] T017 [US1] Add failing 20-build byte-identity, distinct-cwd/output, and source-removal acceptance tests in `packages/compiler/test/integration/compile-release.test.ts`

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement closed ReleaseManifestV1 validation, canonical ordering, and entry-role checks in `packages/protocol/src/release/manifest.ts`
- [ ] T019 [P] [US1] Implement the strict stored-entry ZIP writer with fixed headers, ordinal entries, CRCs, and no optional metadata in `packages/protocol/src/release/zip-profile.ts`
- [ ] T020 [US1] Implement bounded container parsing and non-executing artifact inspection sufficient for compiler self-verification in `packages/protocol/src/release/inspect.ts`
- [ ] T021 [P] [US1] Implement strict `plotpoint.project.json` loading, duplicate-key/unknown-field rejection, and canonical registries in `packages/compiler/src/project/load-project.ts`
- [ ] T022 [P] [US1] Capture immutable config/source/data/asset bytes with pre/post stat checks and compiler-owned reads in `packages/compiler/src/project/snapshot.ts`
- [ ] T023 [P] [US1] Parse TypeScript/TSX ESM syntax and collect static, dynamic, CommonJS, URL, and ambient-authority references in `packages/compiler/src/imports/analyze-source.ts`
- [ ] T024 [US1] Resolve logic and presentation graphs from snapshot bytes with fixed package conditions and no external output in `packages/compiler/src/imports/resolve-graph.ts` and `packages/compiler/src/imports/environment-policy.ts`
- [ ] T025 [P] [US1] Build ordinal immutable command, schema, progression, component, content, and asset registries and validate happy-path references in `packages/compiler/src/composition/registries.ts` and `packages/compiler/src/composition/validate-references.ts`
- [ ] T026 [P] [US1] Validate and canonicalize JSON Schema 2020-12 documents, content JSON, and raw asset entries for the valid project path in `packages/compiler/src/validation/schemas.ts`, `packages/compiler/src/validation/content.ts`, and `packages/compiler/src/validation/assets.ts`
- [ ] T027 [US1] Generate and run the bounded local definition-inspection subprocess without invoking handlers or predicates in `packages/compiler/src/composition/generated-entries.ts` and `packages/compiler/src/composition/inspect-definitions.ts`
- [ ] T028 [US1] Generate fixed virtual logic/presentation roots, load only snapshot bytes through compiler-owned Rolldown `resolveId`/`load` hooks, call pinned `rolldown()` plus `bundle.generate()`, reject unexpected outputs, and close in `finally` in `packages/compiler/src/bundle/rolldown-plugin.ts` and `packages/compiler/src/bundle/bundle-release.ts`
- [ ] T029 [US1] Construct release entries and canonical manifest, assemble and self-inspect the artifact, and atomically publish without overwriting unrelated output in `packages/compiler/src/release/assemble.ts` and `packages/compiler/src/release/atomic-output.ts`
- [ ] T030 [US1] Implement `validateProject` and `compileProject` phase orchestration and discriminated results in `packages/compiler/src/index.ts`
- [ ] T031 [US1] Implement `plotpoint validate` and `plotpoint compile` JSON/human output and exit-code behavior in `packages/compiler/src/cli.ts`
- [ ] T032 [US1] Complete public protocol exports and compiler self-verification wiring in `packages/protocol/src/index.ts`, `packages/compiler/src/index.ts`, and `packages/compiler/package.json`
- [ ] T033 [US1] Run the User Story 1 unit, contract, type, and external acceptance suite and retain expected manifest/identity fixtures in `packages/compiler/test/fixtures/expected/minimal-local-puzzle/`

**Checkpoint**: User Story 1 independently emits byte-identical, source-independent complete releases and is the MVP.

---

## Phase 4: User Story 2 - Reject Invalid Projects Before Publication (Priority: P2)

**Goal**: Reject every required invalid configuration, import, registration, schema, progression, component, content, asset, compatibility, and interruption case with stable actionable diagnostics and no success-shaped output.

**Independent Test**: Run one isolated fixture for every compiler diagnostic category and every boundary edge case; each returns the expected first structured location, retains independently discoverable peer diagnostics, and leaves no completed release.

### Tests for User Story 2

- [ ] T034 [P] [US2] Add malformed config, duplicate identity, path escape, symlink, case alias, missing file, and input-mutation fixtures in `packages/compiler/test/fixtures/projects/invalid/configuration/` and tests in `packages/compiler/test/unit/project-errors.test.ts`
- [ ] T035 [P] [US2] Add logic/presentation forbidden import, ambient global, dynamic import, unresolved external, native addon, and graph-policy fixtures in `packages/compiler/test/fixtures/projects/invalid/import-boundary/` and tests in `packages/compiler/test/unit/import-policy.test.ts`
- [ ] T036 [P] [US2] Add command, aggregate/general schema, progression, definition-drift, subprocess-timeout, and invalid-output fixtures in `packages/compiler/test/fixtures/projects/invalid/definitions/` and tests in `packages/compiler/test/unit/definition-errors.test.ts`
- [ ] T037 [P] [US2] Add component, content, asset, capability, compatibility, duplicate destination, and reference-cycle fixtures in `packages/compiler/test/fixtures/projects/invalid/material/` and tests in `packages/compiler/test/unit/material-errors.test.ts`
- [ ] T038 [US2] Add phase-failure, interruption, collision, cleanup, diagnostic ordering, and no-final-artifact integration tests in `packages/compiler/test/integration/invalid-projects.test.ts` and `packages/compiler/test/integration/atomic-output.test.ts`

### Implementation for User Story 2

- [ ] T039 [P] [US2] Complete exact configuration shape, version, identity, path, duplicate, and mutation diagnostics in `packages/compiler/src/project/load-project.ts`, `packages/compiler/src/project/path-policy.ts`, and `packages/compiler/src/project/snapshot.ts`
- [ ] T040 [P] [US2] Enforce full logic/presentation AST and resolver policies with fixed diagnostic locations in `packages/compiler/src/imports/analyze-source.ts`, `packages/compiler/src/imports/environment-policy.ts`, and `packages/compiler/src/imports/resolve-graph.ts`
- [ ] T041 [P] [US2] Validate command metadata, aggregate kind/schema agreement, definition uniqueness, and payload/outcome schema links in `packages/compiler/src/validation/commands.ts`
- [ ] T042 [P] [US2] Validate the closed durable schema subset and normalize all Ajv failures in `packages/compiler/src/validation/schemas.ts`
- [ ] T043 [P] [US2] Validate progression identity, version, kind, nodes, command/content/component references, and declarative cycles in `packages/compiler/src/validation/progression.ts`
- [ ] T044 [P] [US2] Validate component exports/links, canonical content, non-empty assets, capability union/conflicts, and compatibility requirements in `packages/compiler/src/validation/components.ts`, `packages/compiler/src/validation/content.ts`, `packages/compiler/src/validation/assets.ts`, and `packages/compiler/src/validation/capabilities.ts`
- [ ] T045 [US2] Enforce phase-aware diagnostic collection, dependent-phase suppression, canonical ordering, and author-error result mapping in `packages/compiler/src/diagnostics/order.ts` and `packages/compiler/src/index.ts`
- [ ] T046 [US2] Harden definition subprocess timeout/output limits and atomic failure injection, collision verification, and temporary cleanup in `packages/compiler/src/composition/inspect-definitions.ts` and `packages/compiler/src/release/atomic-output.ts`
- [ ] T047 [US2] Run the complete invalid-fixture matrix through programmatic and CLI surfaces and record category/first-location expectations in `packages/compiler/test/fixtures/expected/invalid-diagnostics.json`

**Checkpoint**: Every invalid project class fails before release eligibility with actionable stable diagnostics and no completed artifact.

---

## Phase 5: User Story 3 - Inspect Compatibility and Capability Requirements (Priority: P3)

**Goal**: Inspect a release without game execution and independently assess release-format, host-API, aggregate-schema, capability, inventory, and operational-metadata boundaries.

**Independent Test**: Inspect golden artifacts as raw bytes after source removal, assess each supported and unsupported compatibility surface, and prove registry-only metadata changes zero artifact bytes and identities.

### Tests for User Story 3

- [ ] T048 [P] [US3] Add non-executing inspection, closed manifest, inventory-role, and compatibility matrix tests in `packages/protocol/test/inspection.test.ts` and `packages/protocol/test/compatibility.test.ts`
- [ ] T049 [P] [US3] Create branching media tour and team/session hunt golden projects with multiple schemas, content, components, assets, and capability requirements in `examples/releases/branching-media-tour/` and `examples/releases/team-session-hunt/`
- [ ] T050 [US3] Add source-free three-project inspection and registry-label/channel/project/timestamp invariance tests in `packages/compiler/test/integration/inspect-release.test.ts`

### Implementation for User Story 3

- [ ] T051 [P] [US3] Implement exact release-format, host-API, aggregate-schema, and capability assessment with per-surface mismatch results in `packages/protocol/src/release/compatibility.ts`
- [ ] T052 [US3] Complete bounded `inspectRelease` manifest/inventory parsing, computed identity, and non-execution guarantees in `packages/protocol/src/release/inspect.ts`
- [ ] T053 [P] [US3] Emit ordinal aggregate schema declarations, derived capability requirements, and fixed logic/presentation entry roles in `packages/compiler/src/release/assemble.ts`
- [ ] T054 [US3] Implement `plotpoint inspect` and compatibility JSON/human rendering without loading or extracting game entries in `packages/compiler/src/cli.ts`
- [ ] T055 [US3] Export inspection and compatibility operations from `packages/protocol/src/index.ts` and verify downstream code imports no compiler internals in `packages/protocol/test/public-api.test.ts`
- [ ] T056 [US3] Run all three golden projects through compile, source removal, inspection, compatibility, and operational-metadata invariance acceptance in `packages/compiler/test/integration/inspect-release.test.ts`

**Checkpoint**: Operators and future players can decide compatibility and inventory from artifact bytes alone without executing game code.

---

## Phase 6: User Story 4 - Detect Release Tampering (Priority: P4)

**Goal**: Detect structural, manifest, inventory, payload, and known-identity changes before trust while distinguishing internal consistency from publisher authenticity.

**Independent Test**: Mutate the container, manifest, every entry kind, and coordinated payload-plus-manifest pairs; all known-release mutations fail against the original expected ID and identify the affected path or relationship.

### Tests for User Story 4

- [ ] T057 [P] [US4] Add duplicate, reordered, missing, extra, truncated, overlapping, trailing, unsupported-field, forbidden-path, CRC, and manifest-canonicality mutations in `packages/protocol/test/format-mutations.test.ts`
- [ ] T058 [P] [US4] Add one-byte mutations for logic, presentation, schema, progression, component, content, and asset entries in `packages/protocol/test/entry-tampering.test.ts`
- [ ] T059 [US4] Add coordinated manifest-plus-payload rewrite, expected-ID mismatch, and no-expected-ID trust-label tests in `packages/protocol/test/identity-trust.test.ts`

### Implementation for User Story 4

- [ ] T060 [US4] Harden strict local/central header agreement, ordinal ordering, bounds, exact entry set, and trailing-byte rejection in `packages/protocol/src/release/zip-profile.ts`
- [ ] T061 [US4] Implement full `verifyRelease` entry length/CRC/SHA checks, whole-artifact identity, and stable path/relationship diagnostics in `packages/protocol/src/release/verify.ts`
- [ ] T062 [US4] Encode explicit `structurally-valid` versus `known-release-match` results and require expected identity for tamper claims in `packages/protocol/src/release/types.ts` and `packages/protocol/src/release/verify.ts`
- [ ] T063 [US4] Implement `plotpoint verify [--expect]` result rendering and exit codes without authenticity overclaiming in `packages/compiler/src/cli.ts`
- [ ] T064 [US4] Export verification from `packages/protocol/src/index.ts` and run the complete mutation matrix against each golden artifact in `packages/compiler/test/integration/verify-release.test.ts`

**Checkpoint**: Every mutation claiming the original release identity is rejected before execution, with honest trust semantics and precise diagnostics.

---

## Phase 7: Polish & Cross-Cutting Evidence

**Purpose**: Prove public consumption, bounded behavior, documentation accuracy, and the complete Gate 2 exit evidence.

- [ ] T065 [P] Add external-consumer harness utilities that copy projects outside workspace resolution and use only built package roots in `packages/compiler/test/helpers/external-project.ts`
- [ ] T066 [P] Add type-facing rejection fixtures for manifest/result discriminants, registration kinds, compatibility shapes, and deep imports in `packages/protocol/test/contracts.type-test.ts` and `packages/compiler/test/contracts.type-test.ts`
- [ ] T067 [P] Add archive-size/count/path limits, generated malformed-container cases, deterministic diagnostic ordering properties, and replayable seeds in `packages/protocol/test/bounds.property.test.ts` and `packages/compiler/test/diagnostics.property.test.ts`
- [ ] T068 Run 20 builds for each of the three golden projects across varied cwd/output/temp/clock contexts and retain byte/identity evidence in `packages/compiler/test/integration/reproducibility.test.ts`
- [ ] T069 Validate every command and expected outcome in `docs/features/0002-immutable-release-pipeline/quickstart.md` against built public packages and update only discrepancies in that file
- [ ] T070 Add compiler/protocol test, type-check, and build tasks to workspace verification, assert the exact Rolldown pin, and ensure artifacts remain source-independent in `package.json`, `turbo.json`, `packages/compiler/package.json`, and `packages/protocol/package.json`
- [ ] T071 Run formatting, lint, all type checks/builds/tests, Spec Kit tests/sync/check, and `pnpm verify`; record exact Gate 2 evidence and any infrastructure-only limitations in `docs/features/0002-immutable-release-pipeline/checklists/implementation.md`

---

## Dependencies & Execution Order

### Governance Gate

- ADR 0002 is Accepted; T001 and subsequent implementation tasks may proceed under its decisions.
- Any incompatible format, identity, trust, or compiler-boundary change requires a superseding ADR.

### Phase Dependencies

- **Phase 1 - Setup**: Can start immediately under accepted ADR 0002.
- **Phase 2 - Foundations**: Depends on T001-T004 and blocks all user stories.
- **Phase 3 - US1**: Depends on T005-T013 and delivers the MVP compiler/artifact path.
- **Phase 4 - US2**: Depends on the relevant project/phase orchestration from T021-T030; its fixtures and tests T034-T038 can be prepared after foundations.
- **Phase 5 - US3**: Depends on manifest/container foundations T005-T008 and T018-T020; golden project authoring T049 can begin after foundations.
- **Phase 6 - US4**: Depends on the container/inspection path T018-T020 and identity primitives T008; mutation tests T057-T059 can be authored before US3 finishes.
- **Phase 7 - Polish**: Depends on all selected stories; T065-T067 can begin after public roots stabilize, while T068-T071 require all stories.

### User Story Completion Order

```text
Setup -> Foundations -> US1 (MVP)
                         |-> US2 invalid-project boundary
                         |-> US3 non-executing inspection
                                  |-> US4 known-identity tamper verification
US1 + US2 + US3 + US4 -> Cross-cutting Gate 2 evidence
```

- **US1** has no story dependency after foundations and is independently demonstrable.
- **US2** consumes the US1 validation pipeline but is independently accepted through invalid fixtures and absence of output.
- **US3** consumes the v1 manifest/container but is independently accepted from prebuilt golden bytes without compiler execution.
- **US4** consumes strict parsing and identity primitives but is independently accepted from mutated prebuilt golden bytes.

### Within Each Story

- Write the listed tests first and confirm they fail for the intended missing behavior.
- Implement low-level data/validation before orchestration and CLI exposure.
- Use only package-root exports in integration and external-consumer tests.
- Complete the story checkpoint before claiming its acceptance evidence.

## Parallel Execution Examples

### User Story 1

```text
Parallel test preparation: T014 manifest/container contracts, T015 project/snapshot tests, T016 external puzzle fixture
Parallel implementation after foundations: T018 manifest validation, T019 ZIP writer, T021 config loader, T022 snapshot, T023 source analysis
Converge: T024-T032, then run T033
```

### User Story 2

```text
Parallel fixture lanes: T034 configuration/path, T035 imports, T036 definitions/schemas/progression, T037 material/capabilities
Parallel validators: T039 project rules, T040 import policy, T041 commands, T042 schemas, T043 progression, T044 material
Converge: T045-T047
```

### User Story 3

```text
Parallel preparation: T048 protocol tests and T049 two golden projects
Parallel implementation: T051 compatibility and T053 manifest emission
Converge: T052, T054-T056
```

### User Story 4

```text
Parallel mutation suites: T057 container/manifest and T058 entry payloads
Converge trust cases in T059, then implement T060-T064
```

## Implementation Strategy

### MVP First

1. Apply accepted ADR 0002 as the implementation boundary.
2. Complete Setup and Foundations.
3. Complete User Story 1 through T033.
4. Stop and prove one complete byte-deterministic, source-independent release before expanding validation breadth.

### Incremental Delivery

1. **US1**: Valid projects become complete immutable releases.
2. **US2**: Invalid projects fail early and atomically with actionable diagnostics.
3. **US3**: Downstream consumers inspect compatibility and inventory without execution.
4. **US4**: Known release bytes resist structural and content tampering.
5. **Polish**: Three external projects and the full mutation/reproducibility matrix close Gate 2.

### Scope Discipline

- Do not add registry persistence, publication authorization, player installation, signing, compression, ZIP64, code splitting, source maps, author bundler plugins, module marketplace semantics, active-session migration, or hosted untrusted builds.
- Do not execute handlers or progression predicates during compilation.
- Do not place labels, channels, project identity, timestamps, source paths, output paths, or telemetry in artifact bytes.
- Do not mark the feature implemented before T071 records complete evidence.
