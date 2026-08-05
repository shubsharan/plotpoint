# Data Model: Game Runtime Integration

Public and cross-process shapes are versioned contracts. TypeScript objects, generated bundle exports,
SQLite tables, and PostgreSQL records remain implementation-owned representations of these entities.

## Authored and Compiled Game

### Game Project V2

The strict data-only authoring document contains:

- `projectFormatVersion: 2`, environment, and Host API requirement;
- one application source export;
- aggregate-model, command, progression, component, schema, content, and asset registrations plus zero
  or one trusted-mechanic registration; and
- stable logical references among those registrations.

All registration arrays are semantically unordered. IDs are globally unambiguous in their registry,
paths stay inside the frozen project root, source exports resolve once, and every cross-reference must
resolve before bundling. Unknown fields, duplicate keys, implicit discovery, executable configuration,
and undeclared platform requirements are invalid.

### Game Composition V1

The compiler-owned catalog is the immutable runtime description of one release:

| Field             | Meaning                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `version`         | Exact catalog version `1`                                                      |
| `application`     | Application contract version and generated presentation export                 |
| `aggregateModels` | Local generated exports or data-only server model contracts                    |
| `commands`        | Local resolved-binding descriptors or data-only trusted command contracts      |
| `progressions`    | Optional graph descriptors closed inside their owning local model              |
| `components`      | Implementation exports and declared dependency IDs                             |
| `resources`       | Logical ID to exact inventory kind, path, schema role, and digest relationship |
| `capabilities`    | Ordinal release-wide union of component and mechanic requirements              |
| `trustedMechanic` | Optional exact platform mechanic binding, absent for local-only releases       |

Aggregate descriptors are a closed local/server union; command descriptors are a closed local/trusted
union; progression and component descriptors carry their exact generated export and dependency
relationships. Every schema reference contains ID and version. No implementation-private descriptor
field is required to parse the catalog.

The catalog contains no release ID because that ID hashes the complete finalized artifact. Its fixed
path is inventoried as ordinary application content in Release Format V1. The compiler proves catalog,
inventory, and generated-registry agreement. On player open, the verified manifest and loaded local
registries must still agree. The API verifies only the catalog, inventory, and data descriptors it can
inspect without importing executable bundles.

### Game Application V1

An application definition has exact contract version `1` and one asynchronous or synchronous
`mount(context)` function that returns a handle with `unmount()`. Compilation inspects definition
metadata without invoking `mount`; the player validates the returned handle and invokes `unmount`
exactly once before remount or disposal. A player-owned mount scope accepts component cleanup callbacks
at resource-acquisition time without exposing them to the application, then invokes them once in reverse
order on failed mount, invalid handle, successful unmount, or unmount failure. The generated presentation
bundle exports this selected definition as `application`.

`GameApplicationContextV1` contains only:

- the root DOM element and Runtime Bootstrap V2 with its initialized or recovered local player
  aggregate;
- compiler-selected component factories already bound to contexts narrowed to each component's
  declared dependencies.

The application chooses layout and mounts those factories. It does not receive aggregate or command
registries, general resource resolvers, capability clients, or shared/local command clients. Those
platform-visible bindings exist only in each pre-scoped component context.

The application never receives compiler-private paths, raw release bytes, SQLite identities,
credentials, HTTP envelopes, or an arbitrary send function.

## Deterministic Aggregate Model

### Authored Model Contracts

A source-backed local model registration declares one `player` model, its initializer, commands,
schemas, event/effect declarations, initialization content, and optional progression. The compiler
resolves those declarations and executable validators into the local runtime model.

A server model registration is instead a data-only contract. It declares identity, `team | session`
kind, aggregate and initialization-input schemas, commands, events, effects, and the exact
trusted-mechanic identity/version. It cannot contain initializer, handler, validator, progression, or
other executable release source. The platform adapter owns that code and must match the contract during
release registration.

### Resolved Aggregate Model V2

