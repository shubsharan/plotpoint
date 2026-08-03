# Plotpoint Product Roadmap

- **Status:** Initial platform roadmap; no gate is complete
- **Authority:** [Plotpoint Core Platform](product.md)
- **Delivery model:** Evidence-gated, not date-based

## Purpose

This roadmap sequences the smallest complete Plotpoint platform: an external TypeScript game can be compiled into an immutable release, installed in a durable native player, and run across local and authoritative state without moving game-specific logic into the host or backend.

The product document defines the platform model, boundaries, and invariants. This roadmap defines delivery order and the evidence required to advance. A gate is complete only when its exit evidence exists and its dependencies are complete. Package creation, interface sketches, and isolated demonstrations do not satisfy a gate by themselves.

Plotpoint is currently at the architecture and workspace-scaffolding stage. Gate 1 is the first unsatisfied gate.

## Delivery Epics

<!-- speckit:generated:roadmap-epics START -->

- [Deterministic Runtime Core](epics/0001-deterministic-runtime-core/epic.md) — Active

<!-- speckit:generated:roadmap-epics END -->

## Compatibility Surfaces

The initial public compatibility surface remains limited to three independently versioned contracts:

| Surface          | Responsibility                                                                                          | First proven in |
| ---------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| Release format   | Packages and describes an installable immutable game release                                            | Gate 2          |
| Host API         | Connects the web runtime to persistence, synchronization, diagnostics, and declared native capabilities | Gate 3          |
| Aggregate schema | Identifies and evolves durable player, team, and session state                                          | Gate 1          |

Command, transition, capability, projection, and synchronization contracts are required implementation outputs. Their exact API and wire shapes must be established by the vertical slices below rather than fixed speculatively in this roadmap.

## Gate 1: Deterministic Runtime Core

### Outcome

Game logic can execute, explain, and test durable state transitions without ambient I/O or dependence on a player, database, network, clock, randomness source, or device API.

### Deliverables

- Typed commands, semantic outcomes, domain events, and post-commit effect intents.
- Versioned player, team, and session aggregate contracts with canonical JSON-compatible state.
- Deterministic transition execution with explicit external observations and runtime context.
- Progression graphs that support multiple available or active nodes and bounded automatic transitions.
- A test harness with deterministic clocks, identifiers, randomness, observations, and capability fakes.

### Dependencies

None.

### Exit Evidence

- Repeated execution over identical inputs produces identical state, outcomes, events, and effect intents.
- Tests prove reducers cannot perform side effects and that effects are returned as data for post-commit execution.
- Invalid durable values, stale aggregate versions, progression cycles, and automatic-transition limit overruns fail with explicit diagnostics.
- Fixtures exercise player, team, and session transitions without hidden cross-aggregate mutation.
- Model-based graph tests cover branching, parallel availability, completion, skipping, and bounded automatic progression.

## Gate 2: Immutable Release Pipeline

### Outcome

An external game project can be validated and compiled into a complete, content-addressed release that the platform can inspect before installation.

### Deliverables

- Project configuration and environment-specific import validation.
- Build-time composition of game logic, UI, content, modules, components, schemas, and assets.
- A versioned release manifest containing integrity metadata, capability declarations, and release-format and host-API requirements.
- Static validation of commands, aggregate schemas, progression references, component resolution, and asset references.
- Golden release fixtures built from external-consumer-style example projects.

### Dependencies

Gate 1.

### Exit Evidence

- The same frozen project and pinned toolchain produce an installable artifact whose emitted bytes determine its identity.
- A release can run without project source, package discovery, or dependency resolution at play time.
- Missing content, invalid schemas, forbidden imports, unresolved components, and incompatible requirements fail before publication.
- Integrity checks detect altered manifests, bundles, content, and assets.
- Release labels, channels, project identity, and creation timestamps remain outside the content digest.

## Gate 3: Durable Offline Player

### Outcome

A single player can install and play a local-first game through the web runtime, lose the WebView or process, and resume accepted progress without network access.

### Deliverables

- ADRs for web-runtime isolation and the atomic local-transition persistence contract.
- A replaceable web runtime inside a stable native host, connected through a versioned serializable bridge.
- SQLite-backed installed releases, local snapshots, command journals, synchronization metadata, and recovery diagnostics.
- Local command execution and progression using only explicitly locally authoritative state.
- One external example game proving UI, deterministic logic, local progression, installation, and offline recovery end to end.

### Dependencies

Gates 1 and 2.

### Exit Evidence

- The player rejects corrupted releases, unsupported release formats, incompatible host APIs, and unavailable required capabilities before launch.
- UI code changes durable state only by dispatching typed commands.
- A local transition is acknowledged to the web runtime only after its SQLite transaction commits.
- Accepted progress survives WebView reload, process termination, application restart, device restart simulation, and temporary loss of connectivity.
- Replaying recorded observations reproduces the transition and its diagnostic explanation without physical device input.

## Gate 4: Authoritative Platform Services

### Outcome

Multiple players can join a release-pinned session and execute trusted authoritative mechanics while receiving only the state each player is allowed to observe.

### Deliverables

- An ADR selecting the initial player-projection materialization strategy.
- Modular-monolith release, session, player, team, runtime, delivery, and operations modules.
- PostgreSQL transactions for idempotency receipts, aggregate snapshots and versions, command journals, domain events, and durable effect outboxes.
- Player-specific projections with schema-directed redaction of secrets and sensitive command data.
- A separate worker for idempotent post-commit effects using the PostgreSQL-backed outbox.
- Built-in trusted authoritative handlers; no arbitrary game-authored code executes in the API or worker process.

### Dependencies

Gates 1 and 2.

### Exit Evidence

