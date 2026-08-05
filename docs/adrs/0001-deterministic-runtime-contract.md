---
status: Accepted
---

# ADR: Integrated Deterministic Runtime Contract

## Context

Plotpoint's foundational runtime contract now serves compiler-generated games, the durable native
player, and platform-owned authoritative mechanics. The original Gate 1 decision established canonical
execution, aggregate kinds, observations, deterministic progression, replay, and an honest distinction
between supported APIs and hostile-code isolation. Integrating materially different local and
cooperative reference games exposed additional boundary defects: the compiler and player used competing composition roots,
components declared dependencies their runtime contexts did not enforce, aggregate assembly and Host
API adaptation were game-specific, and multiplayer behavior depended on conventions absent from the
release definition.

Shared recovery also remained incomplete. A submitted row could remain eligible indefinitely,
corrective snapshots depended on outbox rows already removed, concurrent foreground triggers were not
serialized, and a join or pull could rebind one installed run to another release or service session.
These defects must be fixed without turning two internal games into a general plugin, workflow,
event-sourcing, or distributed-service platform.

The project is pre-release. At the project owner's explicit direction, this accepted foundational ADR
is updated in place rather than creating a replacement and supersession chain. ADRs 0002 through 0005
remain authoritative for immutable artifacts, WebView trust, player persistence, and authoritative
shared-session recovery respectively.

## Decision

1. Command execution remains a deterministic pipeline with preflight, handler evaluation, progression
   stabilization, classification, and record construction. Values that cannot become canonical return
   preflight invalidity without an aggregate or record. Every post-preflight terminal has a replayable
   record assembled only from detached, recursively frozen canonical values. All deterministic ordering
   uses ordinal code-unit comparison.
2. A state-specific `ResolvedAggregateModelV2` owns aggregate kind, schema identity/version,
   deterministic initialization, command definitions, executable digest-bound validators, event/effect
   shapes, and zero or one progression. State-specific models enter heterogeneous player or platform
   registries only through a constructed `ExecutableAggregateModelV2` wrapper that schema-narrows erased
   state and payloads before invoking typed code; direct function widening or casting is forbidden.
3. Handlers return explicit `accepted`, `no-op`, or `rejected` decisions; `invalid` remains
   executor-produced. An accepted commit that changes state or progression or records an event or effect
   advances the aggregate revision exactly once. A no-op preserves state, progression, and revision and
   emits no event, effect, intent, or trace. Effect intents remain durable post-commit data without a
   delivery worker or retry system.
4. Progression is optional and stored once on its owning aggregate. `defineProgression` validates,
   ordinally orders, and freezes stable nodes and explicit legal transitions. The runtime derives the
   canonical initial instance. Automatic predicates observe aggregate state, typed domain-event facts,
   and progression state rather than one command-wide payload/outcome type. Simultaneous rounds,
   equal-priority conflict, cycle detection, and exact transition limits remain deterministic.
5. `plotpoint.project.json` is the sole strict data-only composition authority. Project Configuration V2
   declares one application, aggregate models, commands, optional progression, components, schemas,
   content, assets, capabilities, and zero or one trusted mechanic. The compiler lowers it into ordinal
   frozen executable registries and Game Composition V1 at a fixed inventoried path. Release Format V1
   stays unchanged; Host API 1.2 expresses the new compatibility requirement. The public compiler
   inspector exposes a versioned, composition-aware view without executing bundle code.
6. Compiler-generated bundle roots are the executable composition root. Presentation exposes one
   `GameApplicationV1.mount(context)` lifecycle with an explicit player-owned unmount boundary.
   Generated component factories provide contexts scoped to declared commands, content, assets,
   capabilities, local durable views, and an optional versioned shared projection. A player-owned mount
   scope registers cleanup at resource-acquisition time, exposes only elements to application code, and
   cleans up exactly once on failed mount, invalid output, remount, or disposal. Components remain trusted
   functions in one WebView, not independently sandboxed plugins or a dependency-injection container.
