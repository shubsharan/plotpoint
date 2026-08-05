# Plotpoint Core Platform

## Technical Product and Architecture Direction

**Status:** Active architecture direction  
**Audience:** Product and engineering  
**Scope:** Runtime execution, releases, player host, platform services, and code boundaries

---

## 1. Product Definition

Plotpoint is a programmable runtime for location-aware games, interactive stories, puzzle hunts, tours, and alternate-reality experiences.

A game controls its own content, rules, progression, and presentation. Plotpoint provides the durable platform beneath it:

- immutable publishing and installation;
- runtime execution;
- local persistence and recovery;
- device capabilities;
- offline behavior and synchronization;
- shared and authoritative state;
- operational diagnostics.

Plotpoint is not defined by a fixed scene model, a visual rules language, or a catalog of templates. Its core product is a set of stable execution contracts that can support different game structures and mechanics.

### 1.1 Product delivery loop

Plotpoint is delivered through complete playable loops rather than platform layers. Each loop begins
with a concrete game and closes the path from authoring through real play and back to an actionable
learning record:

```text
edit -> validate -> compile -> install -> play -> recover -> learn -> revise
```

Loop 1 is an internally authored location-aware puzzle installed over a local development connection
and then played offline on iOS and Android. Its simulator/emulator implementation gate is accepted;
physical-device field evidence remains deferred behind the recorded blocker. Loop 2 is now the active
implementation loop: one concrete three-player co-op game pulls only the authoritative service,
snapshot synchronization, invitation, revocation, and location-validation contracts that game needs.
Broader capabilities and external creator workflows enter only when a later game requires them.

The platform has four principal parts:

1. **Game project** — TypeScript logic, web UI, content, assets, configuration, and tests.
2. **Compiler and release system** — validation, composition, bundling, manifests, and immutable artifacts.
3. **Player** — a replaceable web runtime inside a stable native host.
4. **Platform services** — releases, sessions, players, authoritative commands, state, and synchronization.

---

## 2. System Model

```text
Game project
  │
  │ compile and validate
  ▼
Immutable release artifact
  │
  ├─────────────────────────────┐
  ▼                             ▼
Player                         Platform services
  ├─ native host                ├─ release registry
  ├─ local database             ├─ sessions and players
  ├─ capability adapters        ├─ authoritative command handling
  ├─ synchronization            ├─ aggregate state and journals
  └─ web runtime                └─ projections and event delivery
       ├─ game logic
       ├─ progression
       └─ game UI
```

The release artifact is the boundary between game development and runtime execution. The host and backend implement platform contracts; they do not interpret mutable project source during play.

---

## 3. Core Architectural Decisions

### 3.1 Releases are immutable

A playable version is compiled into an immutable artifact. A session is pinned to one release unless it is explicitly migrated.

This provides reproducibility, rollback, stable offline installation, and reliable diagnostics. Advancing a release channel affects new sessions; it does not silently alter active ones.

The artifact is content-addressed by its emitted bytes. Reproducible builds are desirable, but they require a pinned and hermetic toolchain and are not assumed merely because the artifact is content-addressed.

### 3.2 Game code and UI execute in the web runtime

Game-specific TypeScript logic and presentation ship with the release and execute in a WebView-hosted runtime. This allows games to change without requiring a new native binary.

The web runtime contains:

- deterministic game logic;
- progression rules;
- selectors and gates;
- resolved web components;
- game UI.

The native host remains stable and owns persistence, identity, device capabilities, networking, installation, and recovery.

### 3.3 Durable state changes occur through commands

UI code does not mutate durable gameplay state directly. It dispatches a typed command.

A command handler:

1. validates input and authority;
2. computes a deterministic transition;
3. produces a semantic outcome;
4. records domain events and post-commit effect intents;
5. commits the accepted transition atomically.

This creates one durable boundary for idempotency, offline behavior, authorization, analytics, and debugging.

### 3.4 Deterministic logic has no ambient authority