- Duplicate authoritative commands return the original result without applying state or effects twice.
- A forced failure at every transaction boundary leaves either the complete accepted transition or no accepted transition.
- Concurrent commands enforce expected aggregate versions and cannot silently overwrite authoritative inventory, scores, rewards, or secrets.
- Projection tests prove two players can receive different views and that server-only fields never reach unauthorized clients or telemetry.
- Effect delivery starts only after commit and remains safe across worker interruption and redelivery.
- Advancing a release channel affects new sessions while existing sessions remain pinned to their original release.

## Gate 5: Domain-Aware Synchronization

### Outcome

The player and platform converge after disconnection, duplication, rejection, and reordering without treating gameplay state as generic replicated rows.

### Deliverables

- Local, optimistic, deferred, and online-only command paths with explicit authority rules.
- Durable client and server inboxes and outboxes using stable command IDs and idempotency keys.
- Per-aggregate ordering, explicit dependencies, expected-version checks, and independent queues for unrelated aggregates.
- Cursor-based recovery with authoritative acknowledgements, projection updates, and corrective snapshots or events.
- Domain-specific conflict behavior for local preferences, append-only attempts, discovered identifiers, scarce resources, and shared state.

### Dependencies

Gates 3 and 4.

### Exit Evidence

- Interruption tests at each enqueue, transmit, commit, acknowledge, and projection-delivery boundary lose no accepted command and apply none twice.
- Optimistic rejection removes or corrects provisional state and explains the authoritative outcome to the game runtime.
- Deferred and online-only commands cannot be presented as accepted while authoritative evaluation is unavailable.
- Unrelated aggregates continue synchronizing when one aggregate is blocked or conflicted.
- Cursor recovery reaches the same player projection after missed push delivery, reordered messages, duplicate messages, and extended offline operation.

## Gate 6: Capabilities and Representative Mechanics

### Outcome

Games can combine deterministic progression, foreground device observations, and authoritative shared actions through reusable headless mechanics without platform-specific game code.

### Deliverables

- Typed foreground location and scanning capabilities with permission, availability, quality, and simulation behavior.
- A local puzzle or progression mechanic, a sensor-driven check-in mechanic, and an authoritative shared-state mechanic.
- Presentation components that remain replaceable and dispatch the same mechanic commands and interpret the same semantic outcomes.
- Deterministic and scripted adapters for success, denial, unavailability, degraded accuracy, invalid scans, retries, and interruption.
- An ADR capturing the minimum module manifest and dependency model demonstrated by the implemented mechanics.

### Dependencies

Gates 1 through 5.

### Exit Evidence

- Game code accesses device functionality only through declared host capabilities.
- Location and scan results remain observations with timestamp and quality metadata; neither is treated as trusted proof by the host.
- The same mechanic runs against production and scripted capability adapters without changing game logic.
- Local, sensor-driven, and authoritative mechanics compose into releases at build time with no mutable runtime registry.
- At least two distinct components can present one headless mechanic without changing its durable command or outcome contract.

## Gate 7: Initial Platform Proof

### Outcome

Several materially different games validate that Plotpoint's contracts are reusable, recoverable, compatible, and operationally diagnosable without embedding game-specific rules in platform infrastructure.

### Deliverables

- At least three external example games: an offline location-aware tour, a cooperative puzzle hunt, and a player-specific secret or role-based experience.
- Coverage across player, team, and session aggregates; local and authoritative commands; foreground capabilities; projections; and offline recovery.
- A compatibility matrix for supported release-format, host-API, and aggregate-schema versions.
- Release publication, installation, channel advancement, rollback for new sessions, and diagnostics tied to release and command identity.
- End-to-end interruption, duplicate-delivery, projection-redaction, progression-traversal, capability-simulation, and artifact-integrity suites.

### Dependencies

Gates 1 through 6.

### Exit Evidence

- Each example compiles from an external project into an immutable artifact, installs in the player, and completes its representative play path.
- Game-specific logic, progression, content, and presentation remain in the release; the native host and backend contain only platform contracts and trusted built-in mechanics.
- Accepted local and authoritative progress survives the tested WebView, process, device, network, API, database-transaction, and worker interruptions.
- Secret and operator-only state remains absent from player projections, diagnostics, and analytics.
- Compatibility failures are detected before play, while supported releases retain stable behavior across player and backend updates.
- Operational records can trace a reported outcome through release identity, command receipt, aggregate versions, synchronization state, capability observations, and recovery events.

## Initial Platform Completion

The initial platform is complete only when Gate 7 closes with all prior gate evidence intact. At that point Plotpoint must demonstrate, rather than merely specify, that:

- external TypeScript games can own their logic, web UI, content, rules, and progression;
- immutable releases can be installed and run through a stable native host;
- player, team, and session state changes only through deterministic typed commands;
- accepted local progress is durable offline and authoritative shared state converges after recovery;
- native capabilities are typed, declared, simulated, and separated from trusted game decisions;
- server-only state remains server-only while players receive useful projections;
- built-in mechanics and platform services support materially different game structures without creating game-specific infrastructure.

## Outside the Initial Roadmap

The following work requires separate product evidence and roadmap approval:

- migration of active sessions between releases;
- background location or other unrestricted background execution;
- arbitrary game-authored authoritative server code;
- synchronous simulation-style multiplayer;
- cross-session global state or generic conflict merging;
- runtime package installation, third-party module distribution, or a component marketplace;
- commerce, entitlements, and white-label native binaries;
- fully hermetic reproducible builds, software bills of materials, and third-party module signing;
- new distributed services without a measured scale, isolation, or ownership requirement.

Until those needs are validated, release pinning, foreground capabilities, trusted built-in mechanics, and the modular monolith remain the product boundary.