| Field                       | Validation                                                           |
| --------------------------- | -------------------------------------------------------------------- |
| `modelId`                   | Stable unique definition identity                                    |
| `aggregateKind`             | Exact player, team, or session kind                                  |
| `authority`                 | Local or server, consistent with its compiler or platform owner      |
| `schemaId`, `schemaVersion` | Exact registered aggregate schema                                    |
| `stateSchema`               | Executable validator plus exact inventoried schema digest            |
| `initializationSchema`      | Optional executable validator for explicit initialization input      |
| `initialize`                | Synchronous deterministic initializer over validated canonical input |
| `commandsByType`            | Schema-narrowing command bindings with digest-bound validators       |
| `eventSchemas`              | Type-to-digest-bound-validator map for durable domain events         |
| `effectSchemas`             | Type-to-digest-bound-validator map for post-commit effect intents    |
| `progression`               | Zero or one matching definition; local in Game Composition V1        |

Initialization returns valid canonical state and, when progression exists, the runtime derives its
initial instance from the progression definition. A resolved model does not own storage, transport,
clocks, randomness, sensors, or effect execution.

State-specific resolved models enter the generated player registry or closed trusted-mechanic registry
only through `ExecutableAggregateModelV2`. That constructed wrapper exposes closed model/command/schema
metadata and validates erased initialization or persisted JSON through the exact state schema before it
invokes typed initializer, command, or progression code. No registry directly widens a state-specific
function to `JsonObject`.

### Aggregate Instance

```ts
interface AggregateInstanceV2 {
  readonly modelId: string;
  readonly kind: "player" | "team" | "session";
  readonly id: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly authority: "local" | "server";
  readonly state: object;
  readonly progression?: ProgressionInstanceV2;
}
```

The model, kind, authority, and schema identity are immutable for an aggregate ID. Only one accepted
commit advances `revision`; rejected, no-op, and invalid results preserve the instance exactly.

### Command and Handler Decision

A command retains stable command ID, type, target, expected revision, canonical payload, and explicit
observations. Its type resolves to exactly one definition in the target model. Payload, outcome,
event, effect, state, and progression values are validated at their owning boundary.

Handler decisions are closed, and invalidity remains executor-owned:

| Terminal             | Allowed output                                                | Commit semantics                                                                |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `accepted`           | proposed state, outcome, events, effects, progression intents | Must change state/progression or record an event/effect; revision advances once |
| `no-op`              | outcome only                                                  | Recorded terminal; state/progression/revision unchanged                         |
| `rejected`           | outcome only                                                  | Recorded semantic denial; state/progression/revision unchanged                  |
| `invalid`, preflight | Runtime diagnostics only                                      | Local non-committable result with no execution record                           |
| `invalid`, execution | Diagnostics and attempted progression trace                   | Recorded terminal; state/progression/revision unchanged                         |

The execution record contains canonical before/after values, observations and consumption trace,
decision, event/effect arrays, progression trace, and stable diagnostics. An effect intent is durable
data but has no delivery status in Feature 0005.

Local recorded results retain their full schema-validated outcome. Trusted command outcomes are
restricted to exact `{ code: StableCode }`; Sync V1 copies that code unchanged. An authoritative
execution-invalid result publishes its deterministic primary diagnostic code while retaining the full
diagnostic list in the server execution record.

## Progression

### Progression Definition V2

| Field                     | Meaning                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `graphId`, `graphVersion` | Stable ruleset identity                                                                |
| `aggregateKind`           | Must equal the owning model kind                                                       |
| `nodes`                   | Ordinal unique node IDs and initial lifecycle statuses                                 |
| `transitions`             | Ordinal named legal status edges with target node, `from`, `to`, priority, and trigger |

The lifecycle remains:

```text
locked    -> available | skipped
available -> active | completed | skipped
active    -> available | completed | skipped
completed -> terminal
skipped   -> terminal
```

A direct intent names one declared transition. An automatic transition predicate sees only canonical
aggregate state, typed domain-event facts, and the current progression instance. It does not assume one
command payload or outcome type. Equal-priority enabled transitions for one target conflict; independent
winners apply in an ordinal simultaneous round. Cycle and transition-limit failure preserve the original
aggregate.

### Progression Instance V2

