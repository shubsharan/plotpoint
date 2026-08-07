# Implementation Plan: Unified Game Composition

**Branch**: `feature/0005-unified-game-composition` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0005-unified-game-composition/spec.md`

## Summary

**Remediation update (2026-08-06)**: Feature 0005 is reopened in place. Historical tasks T001-T077
remain checked as implementation history, but their Phase 8 completion claim is superseded. T078 and
later replace four fragmented boundaries with one generated Web runtime kernel, one run-scoped shared
controller, one authoritative mechanic execution port, and one committed evidence ledger. No new ADR
is required: accepted ADRs 0001, 0004, 0005, and 0006 already govern these changes.

**Root-cause update (2026-08-06)**: Phase 15 reopens the post-review result without changing public
release, Host API, shared-wire, or Game Play Report shapes. It removes duplicated semantic validation,
global runtime dependency state, decomposed shared-result identity, stringly evidence translation, and
duplicated ledger schema ownership. ADR-0006 already requires these durable contracts to evolve centrally.

**Cohesion-closure update (2026-08-06)**: Phase 16 preserves reserve-first SQLite join ownership,
centralizes cross-store restart reconciliation, proves the co-op action through the mounted production
runtime, and makes ledger elapsed time nondecreasing without a schema or public-contract change.

**Response-loss closure update (2026-08-06)**: Phase 17 preserves exact consumed join replay after
invitation expiry and makes failed or timed-out local bridge attempts explicitly retryable under their
existing immutable command identity. It adds no schema, protocol, migration, or background retry loop.

Make the field puzzle and co-op game runnable through one compiler-owned composition path, preserve all
four valid compiler examples through the clean break, and close a two-release co-op learning loop. Correct
Project Configuration, Game Composition, Host API, and Game Play Report in place; use plain stable
names for interfaces, schemas, logical IDs, catalog paths, and contract files; and preserve Release
Format, Host API 1.1 Shared Play, and Sync wire semantics. Add an explicit closed
trusted-mechanic binding for target discovery, repair the player outbox/snapshot/join state machine,
remove game-specific player routing, and prove both games from validation through durable action,
recovery, report-driven configuration revision, and a fresh release/session. The co-op reference keeps
only its product-proven target-discovery behavior; unused round/clue commands and server progressions are
removed rather than generalized. Boundary-owned project/release, Host API/capability, and `/v1`
compatibility markers remain, while the universal contract-version catalog and unsupported body/report/
schema counters are removed. Because the app is pre-release, no compatibility reader, alias, or migration
is part of the work.

## Technical Context

**Language/Version**: TypeScript 7.0.2 with strict ESM and ES2022 output; Node.js 25 or newer; React
Native 0.86.2 through Expo SDK 57 for the native player
**Primary Dependencies**: Existing dependency-free `@plotpoint/runtime`; `@plotpoint/protocol`;
Rolldown 1.2 and AJV 8 in the compiler; React 19, Expo SQLite/SecureStore/Location, and
`react-native-webview`; Node HTTP, `pg`, and the existing `@plotpoint/modules` boundary
**Storage**: Existing Release Format `.pprelease` bytes; host-owned SQLite plus SecureStore on the
player; PostgreSQL 17 in provider-free authoritative integration tests and the current modular service
**Testing**: Vitest 4.1 named projects, type-facing fixtures, deterministic replay/model tests,
compiler contract/integration fixtures, player SQLite interruption tests, WebView bootstrap tests,
API/Testcontainers PostgreSQL tests, and external-consumer-style two-release acceptance
**Target Platform**: Portable ES2022 release logic and trusted single-WebView presentation; Expo iOS
and Android native host; Node modular-monolith HTTPS API
**Project Type**: Monorepo cross-cutting compiler, runtime, protocol, mobile-player, API, module, and
reference-game integration feature
**Performance Goals**: Every foreground sync pass is finite—each start-eligible command at most once
plus at most one pull; deterministic runtime retains bounded progression; compiler output remains
ordinal and reproducible. No speculative throughput target is added.
**Constraints**: Data-only composition; immutable release identity; no release-authored server code;
one local player aggregate and existing team/session authority kinds; exact idempotency; atomic local
recovery; no raw credentials, precise locations, protected content, or raw state in reports/logs;
provider-free evidence remains distinct from simulator/emulator and physical-device acceptance
**Scale/Scope**: Four valid compiler examples, two installed-player acceptance games, one trusted
target-discovery mechanic, one local player shell and one server team model in the co-op game, one team
per cooperative session, three participants, complete authorized snapshots, one foreground coordinator
per player process, and no active-run/session release migration

## Constitution Check

_GATE: Evaluated before Phase 0 research and again after Phase 1 design._

### Pre-Research Gate

**REVIEW FAILURE - AWAITING REMEDIATION.** The original assessment below records planning intent, not
the current implementation state. Post-implementation review found that the installed product loop,
single-runtime boundary, automatic shared recovery, and report truthfulness were not established.
Only the final T102 post-design checkpoint may restore this gate to `PASS` after fresh evidence exists.

- **PASS - Complete product loop**: The feature is anchored to an integrated field-puzzle journey and a
  two-release co-op validate/compile/install/mount/complete/recover/report/revise journey, not isolated
  framework APIs.
- **PASS - Small durable contracts**: Interfaces, schemas, and logical IDs use plain stable names;
  project/release format, Host API/capability metadata, state versions, and the `/v1` HTTP route remain
  the centralized compatibility or concurrency boundaries already responsible for them. Each
  compatibility marker stays with its owner; there is no universal contract-version catalog.
- **PASS - Honest trust**: Compiler reference validation, one trusted WebView, allowlisted platform
  mechanics, authenticated HTTPS, and physical-device evidence remain distinct claims.
- **PASS - Evidence before abstraction**: Existing packages, one player, and one modular API remain.
  Aggregate models and a closed mechanic port are pulled by concrete duplicated/hard-coded behavior;
  plugin loaders, DI containers, services, and generalized workflows are excluded.
- **PASS - Local-first recovery/privacy**: Durable enqueue precedes acknowledgement; commit and snapshot
  replacement are atomic; retries preserve evidence; existing redaction boundaries remain.
- **PASS - Accepted architecture authority**: At the project owner's explicit direction, accepted ADR
  0001 is updated in place with the integrated runtime/composition decision and authorizes subsequent
  task generation.

### Post-Design Gate

**PASS - PHASE 17 RESPONSE-LOSS CLOSURE (2026-08-06).** Reserve-first startup recovery,
component-driven co-op acceptance, bounded device-clock chronology, exact consumed join replay,
caller-driven local bridge retry, provider-free verification, and fresh simulator/emulator evidence
close T135 without expanding the public contracts or storage schema.

- **PASS - One composition authority**: Project Configuration lowers to generated registries and
  Game Composition; no executable DSL or duplicate author runtime registry remains.
- **PASS - Functional core, imperative shells**: The plain runtime model owns deterministic decisions and
  progression; player/API adapters own persistence, transport, authorization, and capabilities.
- **PASS - Minimal composability**: Aggregate model, scoped component context, trusted-mechanic port,
  and keyed single-flight are the smallest patterns that cover both games and observed failures.
- **PASS - Clean pre-release break**: Existing contracts are corrected in place, obsolete private
  shapes are rejected, reference artifacts are recompiled, and no compatibility parser, data migration,
  or active-session migration is promised.
- **PASS - Failure atomicity**: Binding validation precedes view mutation; result reconciliation is
  compare-or-insert; one transaction owns snapshot/result/outbox/cursor/member status.
- **PASS - Verification proportionality**: Fresh parity, concurrency, cleanup, exact replay, interruption,
  clock-skew, failure-evidence, installed-journey, four-release, repository, simulator, and emulator gates
  cover the Phase 15 adversarial matrix; physical devices remain explicitly `NOT RUN`.
- **PASS - Governance**: The design introduces no constitution exception. Accepted ADR 0001 governs
  its implementation boundaries and accepted ADR 0006 governs centralized contract evolution.

## Architecture Decisions

**Impact**: Major

- [Integrated Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) -
  **Accepted**; updated in place at the project owner's direction and governs canonical execution,
  the plain runtime model, generated composition, scoped components, the optional trusted mechanic, finite
  synchronization, release-pinned binding, and generic reporting.
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) - **Accepted**; Release Format
  inventory, integrity, identity, and compatibility remain unchanged while Game Composition is
  ordinary inventoried application content.
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md) - **Accepted**; the
  generated application/component contexts improve composition without claiming component isolation.
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) - **Accepted**;
  Local Transition and shared reconciliation remain host-owned atomic commits.
- [Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md) -
  **Accepted**; release-pinned authority, adapter-owned domain conflict policy, complete authorized
  snapshots, and generic retry, revocation, and privacy boundaries remain.
- [Centralized Contract Evolution](../../adrs/0006-centralized-contract-evolution.md) - **Accepted**;
  requires plain interface and schema names, removes independent schema generations, and reserves
  future incompatible evolution for one centralized compatibility mechanism.

## Project Structure

### Documentation (this feature)

```text
docs/features/0005-unified-game-composition/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── game-composition.md
│   ├── game-play-report.md
│   ├── host-application.md
│   ├── runtime-model.md
│   ├── shared-recovery.md
│   ├── shared-session-api.md
│   └── trusted-mechanic.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Dependency-ordered implementation and evidence tasks
```

### Source Code (repository root)

```text
packages/runtime/
├── src/
│   ├── aggregate-model.ts           # Resolved-model and explicit decision contract
│   ├── execute-command.ts           # Model-owned execution and state-version semantics
│   ├── execution-record.ts
│   └── progression/                 # Named transitions, initial instance, bounded evaluator
└── test/                            # Unit, type, replay, event/effect, heterogeneous progression

