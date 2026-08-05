# Implementation Plan: Game Runtime Integration

**Branch**: `feature/0005-game-runtime-integration` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0005-game-runtime-integration/spec.md`

## Summary

Make the field puzzle and cooperative hunt runnable through one compiler-owned composition path. Replace
the private pre-release project/runtime contracts with Project Configuration V2, Game Composition V1,
Runtime Model V2, and Host API 1.2 while keeping Release Format V1, Host API 1.1 Shared Play, and Sync V1
wire semantics. Add an explicit closed trusted-mechanic binding for target discovery, repair the player
outbox/snapshot/join state machine, remove game-specific player routing, and prove both games from
validation through durable action, recovery, and report.

## Technical Context

**Language/Version**: TypeScript 7.0.2 with strict ESM and ES2022 output; Node.js 25 or newer; React
Native 0.86.2 through Expo SDK 57 for the native player
**Primary Dependencies**: Existing dependency-free `@plotpoint/runtime`; `@plotpoint/protocol`;
Rolldown 1.2 and AJV 8 in the compiler; React 19, Expo SQLite/SecureStore/Location, and
`react-native-webview`; Node HTTP, `pg`, and the existing `@plotpoint/modules` boundary
**Storage**: Existing Release Format V1 `.pprelease` bytes; host-owned SQLite plus SecureStore on the
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
**Scale/Scope**: Two materially different internal reference games, one trusted target-discovery
mechanic, one team per cooperative session, three participants, complete authorized snapshots, one
foreground coordinator per player process, and no active-run/session release migration

## Constitution Check

_GATE: Evaluated before Phase 0 research and again after Phase 1 design._

### Pre-Research Gate

- **PASS - Complete product loop**: The feature is anchored to validate/compile/install/mount/action/
  recovery/report journeys for the field puzzle and cooperative hunt, not isolated framework APIs.
- **PASS - Small durable contracts**: Each changed boundary has its own version; Release Format V1 and
  Sync V1 stay stable where their semantics are sufficient.
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

- **PASS - One composition authority**: Project Configuration V2 lowers to generated registries and
  Game Composition V1; no executable DSL or duplicate author runtime registry remains.
- **PASS - Functional core, imperative shells**: Runtime Model V2 owns deterministic decisions and
  progression; player/API adapters own persistence, transport, authorization, and capabilities.
- **PASS - Minimal composability**: Aggregate model, scoped component context, trusted-mechanic port,
  and keyed single-flight are the smallest patterns that cover both games and observed failures.
- **PASS - Version/migration honesty**: The private pre-release project/runtime contracts migrate
  together, old artifact container semantics stay valid, and active session migration is excluded.
- **PASS - Failure atomicity**: Binding validation precedes view mutation; result reconciliation is
  compare-or-insert; one transaction owns snapshot/result/outbox/cursor/member status.
- **PASS - Verification proportionality**: Contract, replay, duplicate, interruption, corrective,
  redaction, and two-game lifecycle tests cover every changed authority boundary.
- **PASS - Governance**: The design introduces no constitution exception and accepted ADR 0001 governs
  its implementation boundaries.

## Architecture Decisions

**Impact**: Major

- [Integrated Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) -
  **Accepted**; updated in place at the project owner's direction and governs canonical execution,
  Runtime Model V2, generated composition, scoped components, the optional trusted mechanic, finite
  synchronization, release-pinned binding, and generic reporting.
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) - **Accepted**; Release Format
  V1 inventory, integrity, identity, and compatibility remain unchanged while Game Composition V1 is
  ordinary inventoried application content.
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md) - **Accepted**; the
  generated application/component contexts improve composition without claiming component isolation.
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) - **Accepted**;
  Local Transition V2 and shared reconciliation remain host-owned atomic commits.
- [Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md) -
  **Accepted**; release-pinned authority, adapter-owned domain conflict policy, complete authorized
  snapshots, and generic retry, revocation, and privacy boundaries remain.

## Project Structure

### Documentation (this feature)

```text
docs/features/0005-game-runtime-integration/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── game-composition-v1.md
│   ├── game-play-report-v2.md
│   ├── host-application-v1.md
│   ├── runtime-model-v2.md
│   ├── shared-recovery-v1.md
│   ├── shared-session-api-v1.md
│   └── trusted-mechanic-v1.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Created later by /speckit-tasks after ADR acceptance
```

### Source Code (repository root)

```text
packages/runtime/
├── src/
│   ├── aggregate-model.ts           # Resolved-model and explicit decision contract
│   ├── execute-command.ts           # Model-owned execution and revision semantics
│   ├── execution-record.ts
│   └── progression/                 # V2 nodes, transitions, initial instance, bounded evaluator
└── test/                            # Unit, type, replay, event/effect, heterogeneous progression