The instance contains `graphId`, `graphVersion`, and exactly one ordinal status entry per declared node.
It is stored only on the aggregate instance. A game may omit progression entirely; it must not mirror the
same authoritative phase in both game state and unused progression.

## Presentation Component

A Component Definition V1 binds one stable ID and implementation export to explicit command, content,
asset, capability, and optional shared-projection schema IDs. A shared projection must equal the one
produced by the release's trusted mechanic; any trusted command dependency requires it. The generated
registry creates a context containing only those bindings and exposes Shared Play V1 only after an exact
session binding exists.

The component can render or return DOM, read the durable local aggregate, subscribe to post-commit local
changes, and dispatch declared commands. Shared view/subscription access appears only for the declared
versioned projection after binding.
It cannot obtain participant credentials, service envelopes, arbitrary artifact paths, or raw native
authority through the supported context. Because components share one trusted WebView, this is a
composition and host-policy boundary rather than isolation between mutually hostile components.

## Trusted Mechanic

### Trusted Mechanic Binding V1

A composition has zero or one binding.

| Field              | Validation                                               |
| ------------------ | -------------------------------------------------------- |
| `id`, `version`    | Exact platform registry key                              |
| `aggregateModel`   | One data-only server model contract in the composition   |
| `commands`         | Non-empty subset of that model's registered commands     |
| `configuration`    | One schema-validated content resource                    |
| `capabilities`     | Requirements included in release-wide compatibility      |
| `projectionSchema` | Versioned authorized-view schema produced by the adapter |

The target-discovery binding names the target configuration, team model, discovery command, foreground
location capability, and team projection. No server source path or executable release export appears in
the binding.

### Trusted Mechanic Adapter

The API composition root maps exact binding identity/version to platform code implementing:

- the complete resolved server model, including initialization and executable state, payload, outcome,
  event, and effect validators, with each validator bound to the digest of the exact inventoried schema
  bytes it implements;
- digest-bound configuration and projection validators plus canonical initialization input;
- command authorization and explicit observation transformation;
- deterministic decision through the aggregate model; and
- participant-authorized projection.

Unsupported versions or mismatched config/model/command/schema relationships reject release
registration. The adapter runs inside the existing PostgreSQL modular monolith transaction boundary.

## Shared Session and Recovery

### Pending Shared Join

Before the first network attempt, the player exclusively reserves one non-secret SQLite row containing
`sessionId`, `runId`, expected release, canonical service origin, `joinRequestId`, invitation digest,
invitation-key reference, credential-key reference, exact request digest, and
`preparing | ready | submitting` status. It then stores invitation and participant credential secrets
under those dedicated SecureStore keys and advances the same row to `ready`. Network submission is
forbidden until the reservation and both secrets are durable.

One `runId` may have exactly one pending-or-bound shared session. An exclusive SQLite reservation starts
as `preparing` before secret storage; a unique pending-run constraint and cross-table guards make parallel
changed joins conflict before network submission. Exact reuse resumes the same request, while a complete
reservation advances through `ready` to `submitting`.

Restart reconstructs the exact request from this record and its secrets. Successful immutable
session/snapshot commit deletes the pending SQLite row in the same transaction and removes the
invitation afterward; a response mismatch retains the complete attempt so the same server result can be
recovered without exposing a mismatched view.

### Shared Session Binding

Immutable fields:

- local `runId` and its installed `releaseId`;
- service `sessionId`, `participantId`, and `teamId`;
- canonical HTTPS service origin; and
- credential-key reference, with raw credential remaining in SecureStore.

Mutable recovery fields are membership (`active | revoked`), transport, sync status, cursor, confirmed
time, complete projections, results, and redacted sync events. Fresh join inserts the immutable binding
once. Exact retry may update only recovery fields. Any changed immutable value is a binding conflict and
leaves the prior row and projections unchanged.

An authenticated `participant-revoked` response does not wait for a snapshot. One transaction sets
membership and synchronization state to revoked, transport to degraded, changes every queued/submitting
action to `blocked-revoked`, and records a redacted event before the credential is removed.
An authenticated snapshot carrying revoked membership performs the same transition within snapshot
application and removes the credential only after that transaction commits.