packages/testkit/
├── src/                             # Model fixtures, replay, strict scenario assertions
└── test/

packages/compiler/
├── src/
│   ├── project/                     # Corrected strict Project Configuration
│   ├── composition/                 # Reference validation, definition inspection, catalog generation
│   ├── bundle/                      # Generated local logic and presentation roots
│   ├── validation/                  # Application/model/component/mechanic/resource agreement
│   ├── inspection/                  # Composition-aware public inspection over verified releases
│   └── release/                     # Composition descriptors in unchanged Release Format
└── test/                            # Contract, mutation, reproducibility, mount-shape fixtures

packages/protocol/
├── src/
│   ├── player/                      # Game application/client types, Bootstrap/Transition
│   │   └── report.ts                # Sole generic Game Play Report and capability evidence contract
│   ├── release/                     # Open/verify plus Game Composition validation
│   └── shared/                      # Shared Play/Sync only; no game-specific report contract
└── test/

packages/modules/
├── src/
│   ├── trusted-mechanics.ts         # Closed registry/port
│   └── mechanics/                   # Target-discovery adapter
└── test/

packages/db/
├── src/                             # Existing PostgreSQL schema/transactions/repositories
└── test/

apps/api/
├── src/
│   ├── server.ts                    # Generic shared-sessions transport
│   ├── shared-session-service.ts    # Release/mechanic/model authority
│   └── operator-client.ts
└── test/                            # Contract, Postgres, auth, idempotency, redaction