Game reducers, gates, and progression rules cannot directly read the clock, generate randomness, access storage, call the network, or invoke device APIs.

External values enter as explicit inputs, observations, or runtime context. This makes transitions reproducible and testable.

### 3.5 Gameplay state is organized into aggregate roots

The initial domain model supports three gameplay aggregate types:

- **player** — personal progress, inventory, clues, health, and role state;
- **team** — shared objectives, discoveries, and team-owned resources;
- **session** — shared world state and session-wide progression.

Local device preferences and installation metadata are not gameplay aggregates. They are host-owned local state.

Each gameplay aggregate has an identity, schema version, state version, and authority rules. A command normally mutates one aggregate. Cross-aggregate behavior is coordinated explicitly rather than hidden inside a distributed transaction.

### 3.6 The server distributes projections, not universal state

Clients receive player-specific read models. Secret answers, hidden roles, anti-cheat data, and operator-only state remain on the server.

A client-side gate can use only data present in its projection. Secret or trusted evaluation is exposed through an authoritative command outcome or a redacted eligibility result.

### 3.7 Effects happen after commit

Reducers describe effect intents; they do not execute side effects.

Notifications, webhooks, scheduled work, analytics delivery, media processing, and external integrations run after the state transaction commits. They are delivered through durable outboxes and must be idempotent.

### 3.8 Composition happens at build time

Game modules, mechanics, components, schemas, and content references are resolved by the compiler. The installed release is complete.

The player does not perform package discovery or npm dependency resolution during play.

### 3.9 Synchronization is domain-aware

Plotpoint synchronizes commands and authoritative results, not arbitrary database rows.

Conflict behavior is defined by the command and aggregate. Inventory, scores, scarce rewards, and secret validation are not resolved with generic last-write-wins merging.

### 3.10 The backend begins as a modular monolith

The initial backend should use explicit domain modules and transactional boundaries inside one application, with a separate worker process for asynchronous work.

Additional services are introduced only for measured scale, isolation, or ownership requirements.

---

## 4. Release Model

A release artifact contains the material required to install and run one game version:

- the web runtime bundle;
- game logic and UI;
- compiled content and progression graph;
- state schemas;
- assets and integrity metadata;
- declared native capabilities;
- release-format and host-API compatibility requirements.

Operational metadata such as project identity, release labels, channels, and creation timestamps belongs to the release registry rather than the content digest.

### 4.1 Compatibility

The initial public compatibility surfaces should remain small:

1. **Release format version** — how the artifact is packaged and interpreted.
2. **Host API version** — the bridge and capability contract available to the web runtime.
3. **Aggregate schema version** — the durable state shape for a game aggregate.

Internal backend APIs may version independently, but they are not part of the game authoring contract.

Before installation, the player verifies artifact integrity, supported release format, host API compatibility, and required capabilities.

### 4.2 Release migration

Release pinning means a new release does not normally migrate an active session.

Game-state migrations are required only when Plotpoint explicitly supports moving an existing session to a new release. That migration must be deterministic, tested against fixtures, and recoverable after interruption.

Host database migrations are a separate concern and must not be confused with game-state migrations.

---

## 5. Runtime Model

### 5.1 State transition contract

The essential runtime contract is:

```ts
type TransitionResult<State, Outcome> = {
  nextState: State;
  outcome: Outcome;
  domainEvents: DomainEvent[];
  effectIntents: EffectIntent[];
};
```

The exact SDK syntax is not yet a platform decision. The important constraint is that command handlers remain deterministic and return data rather than performing I/O.

### 5.2 Command execution modes

The initial runtime supports four operational modes:

- **local** — finalized on the device for locally authoritative state;
- **optimistic** — applied provisionally and later confirmed or rejected by the server;
- **deferred** — recorded offline but not applied as accepted state until server processing;
- **online-only** — requires immediate server evaluation.

A locally finalized command may mutate only local device state or a gameplay aggregate explicitly configured as locally authoritative. Shared, secret, scarce, or competitive state remains server-authoritative.

### 5.3 Journaled state machine