Before join commit or pull application:

```text
active run release
  = join response release
  = authorized snapshot release
  = existing shared-session release (when present)
```

Top-level and snapshot session, participant, and team identities must also agree. One run has zero or
one shared session. A local-only composition has none.

### Shared Action

Immutable intent fields are session, command ID, target, expected revision, command type, canonical
payload, observation IDs, and enqueue time. Lifecycle:

```text
queued --claim--> submitting --terminal in pull--> shared_results
   ^                    |
   |---- interruption --|

queued | submitting --revocation--> blocked-revoked
```

- `queued`: eligible when the next pass begins.
- `submitting`: owned by one pass; an interrupted prior pass is safely requeued before the next claim.
- `blocked-revoked`: retained evidence and never submitted.
- `shared_results`: immutable exact terminal; the matching outbox row is removed in the same pull
  transaction.

One atomic batch claim captures every eligible row present at pass start, ordinally ordered by enqueue
time and command ID, marks exactly that set submitting, and records syncing status. Later enqueues remain
queued for another pass.

### Authorized Snapshot and Reconciliation

An Authorized Snapshot V1 remains the complete current participant view: release/session/member/team
identity, membership, confirmed time, and unique projections. Sync Pull V1 adds unique exact command
results and the next cursor.

Application is one exclusive transaction:

1. Validate all immutable binding and snapshot identities plus duplicate-free collections.
2. Compare existing terminal results exactly or insert new terminals using matching outbox provenance.
3. Replace complete projections.
4. Delete only outbox rows matched by newly or previously identical terminals.
5. If the authenticated snapshot is revoked, change every remaining queued/submitting row to
   `blocked-revoked` and select revoked/degraded status; otherwise requeue interrupted pass-owned rows
   before selecting recovery-required/current state.
6. Apply membership, transport/sync status, cursor, and confirmed time consistently with step 5.
7. Commit once or expose none of the candidate changes.

A result with neither existing local terminal nor outbox provenance is an explicit recovery failure in
V1; loss of both local evidence sources is not silently reconstructed.

### Synchronization Scheduler

The scheduler is process-local and keyed by session ID. One `runOnce` owns one finite submission batch
and at most one pull. Concurrent triggers share the active work; triggers arriving during it coalesce
into at most one subsequent pass. Different sessions may progress independently. Durable rows, not the
process-local promise, provide restart recovery. Enqueue after commit, foreground, an explicit
offline-to-reachable reconnect transition, and manual retry may schedule work; durable view reads may
not.

## Game Play Report

Game Play Report V2 is one host-owned deterministic evidence export for an installed run. It contains
the immutable release identity, platform, duration derived from committed timestamps, an optional
generic shared-membership section when the run has a binding, and ordinal lifecycle, command,
capability, synchronization, recovery, and redacted diagnostic events.

The host derives it only from committed lifecycle, receipt, observation-use, shared-result, and sync
records. Report-local aliases replace run, command, session, participant, and team identities; no
release code runs during export. Raw aggregate/projection state, content or configuration, credentials,
service origin, precise location, observation payloads, host paths, and game-specific completion fields
are absent. Command outcomes are omitted, synchronization dispositions are closed, and diagnostics use
only host-allowlisted report-safe codes. Product acceptance tests prove completion separately.
Historical V1 formats remain readable, while Project Configuration V2 releases produce only V2.

## Relationship Summary

```text
Game Project V2 -> compiler -> Game Composition V1 -> immutable release
Game Application -> mounts generated Components with pre-scoped contexts
Local Model Registration -> compiler -> typed Resolved Model -> Executable Model wrapper
Server Model Contract -> Trusted Mechanic Binding -> platform typed Model -> Executable Model wrapper
Pending Shared Join -> exact retry -> immutable Shared Session Binding
Installed Run + Authorized Snapshot -> one immutable Shared Session Binding
Shared Session -> queues Shared Actions -> finite Sync Pass -> atomic Snapshot Reconciliation
Run + optional Shared Session -> one host-owned Game Play Report V2
```