packages/testkit/
├── src/                             # Model fixtures, replay, strict scenario assertions
└── test/

packages/compiler/
├── src/
│   ├── project/                     # Strict Project Configuration V2 capture/registries
│   ├── composition/                 # Reference validation, definition inspection, catalog generation
│   ├── bundle/                      # Generated local logic and presentation roots
│   ├── validation/                  # Application/model/component/mechanic/resource agreement
│   ├── inspection/                  # Composition-aware public inspection over verified releases
│   └── release/                     # Composition descriptors in unchanged Release Format V1
└── test/                            # Contract, mutation, reproducibility, mount-shape fixtures

packages/protocol/
├── src/
│   ├── player/                      # Game application/client types, Bootstrap/Transition V2
│   ├── report/                      # Generic Game Play Report V2
│   ├── release/                     # V1 open/verify plus Game Composition V1 validation
│   └── shared/                      # Existing Shared Play/Sync V1 with uniqueness validation
└── test/

packages/modules/
├── src/
│   ├── trusted-mechanics.ts         # Closed registry/port
│   └── hunt/                        # Target-discovery V1 adapter
└── test/

packages/db/
├── src/                             # Existing PostgreSQL schema/transactions/repositories
└── test/

apps/api/
├── src/
│   ├── server.ts                    # Generic /v1/shared-sessions transport
│   ├── shared-session-service.ts    # Release/mechanic/model authority
│   └── operator-client.ts
└── test/                            # Contract, Postgres, auth, idempotency, redaction

apps/player/
├── App.tsx                          # Composition-driven local/shared shell, stable coordinator owner
├── src/
│   ├── runtime/                     # Catalog loading, generated application mount, adapters
│   ├── persistence/                 # Aggregate/progression/event/effect Local Transition V2 commit
│   ├── bridge/                      # Host API 1.2 and correlated errors
│   └── shared/                      # Immutable join, finite batch, single-flight, reconciliation
└── test/                            # Bootstrap, SQLite, interruption, join, bridge, offline routes

examples/releases/field-puzzle/
├── plotpoint.project.json           # V2 local composition
├── src/                             # Initializer, command, progression, component, application
└── test/                            # External-consumer lifecycle