Plotpoint stores current snapshots plus an append-only command journal.

For an accepted transition, the relevant transaction records:

- the command receipt;
- the resulting snapshot and version;
- domain events;
- effect outbox entries;
- synchronization metadata.

The current snapshot is the operational source of truth. Full event replay is not required for normal startup.

This is not full event sourcing. The journal exists for idempotency, synchronization, audit, diagnostics, and selective replay.

### 5.4 Progression

Plotpoint represents an experience as a graph of addressable content and activities. It does not assume one global active scene.

Nodes can be locked, available, active, completed, or skipped. Multiple nodes may be available or active at once.

After an accepted command, the runtime evaluates relevant progression rules and may produce bounded automatic transitions. Automatic transitions are recorded, and the engine must stop with a diagnostic if it detects a cycle or exceeds a configured transition limit.

The exact indexing and invalidation strategy for progression rules is an implementation detail. It should be optimized only after representative games expose a performance need.

### 5.5 Serialization

Durable game state must have a canonical serializable form. The default state model is JSON-compatible.

Functions, class instances, cyclic references, browser handles, and native handles are not valid durable state. Richer values require explicit codecs.

---

## 6. Player Architecture

### 6.1 Web runtime

The web runtime loads the installed release, maintains the current player view, evaluates deterministic logic, and renders the game.

Selectors and UI functions remain inside the web runtime. Functions and closures do not cross the native bridge.

### 6.2 Native host

The native host owns:

- release installation and selection;
- player identity and credentials;
- SQLite persistence;
- secure storage;
- native capabilities;
- command and event inboxes and outboxes;
- synchronization and connectivity handling;
- WebView lifecycle and recovery;
- diagnostics.

The WebView is disposable. Accepted durable progress must survive a WebView reload, process termination, application update, device restart, and temporary loss of connectivity.

### 6.3 Bridge

The bridge is a versioned protocol for serializable requests, responses, and events.

It should expose coarse-grained operations such as:

- load the current runtime view;
- commit an accepted local transition;
- enqueue a server-bound command;
- invoke or subscribe to a declared native capability;
- receive authoritative projection updates;
- report diagnostics.

The exact method names and TypeScript interface are implementation details until the first end-to-end runtime proves them.

### 6.4 Local persistence

The player stores:

- installed release metadata and assets;
- local device state;
- player, team, and session projections;
- local snapshots and journals where applicable;
- outgoing commands;
- incoming authoritative events or projection updates;
- synchronization cursors;
- pending effects;
- recovery diagnostics.

A local transition is acknowledged to the web runtime only after its SQLite transaction commits.

---

## 7. Native Capabilities

Game code requests device functionality through typed host capabilities rather than platform-specific APIs.

Initial capability categories are likely to include location, scanning, maps, media, audio, notifications, and haptics. The exact catalog should follow validated game requirements rather than become a broad platform checklist.

A capability contract defines:

- request and result schemas;
- permission behavior;
- availability and environment constraints;
- whether the operation is one-shot, streaming, or presented as a native surface;
- test and simulation behavior.

Sensor output is an observation, not trusted truth. For example, a location observation includes coordinates, timestamp, accuracy, and available integrity metadata. The game or server determines whether that evidence is sufficient for the requested action.

Every production capability should have a deterministic fake or scripted adapter so games can test routes, scans, permission failures, and degraded sensor quality without physical movement.

---

## 8. Synchronization and Authority

The player and backend exchange commands, acknowledgements, aggregate versions, and player projections.

### 8.1 Required properties

The synchronization protocol must provide:

- stable command IDs and idempotency keys;
- per-aggregate ordering or explicit dependencies;
- optimistic concurrency through expected aggregate versions;
- durable client and server inboxes and outboxes;
- a cursor-based recovery path after disconnects;
- corrective snapshots or events after optimistic rejection.

A single global device queue should not serialize unrelated aggregates.

### 8.2 Conflict policy

Conflict resolution is part of domain design, not storage infrastructure.

Examples:

