# Data Model: Unified Game Composition

Serialized, persisted, and cross-process shapes in this feature use plain semantic names.
Compatibility numbers remain centralized metadata only where a serialized boundary must select a
parser. Because Plotpoint is pre-release, corrected shapes replace the discarded shapes directly; no
compatibility readers or migrations are part of the model.

## Authored and Compiled Game

### Project Configuration

The strict data-only authoring document contains:

- centrally registered project-format metadata, web environment, and Host API compatibility requirement;
- one application registration;
- local/player and optional server/team-or-session aggregate models;
- commands, optional local progression, components, schemas, content, and assets; and
- zero or one trusted-mechanic registration.

Arrays are semantically unordered. IDs are unique within their registry, paths stay inside the frozen
project root, source exports resolve once, and every cross-reference resolves before bundling. Unknown
fields, implicit discovery, executable configuration, authority/kind mismatch, and undeclared platform
requirements are invalid.

Relationship ownership is one-way:

```text
Command ----------> Aggregate Model
Progression ------> Aggregate Model
Application ------> Components
Component --------> Commands / Content / Assets / Capabilities / optional Shared Projection
Trusted Mechanic -> Server Model / Trusted Commands / Configuration / Projection / Capabilities
```

Aggregate models do not repeat command or progression IDs. Server models and trusted commands do not
repeat mechanic identity. Compiler and runtime code derive reverse membership from these references.

Every model names its state and initialization schemas. A local model may name initialization content;
that content must declare the exact initialization schema. Without content, the initializer receives
canonical `{}`, which must validate against the initialization schema. This closes the prior path where
a typed initializer could receive schema-less content.

### Game Composition

The compiler-owned catalog is the immutable runtime description of one playable release:

| Field             | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `version`         | Exact catalog version `1`                                         |
| `application`     | Application contract version and selected component IDs           |
| `aggregateModels` | Local executable-model descriptors and server data-only contracts |
| `commands`        | One-way command-to-model contracts and schema references          |
| `progressions`    | One-way progression-to-local-model descriptors                    |
| `components`      | Scoped dependency selections; no per-item export names            |
| `resources`       | Logical ID/role to exact inventoried path bindings                |
| `trustedMechanic` | Optional closed platform-mechanic binding                         |

The catalog is mandatory at `composition/game.json`. Release Manifest remains the authority for
Host API compatibility, release-wide capabilities, digests, and byte lengths. The catalog does not copy
Host API or a top-level capability list. Compilation derives the capability union from component and
mechanic selections and requires exact semantic equality with the manifest.

Generated bundle roots have fixed exports: `application`, the `components` map, and the local
`aggregateModels` map. Logical IDs are map keys, so model/component descriptors do not carry fictional
per-item export names. Server executable code is never present in release roots.

The composition-aware inspector always returns a valid Game Composition or fails. Only the generic
Release Format inspector can describe arbitrary artifacts. A missing catalog is not a historical
success case for a playable release.

## Runtime Model

### Runtime Schema

A runtime schema has one logical ID, schema version, exact manifest digest, and narrowing validator.
The validator returns either a typed canonical value or stable diagnostics. Schema identity is not
copied onto a resolved model: `stateSchema` is its single source. Persisted aggregates retain schema ID
and version so durable state remains self-describing.

### Resolved and Executable Aggregate Models

A typed `ResolvedAggregateModel` owns:

- model ID, authority, and aggregate kind;
- state and optional initialization schemas;
- deterministic initializer;
- command bindings keyed by command type;
- event/effect schemas; and
- zero or one local progression.

Local models are always `authority: local, kind: player`. Server models are always
`authority: server, kind: team | session`.

Each typed command binding closes over its payload/outcome types and validators. A constructed
`ResolvedCommandBinding` validates erased payload JSON before calling the typed definition. A second
constructed `ExecutableAggregateModel` validates erased aggregate identity/state before calling the
resolved model. These are the only heterogeneous-registry boundaries; direct generic widening and
casts are not part of the contract.

Initialization returns either an initialized aggregate or stable invalid diagnostics. It validates the
explicit input, validates returned state, constructs `stateVersion: 0`, and derives the sole canonical
initial progression. It never returns partial state or relies on caller-supplied progression.

### Aggregate