examples/releases/team-session-hunt/
├── plotpoint.project.json           # V2 shared composition + trusted mechanic
├── src/                             # Application/components; no server executable source
└── test/                            # Type-facing and complete shared lifecycle
```

**Structure Decision**: Change no package or deployment boundary. `@plotpoint/runtime` owns the pure
resolved-model/executor contract; the compiler owns authored-to-generated local composition; protocol
owns cross-process/versioned shapes; player and API are imperative adapters; `@plotpoint/modules` owns
the closed trusted-mechanic registry plus complete platform server models and validators. Migrate
`team-session-hunt` into the normal workspace test/type surface rather than treating it only as a
compiler fixture. Remove superseded hunt-named player transport and author duplicate registries instead
of retaining compatibility shims.

## Implementation Design

### 1. Contract-First Runtime and Composition

Write failing type/behavior fixtures for explicit no-op, event/effect-only acceptance, canonical model
initialization, local preflight versus recorded execution invalidity, heterogeneous-command progression,
payload/state schema-narrowing wrappers, duplicate command type within one model, generated
catalog/registry agreement, malformed application lifecycle, mount-scope rollback and cleanup, scoped
components including throw/invalid-element cleanup, executable schema validators, unchanged Release
Format V1, and composition-aware public inspection output. Implement Runtime Model V2, Progression V2,
Project Configuration V2, definition inspection, resource catalog, generated local roots, and
`plotpoint inspect` catalog reporting.

### 2. Host Application and Local Persistence

Add Host API 1.2 Bootstrap/Transition V2 and compiler-generated local model adapter. Extend the player
snapshot/journal/receipt transaction to store progression, typed events/effects, and accepted revision
semantics without effect delivery. Mount only the generated application, expose scoped component
contexts, require cleanup before shared-session remount or disposal, preserve correlated errors, and
derive local/shared shell state from verified composition. Replace game-selected report builders with
one host-owned Game Play Report V2 path keyed only by run and optional shared binding.

### 3. Trusted Mechanic and Generic Shared Service

Add the closed platform registry and migrate target discovery into its first adapter. Release
registration consumes Game Composition V1's data-only server contracts and safe configuration rather
than executable release source or hard-coded logical paths. The adapter owns the complete resolved
server model and digest-bound validators, must match those contracts, and supplies no undeclared server
progression. Trusted outcomes use an exact stable-code shape so their Sync V1 mapping loses no semantic
fields. Rename public participant routing to `/v1/shared-sessions`, dispatch declared commands through
that platform model, and preserve ADR 0005 transaction, projection, authorization, and privacy semantics.

### 4. Durable Shared Recovery

Implement finite atomic batch claiming, a stable per-app keyed single-flight coordinator, pure view
reads, honest durable sync status, compare-or-insert terminal reconciliation, duplicate collection
rejection, durable pending-join provenance before network submission, immutable SQLite binding guards,
one pending-or-bound session per run, release equality on join/pull, atomic local revocation, and
request-ID preservation. Test parallel joins plus every join/claim/submit/pull/commit interruption and
corrective repeat, 100 queued-action response-loss retries with one immutable terminal each, and 100
repeated local preflight-invalid attempts with no durable mutation. Cover both authenticated revocation
errors and revoked snapshots with the same atomic blocked-outbox result.

### 5. Runnable Reference Games and Evidence

Migrate the field puzzle and hunt to Project Configuration V2. Remove their duplicate default
registries and protocol adapters; add the hunt application mount and declared target-discovery command/
mechanic. Put both examples in normal type-checking. Prove compile/install/mount/first-action/restart/
report journeys, three-participant disconnect/recovery/revocation, a fresh release as a fresh run/session,
and privacy/authorization/reproducibility regression gates.

## Phase 0: Research

Research is complete in [research.md](research.md). It resolves composition/versioning, application and
component lifecycle, aggregate decision/revision semantics and validators, progression facts, the
single optional trusted mechanic, generic session transport, finite synchronization, corrective
reconciliation, durable release-pinned join, atomic revocation, bridge correlation, and the generic
Game Play Report V2 export. There are no `NEEDS CLARIFICATION` items.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines authored/compiled composition, local and server model
  ownership, aggregate/progression, components, trusted mechanics, pending joins, immutable sessions,
  shared actions, snapshots, and state transitions.
- [game-composition-v1.md](contracts/game-composition-v1.md) defines Project Configuration V2,
  generated registries, resource catalog, lifecycle validation, and composition-aware public
  inspection layered over Release Format V1.
- [game-play-report-v2.md](contracts/game-play-report-v2.md) defines one privacy-safe local/shared
  evidence export with no game-specific player selection.
- [runtime-model-v2.md](contracts/runtime-model-v2.md) defines model-owned command execution, explicit
  decisions, revision behavior, progression nodes/transitions, and replay.
- [host-application-v1.md](contracts/host-application-v1.md) defines Host API 1.2 bootstrap, generated
  adapters, scoped component context, Local Transition V2, and composition-driven shared UI.
- [trusted-mechanic-v1.md](contracts/trusted-mechanic-v1.md) defines the allowlisted platform adapter
  boundary and target-discovery V1.
- [shared-session-api-v1.md](contracts/shared-session-api-v1.md) defines generic routes, release-pinned
  join, and mechanic dispatch.
- [shared-recovery-v1.md](contracts/shared-recovery-v1.md) defines finite batches, keyed single-flight,
  durable pending join, atomic revocation, immutable binding, idempotent snapshots, migration, and
  correlated bridge errors.
- [quickstart.md](quickstart.md) exercises both games as an external author/operator/player would.
- The Spec Kit block in `AGENTS.md` points to this plan.

## Phase 2: Implementation Planning

Accepted ADR 0001 satisfies the architecture gate. A separate `/speckit-tasks` run must order behavioral
tests before implementation and preserve vertical completion: runtime/composition contracts; host local
lifecycle; trusted mechanic/service; shared recovery; reference games; then full provider-free and
platform evidence.

## Complexity Tracking

No constitution violation. The plan adds no package, service, worker, plugin loader, DI container,
event store, effect dispatcher, background sync process, delta protocol, or active-session migration.
New contract versions are required by observed incompatible semantics and stay within existing owners.