7. The runtime supplies handlers only detached canonical inputs and explicit observation contexts;
   runtime code performs no ambient I/O and never executes effect intents. Compiler import closure and
   test sentinels are bounded evidence, not proof that arbitrary JavaScript lacks ambient authority.
   Release presentation continues inside the trusted single-WebView boundary governed by ADR 0003.
8. A release declares zero or one trusted-mechanic binding. It selects an exact platform-owned mechanic
   version plus data-only server model/command/schema contracts, validated configuration content,
   capabilities, and a versioned projection schema. The modular API resolves a closed platform adapter
   that owns initialization, handlers, digest-bound validators, authorization, and projection. The
   server never imports release bundles or executes release-authored server code. Trusted Mechanic V1
   has no hidden server progression and restricts semantic outcomes to an exact stable-code shape so
   Sync V1 remains lossless.
9. Host API 1.1 Shared Play and Sync V1 wire envelopes remain unchanged. Shared outbox rows use the
   explicit `queued | submitting | blocked-revoked` state machine. One pass atomically claims the finite
   start-eligible batch, submits each member at most once in stable order, performs at most one pull, and
   terminates. A long-lived keyed single-flight coordinator serializes enqueue, foreground, reconnect,
   and retry triggers per session and coalesces them into at most one trailing pass.
10. Snapshot reconciliation is immutable compare-or-insert and failure-atomic. Projection replacement,
    result/outbox reconciliation, cursor, membership, and synchronization status commit together. Every
    projection matches the release-declared schema ID, version, manifest digest, and executable payload
    validator before persistence or component exposure. Authenticated revocation, whether an error or
    snapshot, atomically blocks queued/submitting actions before credentials are removed.
11. Before a join or pull exposes state, the player proves equality among the active run release, join
    response, authorized snapshot, and existing binding. Run, release, session, participant, team, and
    canonical service origin are immutable after insertion. Before network submission, the player
    exclusively reserves one pending-or-bound session per run, persists non-secret request provenance in
    SQLite, and stores invitation/credential secrets in SecureStore. Exact response-loss retry reuses
    that request; parallel or changed reuse conflicts before submission. Active-run/session release
    migration and service rebinding are not supported.
12. Project Configuration V2 runs export one host-owned Game Play Report V2 selected only by run and an
    optional immutable shared binding. It derives generic lifecycle, command, capability,
    synchronization, recovery, and report-safe diagnostic evidence from committed host records without
    executing release code or selecting game-specific fields. Historical V1 reports remain readable;
    raw state, projections, protected content, observations, precise locations, credentials, command
    outcomes, and service or membership identities remain excluded.

## Consequences

- Authors get one inspectable definition and one executable composition path. Local and cooperative
  reference games migrate together and remove duplicate registries, protocol adapters, and game-named
  player routing.
- Runtime, testkit, compiler, protocol, player, API, trusted modules, and reference games adopt the V2
  model together without compatibility wrappers for private pre-release APIs.
- Release Format V1, Host API 1.1 Shared Play, Sync V1, and the authority/privacy boundaries of ADRs
  0002 through 0005 remain stable where their semantics are sufficient.
- The functional core owns canonical decisions, progression, and replay. Compiler, player, and API
  adapters own composition, persistence, transport, authorization, capabilities, and cleanup.
- Foreground synchronization favors finite deterministic recovery over throughput. Background sync,
  WebSockets, deltas, multi-process leases, service rebinding, and multi-device participation remain
  deferred.
- General plugin loading, dependency-injection containers, entity-component simulation, full event
  sourcing, effect workers, microservices, and active-session migration remain out of scope.
- Provider-free verification, simulator/emulator compatibility, and physical-device evidence remain
  separate claims.
- Updating this ADR in place intentionally sacrifices the supersession history that a replacement ADR
  would ordinarily preserve; Git history remains the record of the earlier accepted text.

## Supersession

**Supersedes**: None
**Superseded by**: None