- local preferences may use last-write-wins;
- append-only attempts may coexist;
- discovered identifiers may use set-union semantics;
- inventory and score changes require authoritative commands and version checks;
- scarce rewards require a single server-authoritative grant.

CRDTs should be introduced only for state with a proven commutative model and a concrete product need.

### 8.3 Server-authoritative code

The initial platform supports authoritative behavior through trusted built-in mechanics and platform modules.

Arbitrary game-authored server code is deferred. If introduced, it must run in an isolated environment with explicit resource, dependency, filesystem, network, and capability limits. It must never execute as an ordinary import inside the core API process.

---

## 9. Platform Services

The backend has five logical responsibilities:

### Releases

Stores immutable artifacts, release records, channels, and compatibility metadata.

### Sessions

Creates sessions, pins releases, manages players and teams, and applies join and role policies.

### Runtime

Accepts commands, enforces idempotency and aggregate versions, executes trusted authoritative handlers, commits snapshots and journals, and produces player projections.

### Delivery

Distributes authoritative updates and executes asynchronous effects through durable outboxes.

### Operations

Collects runtime diagnostics and game-defined analytics without placing them in the command transaction path.

An authoritative command transaction must atomically persist the idempotency receipt, aggregate snapshot and version, command journal, domain events, and effect outbox records. Projection materialization may occur in the same transaction or asynchronously depending on the chosen read-model design; that choice is not yet a platform invariant.

### 9.1 Initial storage choices

The expected initial implementation is:

- PostgreSQL for authoritative state and operational metadata;
- object storage for artifacts and media;
- SQLite in the player;
- a PostgreSQL-backed job/outbox mechanism before introducing separate queue infrastructure.

These are implementation choices, not public Plotpoint contracts. They may change without changing the game runtime model.

---

## 10. Compiler Responsibilities

The compiler is responsible for proving that a game can become a valid release. It should:

- load project configuration;
- enforce environment-specific import boundaries;
- compose selected modules;
- validate state schemas and command registrations;
- validate content and progression references;
- resolve component implementations statically;
- collect capability requirements;
- bundle game logic and web UI;
- package and fingerprint assets;
- emit the release manifest and compatibility metadata.

Additional build features such as a software bill of materials, fully reproducible builds, advanced static cycle analysis, or third-party module signing are useful later but should not be treated as prerequisites for the first runtime.

---

## 11. Mechanics and Modules

A mechanic is a reusable interaction contract, such as a location check-in, scan, puzzle, timer, inventory action, or team vote.

A module may include:

- domain schemas and commands;
- semantic outcomes;
- gates and selectors;
- default web components;
- native capability requirements;
- trusted server handlers where needed;
- tests and simulations.

Mechanics are headless; components are presentation. Multiple components can dispatch the same command and interpret the same semantic outcome.

Module composition occurs at build time. There is no mutable runtime registry.

The exact module manifest shape should emerge from implementing several mechanics. Defining a comprehensive manifest before those mechanics exist would create a speculative abstraction.

---

## 12. Codebase Boundaries

Package names and folder structures are not platform contracts. The repository should begin with the fewest boundaries that correspond to genuinely different execution environments or versioned interfaces.

A reasonable initial monorepo is:

```text
apps/
  player/        native host and embedded web shell
  api/           platform HTTP and synchronization APIs
  worker/        asynchronous effects and build/media work

packages/
  runtime/       pure commands, aggregates, progression, and module contracts
  protocol/      release, bridge, and synchronization wire formats
  compiler/      project validation, composition, bundling, and manifests
  db/            PostgreSQL schema, migrations, transactions, repositories, and outboxes
  modules/       first-party mechanics and their adapters
  testkit/       deterministic fakes, fixtures, and runtime harnesses

examples/        external-consumer-style example games
adr/             architectural decision records
```

This structure is intentionally smaller than the conceptual architecture.

Separate `web-runtime`, `player-host`, or `server-core` packages should be extracted only when they need independent reuse, testing, ownership, or versioning. Starting with those packages before the code demonstrates the boundary would add navigation and dependency overhead without increasing modularity.