apps/player/
├── App.tsx                          # Composition-driven local/shared shell, stable coordinator owner
├── src/
│   ├── runtime/                     # Catalog loading, generated application mount, adapters
│   ├── persistence/                 # Aggregate/progression/event/effect Local Transition commit
│   ├── bridge/                      # Host API and correlated errors
│   └── shared/                      # Immutable join, finite batch, single-flight, reconciliation
└── test/                            # Bootstrap, SQLite, interruption, join, bridge, offline routes

examples/releases/field-puzzle/
├── plotpoint.project.json           # Corrected local composition
├── src/                             # Initializer, command, progression, component, application
└── test/                            # External-consumer lifecycle

examples/releases/co-op-game/
├── plotpoint.project.json           # Corrected shared composition + trusted mechanic
├── src/                             # Application/components; target discovery only; no server source
└── test/                            # Type-facing complete and report-driven two-release lifecycle
```

**Structure Decision**: Change no package or deployment boundary. `@plotpoint/runtime` owns the pure
resolved-model/executor contract; the compiler owns authored-to-generated local composition; protocol
owns cross-process and persisted shapes; player and API are imperative adapters; `@plotpoint/modules` owns
the closed trusted-mechanic registry plus complete platform server models and validators. Migrate
`co-op-game` into the normal workspace test/type surface rather than treating it only as a compiler
fixture. Remove superseded game-named player transport and author duplicate registries instead
of retaining compatibility shims. The old project, composition, report, and player-database shapes are
rejected; `field-puzzle`, `minimal-local-puzzle`, `branching-media-tour`, and `co-op-game` are migrated
and recreated from source, while discarded configurations remain only as explicit invalid fixtures.

## Implementation Design

### Remediation Boundaries

1. **One executable Web runtime**: environment-neutral kernel source owns composition mounting, child
   component scopes, local adaptation, bridge clients, notifications, and disposal. The build emits one
   generated TypeScript source module consumed by the thin production bootstrap, and verification checks
   freshness. Vertical tests execute that production bundle through WebView-style transport.
2. **One run-scoped shared controller**: a controller constructed from a verified installed run owns
   `start`, `join`, `enqueue`, `foreground`, `connectivityChanged`, `retry`, `snapshot`, `subscribe`, and
   `dispose`, plus the complete observable state. Its join coordinator reserves SQLite ownership before
   writing the deterministic envelope and reconciles every pending/bound restart shape. Startup and
   reachability transitions drive keyed single-flight.
3. **One authoritative execution operation**: the trusted adapter receives participant, current
   aggregate, public command, and observations; it validates authority, owns stale/no-op policy, invokes
   the pinned deterministic model, and returns the participant-visible terminal. Service code owns only
   locks, transactions, persistence, and response construction. Server models with effects are rejected.
4. **One committed evidence ledger**: each responsible local/shared transaction appends validated generic
   evidence and clamps elapsed time to the prior per-run high-water. The report is a deterministic
   privacy-filtered projection and never reconstructs semantics from versions, configuration, clocks, or
   unrelated tables.

The clean break removes aggregate schema-generation counters everywhere. Agreement is the tuple of
pinned release identity, logical schema ID, and exact inventoried bytes/digest. SQLite compatibility is
an exact digest over canonical `sqlite_master` table/index/trigger definitions; mismatches require reset
or reinstall and have no migration path.

### 1. Contract-First Runtime and Composition

After verifying the existing co-op rename, write failing vertical fixtures for both installed-player
games, the four-example compiler matrix, the complete target-discovery journey, and its report-driven
second release before settling shared contracts. Then write failing type/behavior fixtures for explicit no-op,
event/effect-only acceptance, canonical model
initialization, local preflight versus recorded execution invalidity, heterogeneous-command progression,
payload/state schema-narrowing wrappers, duplicate command type within one model, generated
catalog/registry agreement, malformed application lifecycle, mount-scope rollback and cleanup, scoped
components including throw/invalid-element cleanup, executable schema validators, unchanged Release
Format, composition-aware public inspection output, plain unsuffixed public names, and stable
`initializer-threw` containment without partial persistence. Evolve the runtime and progression APIs in
place; correct Project Configuration; remove the universal contract-version catalog in favor of
boundary-owned project/release and Host API constants; and implement definition inspection, the resource
catalog, generated local roots, and `plotpoint inspect` catalog reporting. Commands and progressions
own their aggregate-model references; models do not repeat those relationships. The trusted-mechanic
binding alone selects its model and commands. Catalog descriptors omit per-item export names, Host API,
and release-wide capabilities that have another authority.

### 2. Host Application and Local Persistence

Correct Host API Bootstrap/Transition in place and add the compiler-generated local model adapter
without changing the existing message names or introducing a new Host API minor. Extend the player
snapshot/journal/receipt transaction to store progression, typed events/effects, and accepted state-version
semantics without effect delivery. Update the player model, database validation, transition commit, and
recovery reader together so exact model/schema identity, progression, events/effects, complete records,
and state versions survive recreation for state-, progression-, event-, effect-only, and no-op results.
Mount only the generated application, expose scoped component
contexts, require cleanup before shared-session remount or disposal, preserve correlated errors, and
derive local/shared shell state from verified composition. Replace game-selected report builders with
one host-owned Game Play Report path keyed only by run and optional shared binding. Bootstrap state
terminates at the generated runtime adapter; the application receives only its root and component
factories, and state reads/subscriptions exist only in scoped component contexts.

### 3. Trusted Mechanic and Generic Shared Service

Add the closed platform registry and move target discovery into its first adapter. Release
registration consumes Game Composition's data-only server contracts and safe configuration rather
than executable release source or hard-coded logical paths. The adapter owns the complete resolved
server model and digest-bound validators, must match those contracts, and supplies no undeclared server
progression. Give every adapter call a closed result: validation returns canonical configuration plus
initializer input or a diagnostic; authorization returns a runtime command with transformed observations
or a rejected/invalid terminal; projection returns a complete validated `SharedProjection` or a
diagnostic. Preserve Sync state-version fields directly. Trusted outcomes use an exact stable-code
shape so their Sync mapping loses no semantic fields. Rename public participant routing to
`/v1/shared-sessions`, dispatch declared commands through that platform model, and preserve ADR 0005
transaction, projection, authorization, and privacy semantics.

The co-op reference owns one local/player shell and selects one server/team target-discovery model. Remove
its unused `advance-round`, `solve-clue`, session progression, and team progression sources. Do not add a
second mechanic, server model, or server progression to preserve compiler-only examples.

### 4. Durable Shared Recovery

Implement finite atomic batch claiming, a stable per-app keyed single-flight coordinator, pure view
reads, honest durable sync status, compare-or-insert terminal reconciliation, duplicate collection
rejection, durable pending-join provenance before network submission, immutable SQLite binding guards,
one pending-or-bound session per run, release equality on join/pull, atomic local revocation, and
request-ID preservation. The coordinator exposes one per-session drain promise that includes the active
or trailing pass covering each trigger. Immutable binding guards include the envelope key, and
membership transitions only from active to revoked; stale active retries and snapshots fail without
reactivation. Test parallel joins plus every join/claim/submit/pull/commit interruption and
corrective repeat, 100 queued-action response-loss retries with one immutable terminal each, and 100
repeated local preflight-invalid attempts with no durable mutation. Cover both authenticated revocation
errors and revoked snapshots with the same atomic blocked-outbox result.

### 5. Runnable Reference Games and Evidence

Update all four valid examples to corrected Project Configuration . Remove duplicate default registries
and protocol adapters; add the co-op application mount and declared target-discovery mechanic; and keep
only behavior executable under the selected authority model. Put both installed-player examples in
normal type-checking. Prove the field compile/install/mount/action/restart/report journey and the co-op
three-participant complete-target/recovery/revocation/report/revise/fresh-release journey, followed by
fresh iOS simulator and Android emulator build-install-launch evidence. Preserve privacy, authorization,
artifact identity, and reproducibility gates across the four-example matrix.

## Phase 0: Research

Research is complete in [research.md](research.md). It resolves composition/centralized compatibility, the four-example
clean break, the minimal runnable co-op boundary, application and
component lifecycle, aggregate decision/state-version semantics and validators, progression facts, the
single optional trusted mechanic, generic session transport, finite synchronization, corrective
reconciliation, durable release-pinned join, atomic revocation, bridge correlation, and the generic
Game Play Report export, plain public naming, and the clean rejection of obsolete shapes. There are no
`NEEDS CLARIFICATION` items.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines authored/compiled composition, local and server model
  ownership, aggregate/progression, components, trusted mechanics, pending joins, immutable sessions,
  shared actions, snapshots, and state transitions.
- [game-composition.md](contracts/game-composition.md) defines corrected Project Configuration,
  generated registries, resource catalog, lifecycle validation, and composition-aware public
  inspection layered over Release Format.
- [game-play-report.md](contracts/game-play-report.md) defines one privacy-safe local/shared
  evidence export with no game-specific player selection.
- [runtime-model.md](contracts/runtime-model.md) defines model-owned command execution, explicit
  decisions, initializer exception containment, state-version behavior, progression nodes/transitions,
  and replay using plain TypeScript APIs.
- [host-application.md](contracts/host-application.md) defines Host API bootstrap, generated
  adapters, scoped component context, Local Transition, and composition-driven shared UI.
- [trusted-mechanic.md](contracts/trusted-mechanic.md) defines the allowlisted platform adapter
  boundary and target discovery.
- [shared-session-api.md](contracts/shared-session-api.md) defines generic release-pinned `/v1` routes,
  join, and mechanic dispatch.
- [shared-recovery.md](contracts/shared-recovery.md) defines finite batches, keyed single-flight,
  per-trigger drain promises, durable pending join, atomic terminal revocation, envelope-key-inclusive
  immutable binding, idempotent snapshots, clean database rejection, and correlated bridge errors.
- [quickstart.md](quickstart.md) exercises both games as an external author/operator/player would.
- The Spec Kit block in `AGENTS.md` points to this plan.

## Phase 2: Implementation Planning

Accepted ADR 0001 satisfies the architecture gate and dependency-ordered `tasks.md` is present. Execution
starts by verifying the already-renamed co-op baseline and writing failing vertical acceptance fixtures,
then establishes runtime/composition contracts, migrates all four valid examples, closes the field
lifecycle and co-op first-action checkpoint, repairs shared recovery and release pinning, and finally
closes the full two-release learning loop plus provider-free and native simulation evidence. Existing
files are extended or replaced in place; no task asks to recreate a rename already present at the
reconciled baseline.

## Complexity Tracking

No constitution violation. The plan adds no package, service, worker, plugin loader, DI container,
event store, effect dispatcher, background sync process, delta protocol, or active-session migration.
No new schema generation is introduced. Incompatible pre-release shapes are replaced in place and
rejected at their boundary rather than supported by compatibility code. Per-interface and per-schema
generation suffixes and the speculative universal contract-version catalog are removed; allowed
compatibility markers remain boundary-owned, and future evolution is intentionally deferred to an
Accepted centralized compatibility policy rather than distributed naming conventions.