An aggregate contains:

- aggregate ID, model ID, and aggregate kind;
- state schema ID/version;
- `stateVersion` as the only concurrency and commit counter;
- canonical state; and
- optional canonical progression instance.

There is no parallel `revision`. Accepted commits advance `stateVersion` exactly once. No-op, rejected,
recorded execution-invalid, and preflight-invalid attempts do not.

### Command and Execution Record

A runtime command contains stable command ID/type, target aggregate identity, expected state version,
canonical payload, and explicit observations. The selected resolved binding supplies model and schema
metadata; callers do not restate them in parallel selection objects.

| Terminal             | Handler/runtime data                                                     | Durable behavior                                           |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `accepted`           | Outcome plus optional state change, progression intents, events, effects | Must commit at least one fact; state version advances once |
| `no-op`              | Outcome only                                                             | Recorded; state, progression, and state version unchanged  |
| `rejected`           | Outcome only                                                             | Recorded semantic denial; state version unchanged          |
| `invalid`, preflight | Stable diagnostics                                                       | No aggregate, record, observation consumption, or commit   |
| `invalid`, execution | Stable diagnostics and attempted progression trace                       | Recorded; state version unchanged                          |

The complete execution record is the authority for command input, terminal, outcome/diagnostics,
events, effects, progression trace, and prior/resulting state versions. Local persistence and trusted
service adapters translate this record; they do not infer another terminal from optional fields.

The public generic order remains exactly `ExecutionResult<State, Outcome, Payload, Kind>`.

### Progression

A progression definition has graph identity/version, aggregate kind, stable nodes, and named legal
transitions. Each transition owns target node, `from`, `to`, priority, trigger, and optional automatic
predicate. Predicates observe aggregate state, typed domain events, and current progression—not one
progression-wide command payload or outcome type.

`initialProgression` is the only canonical initial-instance constructor. Deterministic simultaneous
rounds, ordinal ordering, equal-priority conflict, cycle detection, and transition limits remain.
Games whose state already expresses all needed phases omit progression instead of duplicating a phase.

## Presentation and Host Boundary

### Game Application

`GameApplication` has one `mount`/`unmount` lifecycle. Its context contains only the root element and
generated component factories. Runtime Bootstrap is consumed by the generated runtime adapter and
is never passed through to application code.

A player-owned mount scope registers component cleanup at resource acquisition. It performs reverse
exactly-once cleanup after failed mount, invalid output, unmount, remount, or disposal. Application code
receives elements, not cleanup ownership.

### Component Context

Each component receives:

| Context field  | Scope                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `local`        | Pure committed view reads/subscriptions and declared local command invokers |
| `shared`       | Optional validated Shared Play view and declared trusted commands           |
| `content`      | Declared content only                                                       |
| `assets`       | Declared assets only                                                        |
| `capabilities` | Declared capability clients only                                            |
| `lifecycle`    | Cleanup registration during mount only                                      |

Only `ComponentContext.local` exposes aggregate reads and subscriptions. The application has no raw
bootstrap field, and no candidate state becomes visible before the host transition transaction commits.

### Runtime Bootstrap and Local Transition

Host Bridge Envelope retains `runtime.ready`, `runtime.bootstrap`, `transition.commit`, and
`transition.result`. Runtime Bootstrap carries the run/release identity and current local aggregate
view to the generated adapter. Local Transition carries one runtime-recorded terminal to the host.

Transition candidates use `expectedStateVersion`; committed/duplicate results use
`resultingStateVersion`. The host validates composition, schema, canonicality, observation ownership,
and terminal rules and commits receipt, state/progression, events/effects, and journal evidence in one
SQLite transaction. Preflight invalidity remains local and does not cross the bridge.

## Trusted Authoritative Mechanic

### Trusted Mechanic Binding

The binding selects one platform mechanic identity/version, one server model, its trusted commands,
schema-validated configuration content, projection schema, and capabilities. It contains no executable
server source or open extension map.

### Platform Adapter

The closed adapter owns the executable server model plus configuration/projection validators. Its
boundary results are explicit:

- binding validation returns canonical validated configuration and initializer input, or one stable
  diagnostic;
- authorization returns a fully formed runtime command with transformed observations, or an explicit
  rejected/invalid terminal; and
