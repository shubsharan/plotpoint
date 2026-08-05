---
status: Accepted
---

# ADR: Integrated Deterministic Runtime Contract

## Context

Plotpoint's deterministic runtime now has to serve compiler-generated games, the durable native
player, and platform-owned authoritative mechanics. Integrating the local field puzzle and co-op game
exposed competing composition roots, model relationships recorded in more than one place,
component dependencies that did not constrain runtime contexts, game-specific Host API adapters, and
an authoritative mechanic selected through conventions missing from the release definition.

The shared recovery path also permits submitted rows to remain eligible indefinitely, cannot always
reconcile repeated corrective results after their outbox provenance is removed, does not serialize
overlapping foreground triggers, and can attempt to bind one installed run to a different release or
service session.

Plotpoint is pre-release. There are no supported external consumers or installed artifacts that require
compatibility with the current private schemas. Creating replacement schema generations would add
parsers, migrations, aliases, and terminology without preserving real user data. At the project
owner's explicit direction, the project configuration and serialized contracts are therefore corrected
in place at version 1. The corresponding TypeScript runtime APIs remain unversioned. Git history records
the discarded shapes.

ADRs 0002 through 0005 remain authoritative for immutable artifacts, WebView trust, player
persistence, and authoritative shared-session recovery.

## Decision

1. Command execution remains a deterministic pipeline with preflight, handler evaluation, progression
   stabilization, classification, and record construction. Values that cannot become canonical return
   preflight invalidity without an aggregate or record. Every post-preflight terminal has a replayable
   record assembled from detached, recursively frozen canonical values. Deterministic ordering uses
   ordinal code-unit comparison.
2. A state-specific unversioned `ResolvedAggregateModel` owns model identity, aggregate kind,
   authority, the exact state schema, deterministic initialization, typed command bindings,
   event/effect schemas, and zero or one progression. A constructed `ExecutableAggregateModel` is the
   only heterogeneous-registry boundary; it narrows erased state and payloads through digest-bound
   schemas before invoking typed code. Function widening and casts are not supported boundaries.
3. The existing unversioned `Aggregate` gains model and schema identity and retains `stateVersion` as
   its sole concurrency and commit counter. No parallel revision field exists. Handlers return explicit
   `accepted`, `no-op`, or `rejected` decisions; `invalid` remains executor-produced. An accepted command
   that changes state or progression or records an event/effect advances `stateVersion` exactly once.
   A no-op preserves state, progression, and `stateVersion` and emits no event, effect, intent, or trace.
4. Progression is optional and stored once on its owning aggregate. `defineProgression` validates,
   ordinally orders, and freezes named legal transitions with `from`, `to`, target, priority, and
   trigger. The runtime derives the only canonical initial instance. Automatic predicates observe
   aggregate state, typed domain-event facts, and progression state rather than a progression-wide
   command payload or outcome type.
5. `plotpoint.project.json` remains strict Project Configuration V1 and is the sole authored
   composition authority. It declares one application, local player and optional server aggregate
   models, commands, optional local progression, components, schemas, content, assets, and zero or one
   trusted mechanic. The compiler accepts only this corrected shape; it provides no legacy parser or
   upgrade path for the discarded V1 shape.
6. Relationships have one owner. Commands and progressions reference their aggregate model; models do
   not repeat those lists. The trusted-mechanic binding selects its server model and trusted commands;
   those records do not repeat mechanic identity. Authority is structural: local models are `player`,
   while server models are `team` or `session`.
7. Compiler-generated bundle roots are the executable composition root. Game Composition V1 is
   mandatory inventoried application content in every playable release. It derives relationships from
   Project Configuration V1, uses fixed registry-map export conventions rather than per-item export
   fields, and does not duplicate Host API or capability declarations already authoritative in Release
   Manifest V1. The compiler proves the derived capability union equals the manifest declaration.
8. Presentation exposes one `GameApplicationV1.mount(context)` lifecycle with a player-owned unmount
   boundary. The application receives only the root and generated component factories. Generated
   component factories provide contexts scoped to declared commands, content, assets, capabilities,
   local durable views, and an optional validated shared projection. Raw or bootstrap aggregate state
   is never delivered to application code.
9. Host Bridge Envelope V1 and the existing message names `runtime.ready`, `runtime.bootstrap`,
   `transition.commit`, and `transition.result` remain. Host API 1.0 is the local core and Host API 1.1
   is the shared-play extension; no additional Host API minor is introduced. Runtime Bootstrap V1 and
   Local Transition V1 are corrected in place. The generated runtime adapter consumes bootstrap and
   maps runtime results to the host contract without game-specific protocol code.
10. A release declares zero or one trusted-mechanic binding. It selects an exact platform-owned
    adapter, one data-only server model, trusted commands, schema-validated configuration, capabilities,
    and a projection schema. The adapter returns explicit validated-binding, initialization,
    authorization, execution, and projection results using defined runtime and Sync V1 types. It
    preserves `expectedStateVersion` and `resultingStateVersion` directly and never invents revision
    translation. The server imports no release bundle and executes no release-authored server code.
11. Host API 1.1 Shared Play and Sync V1 wire semantics remain. Shared outbox rows use
    `queued | submitting | blocked-revoked`; one pass atomically claims its finite start-eligible batch,
    submits each member at most once in stable order, performs at most one pull, and terminates. A
    long-lived keyed single-flight coordinator serializes and coalesces triggers per session.
12. Snapshot reconciliation is immutable compare-or-insert and failure-atomic. Projection replacement,
    result/outbox reconciliation, cursor, membership, and synchronization status commit together.
    Join and pull prove equality among run, release, session, participant, team, and canonical service
    origin before exposing state. Authenticated revocation atomically blocks outstanding actions before
    credentials are removed.
13. Every run exports one host-owned Game Play Report V1. The report derives generic lifecycle,
    command, capability, synchronization, recovery, and report-safe diagnostic evidence only from
    committed host records. It uses a report-local command alias where correlation is useful and omits
    constant run/session/participant/team aliases, raw state, projections, content, observations,
    locations, credentials, outcomes, service identities, and game-specific fields.
14. This is a clean break. Previously compiled composition-less artifacts, the discarded project
    shape, old report shapes, and incompatible player databases are not migrated or read. References
    are recompiled. An incompatible on-device database fails explicitly with reset/reinstall guidance;
    it is never silently dropped. Recovery within the corrected schema remains required.

## Consequences

- Authors get one inspectable definition and one executable composition path for local and cooperative
  games, without duplicate relation fields, registries, or protocol adapters.
- Release Format V1, Game Composition V1, Host API V1, Sync V1, Trusted Mechanic V1, Shared Recovery
  V1, and Game Play Report V1 are the only serialized contract generations introduced or edited here.
- Runtime and progression TypeScript APIs evolve in place and remain unversioned because they are
  repository-owned pre-release APIs.
- The functional core owns canonical decisions, progression, and replay. Compiler, player, and API
  adapters own composition, persistence, transport, authorization, capabilities, and cleanup.
- Foreground synchronization favors finite deterministic recovery over throughput. Background sync,
  WebSockets, deltas, multi-process leases, service rebinding, and active-session migration remain
  deferred.
- General plugin loading, dependency-injection containers, entity-component simulation, full event
  sourcing, effect workers, microservices, and release-authored server execution remain out of scope.
- Provider-free verification, simulator/emulator compatibility, and physical-device evidence remain
  separate claims.

## Supersession

**Supersedes**: None
**Superseded by**: None