Feature code should remain vertically cohesive. A mechanic should not require routine edits across a universal catalog, contracts package, engine package, and several adapter packages.

---

## 13. Engineering Requirements

The architecture must support:

- deterministic reducer and progression tests;
- idempotency and duplicate-delivery tests;
- interruption and recovery tests around local and server transactions;
- projection redaction tests;
- model-based traversal of representative game graphs;
- capability simulations;
- golden release fixtures;
- replay of recorded external observations for diagnostics.

Observability should center on command outcomes, aggregate versions, release identity, synchronization state, capability failures, and recovery events. Raw state and sensitive command inputs must be redacted by schema policy.

Detailed test matrices, dashboards, and metric names belong in engineering plans rather than this platform definition.

---

## 14. Initial Product Boundary

The first complete platform should support:

- external TypeScript game projects;
- web UI and deterministic game logic;
- immutable release artifacts;
- a WebView-hosted runtime in a native player;
- player and session aggregates;
- local persistence and offline recovery;
- typed native capabilities;
- command-based synchronization;
- built-in server-authoritative mechanics;
- player-specific projections;
- a small set of representative mechanics sufficient to prove the architecture.

The following are deliberately outside the initial boundary:

- arbitrary game-authored server code;
- synchronous simulation-style multiplayer;
- cross-session global state;
- generic conflict merging;
- runtime package installation or a component marketplace;
- commerce and entitlements;
- white-label native binaries;
- unrestricted background location execution;
- automatic migration of every active session to every new release.

---

## 15. Decisions Still Requiring ADRs

The architecture intentionally leaves several implementation choices unresolved:

1. **Web runtime isolation** — whether game logic and rendering share one WebView context or logic moves into a Web Worker.
2. **Local transition persistence** — the final bridge contract between transition calculation in the web runtime and atomic persistence in the host.
3. **Projection strategy** — whether player projections are computed on read, transactionally materialized, or asynchronously updated.
4. **Session migration** — the product rules and technical process for explicitly moving an active session between releases.
5. **Background execution** — which mechanics justify background location or other constrained operating-system work.
6. **Custom authoritative extensions** — the isolation technology and SDK, only after built-in mechanics prove insufficient.
7. **Module packaging** — the minimum manifest and dependency model established from real first-party mechanics.

These are open design decisions, not hidden assumptions.

---

## 16. Platform Invariants

1. A session runs one immutable release at a time.
2. The release contains the game-specific logic, UI, content, and assets required for play.
3. Game logic and UI execute in the web runtime; durable storage and device capabilities belong to the native host.
4. Durable gameplay state changes only through typed commands.
5. Deterministic game logic performs no ambient I/O.
6. Player, team, and session state are separate versioned aggregates.
7. A command normally mutates one aggregate.
8. Unauthorized clients never receive server-only state.
9. Effects execute after a committed transition.
10. Cross-process command delivery is idempotent.
11. Synchronization is command- and domain-aware, not generic row replication.
12. Components and modules are resolved into the release at build time.
13. Accepted local progress survives destruction of the WebView.
14. Cursor-based synchronization is the recovery mechanism even when push delivery is available.
15. Arbitrary game code never executes inside core backend processes.
16. Repository packages are extracted from proven boundaries rather than designed in advance.
17. Analytics and telemetry cannot alter game outcomes.
18. Distributed services require an operational reason.

---

## 17. Summary

Plotpoint is built around a small number of durable ideas:

```text
Game source
  → compiled immutable release
  → web runtime inside a stable native host
  → command-driven local state
  → domain-aware synchronization
  → authoritative backend aggregates and player projections
```

The platform should remain opinionated about execution safety, persistence, authority, and compatibility while remaining flexible about game rules and presentation.

The immediate goal is to ship one complete location-aware field-puzzle loop, learn from its field
reports, and revise it without rebuilding the player. Later games must earn broader contracts without
forcing game-specific logic into the player host or backend infrastructure.