- projection returns one complete validated `SharedProjection`, or an explicit failure.

The adapter preserves Sync state-version fields directly. Trusted semantic outcomes are exactly
`{ code }`; accepted/no-op/rejected codes copy losslessly to Sync, while recorded execution invalidity
uses its deterministic primary diagnostic. No `revision` translation, partial projection, or undefined
placeholder result exists.

## Shared Player State

### Pending Shared Join

Before the first join attempt, SQLite stores run, expected release, canonical service origin, request
identity/digest, invitation digest, SecureStore key references, and status
`preparing | ready | submitting`. A unique run constraint plus cross-table guards permits at most one
pending-or-bound session per run. Exact reuse resumes; changed reuse conflicts before network send.

Raw invitation and participant credential remain in SecureStore. Successful immutable binding and
initial snapshot commit delete the pending row atomically; invitation cleanup happens afterward.
Response mismatch retains the complete attempt for exact retry and exposes no projection.

### Shared Session Binding

Immutable fields are run/release, session, participant, team, canonical service origin, and credential
key. Mutable recovery fields are membership, transport, synchronization status, cursor, confirmed time,
projections, results, and redacted sync events. Exact retry updates recovery fields only; changed
identity is a conflict.

Before join commit or pull application:

```text
active run release
  = expected release
  = join response release
  = authorized snapshot release
  = existing binding release (when present)
```

Session, participant, team, run, and origin must also agree. A local-only composition has no binding.

### Shared Action and Finite Sync Pass

A shared action stores session, command ID, target, expected state version, type, canonical payload,
observation IDs, enqueue time, and status `queued | submitting | blocked-revoked`.

```text
queued --finite claim--> submitting --terminal in pull--> shared result
   ^                         |
   +------ interruption -----+

queued | submitting --revocation--> blocked-revoked
```

One transaction recovers interrupted submissions, captures the finite start-eligible batch in stable
order, marks it submitting, and records syncing status. One pass submits each captured row at most once,
performs at most one pull, and terminates. Later enqueues belong to another pass. A process-local keyed
single-flight coordinator serializes and coalesces triggers per session; durable rows provide restart
recovery.

### Authorized Snapshot and Reconciliation

Authorized Snapshot is the complete current participant view: immutable identities, membership,
confirmed time, and unique validated projections. Sync Pull adds unique exact command results and
next cursor.

One exclusive transaction validates identities and schemas, compares or inserts immutable terminals,
replaces the complete projection set, removes only terminal-matched outbox rows, handles revocation or
requeues interrupted rows, updates status/cursor/time, and commits once. Reapplying an identical normal,
corrective, or revoked pull is byte-equivalent. A changed repeated terminal or missing both terminal and
outbox provenance fails without exposing candidate changes.

## Game Play Report

One host-owned report covers local and optional shared evidence for a run. It contains release,
platform, committed duration, optional membership status, and generic lifecycle, command, capability,
synchronization, recovery, and report-safe diagnostic events.

Only command aliases are retained for intra-report correlation. Constant run/session/participant/team
aliases are absent. Raw state/projections, content/configuration, credentials, service identity,
precise location, observation payloads, command outcomes, and game-specific completion fields are
excluded. There are no readers for superseded local or game-specific report shapes.

## Clean-Break and Recovery Boundary

- Project files in the discarded shape fail validation and must be edited.
- Existing reference releases are recompiled; composition-less playable artifacts are rejected.
- Provider-free and fresh player databases use the corrected schema.
- An incompatible installed player database fails with explicit reset/reinstall guidance and is never
  silently dropped, rewritten, or auto-migrated.
- Restart and interruption recovery within the corrected schema remain required and fully tested.
- PostgreSQL table names may remain implementation-owned when they do not leak into public contracts.

## Relationship Summary

```text
Project Configuration -> compiler -> Game Composition -> Release Format
Generated runtime adapter -> Executable Aggregate Model -> Local Transition
Game Application -> generated Components -> scoped Host API contexts
Trusted Mechanic Binding -> platform Adapter -> server Executable Aggregate Model
Pending Join -> exact retry -> immutable Shared Session Binding
Shared Actions -> finite Sync Pass -> atomic Snapshot Reconciliation
Run + optional Shared Session -> one Game Play Report
```
