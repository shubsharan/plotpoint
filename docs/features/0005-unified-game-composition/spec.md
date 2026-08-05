---
status: Pending
---

# Feature Specification: Unified Game Composition

**Branch**: `feature/0005-unified-game-composition`
**Epic**: [Plotpoint Core Product Loops](../../epics/0001-plotpoint-core-platform/epic.md)
**PR**: Pending
**Created**: 2026-08-05
**Input**: Unify the game-authoring, runtime, progression, and authoritative multiplayer architecture; repair shared recovery and release-pinned joining; and make the co-op game a genuinely runnable end-to-end reference game.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Play the Co-op Game as One Release (Priority: P1)

A core-team author can validate, compile, install, open, join, and play the co-op game as one
coherent release. The game starts through the same player lifecycle as the field puzzle, renders its
declared experience, requests only its declared capabilities, and submits its first shared action
without game-specific player behavior.

**Why this priority**: The cooperative loop is not complete while its release is only a collection of
independently valid parts. A playable reference game is the evidence needed for every architectural
improvement in this feature.

**Independent Test**: Starting from the co-op game project, complete validation through installation and
mounting, join the release-pinned session, render the initial confirmed team view, and submit one
location-backed target discovery through the ordinary game UI.

**Acceptance Scenarios**:

1. **Given** a valid co-op game project and matching session, **When** a player installs and
   opens the release, **Then** the game mounts successfully and presents its initial playable view.
2. **Given** a mounted co-op game and persisted foreground observation, **When** the player attempts a
   target discovery, **Then** the action is durably queued, decided authoritatively, and reflected in
   the next confirmed view.
3. **Given** a release whose configured application export is missing or has the wrong static contract
   shape, **When** the author validates or compiles it, **Then** the project is rejected before
   installation.
4. **Given** a statically valid application whose `mount` throws or returns an invalid cleanup handle,
   **When** the player opens it, **Then** mounting fails explicitly without committing a playable state.
5. **Given** an unrelated local-only game, **When** it is installed and opened, **Then** the player
   does not display or require cooperative-session controls.

---

### User Story 2 - Author One Coherent Game Definition (Priority: P1)

A game author declares commands, progression, presentation, content, assets, capabilities, and any
trusted authoritative mechanic once. The compiled game uses those declarations as its runtime
composition, and undeclared behavior or unresolved resources cannot become playable accidentally.

**Why this priority**: Duplicate registries and hidden conventions allow the validated project and the
running game to disagree. One inspectable composition truth is necessary for dependable authoring,
runtime behavior, and future multi-game reuse.

**Independent Test**: Define two materially different games using the supported composition model,
compile them, inspect their declared resources and mechanics, and run each without author-maintained
duplicate command or component registries.

**Acceptance Scenarios**:

1. **Given** a project with valid declared modules and resources, **When** it is compiled and opened,
   **Then** every runtime command, progression, component, content item, asset, capability, and trusted
   mechanic resolves from the same validated definition.
2. **Given** a component or mechanic that declares an unknown command, capability, or resource,
   **When** the project is validated, **Then** validation fails with a diagnostic naming the missing
   binding; a later platform-visible operation outside its declared context is rejected by the host.
3. **Given** a trusted authoritative mechanic, **When** the release is registered with the service,
   **Then** the service resolves an explicitly declared supported mechanic and configuration without
   executing release-authored server code.
4. **Given** a project definition and its compiled artifact, **When** an author inspects both, **Then**
   each logical resource and executable role has one stable identity and an inspectable artifact
   binding.

---

### User Story 3 - Express Durable Logic and Progression Consistently (Priority: P2)

A game author defines aggregate identity, valid state, typed commands, semantic decisions, durable
events, post-commit effects, and optional progression as one coherent model. The author does not need
to duplicate the same phase in unrelated state and progression representations or write player
protocol adaptation by hand.

**Why this priority**: The deterministic kernel is valuable only when real games use it through a
clear contract. Consistent command and progression semantics prevent examples from compiling while
failing at execution.

**Independent Test**: Exercise local and shared representative mechanics covering state-changing
acceptance, durable event or effect acceptance, explicit rejection, explicit no-op, heterogeneous
commands advancing one progression, replay, and invalid schema input.

**Acceptance Scenarios**:

1. **Given** a valid command that commits state, progression, an event, or a post-commit effect,
   **When** it is accepted, **Then** exactly one durable aggregate state version is recorded with an
   explainable semantic result.
2. **Given** a command that intentionally changes nothing, **When** it is evaluated, **Then** it
   returns an explicit no-op with no state-changing outputs.
3. **Given** several command types that advance one progression, **When** each command is accepted,
   **Then** progression evaluates from their shared aggregate facts without unsafe command-specific
   assumptions.
4. **Given** state, payload, outcome, event, effect, or progression data that does not match the
   aggregate model, **When** execution is attempted, **Then** it fails before an invalid durable result
   can be committed.
5. **Given** a game with no need for platform-managed progression, **When** it is authored, **Then** it
   can omit progression rather than maintain decorative duplicate state.

---

### User Story 4 - Disconnect, Restart, and Converge Exactly Once (Priority: P2)

A participant can queue several shared actions while disconnected, restart at any synchronization
boundary, reconnect, and reach the complete current authorized view. Every action reaches one stable
terminal result without repeated submission loops, lost evidence, or manual reset.

**Why this priority**: Durable offline intent and deterministic recovery are core product promises.
The synchronization path must work as a complete state machine, not only as isolated storage and
service operations.

**Independent Test**: Queue multiple commands, interrupt before and after each submission and pull
boundary, force normal and corrective snapshot recovery, and verify ordered draining, exact terminals,
and convergence after every restart point.

**Acceptance Scenarios**:

1. **Given** multiple queued commands, **When** synchronization begins, **Then** one pass selects each
   command eligible at the start at most once in stable order, performs at most one pull, and terminates;
   commands queued later are handled by a subsequent pass.
2. **Given** a response-lost submission, **When** synchronization retries, **Then** the original server
   result is recovered and the action reaches one local terminal.
3. **Given** a corrective snapshot containing previously recorded results, **When** it is applied more
   than once, **Then** projection replacement, result preservation, outbox reconciliation, and cursor
   advancement remain idempotent and atomic.
4. **Given** overlapping requests to synchronize one session, **When** they execute, **Then** one
   bounded synchronization run owns the session and all callers observe its eventual result.
5. **Given** a revoked participant with queued actions, **When** synchronization is attempted, **Then**
   the actions remain as blocked evidence and no further authoritative submission occurs.

---

### User Story 5 - Enforce Release-Pinned Shared Play (Priority: P3)

A player can join shared play only when the installed game run, session, authorized snapshot, and
persisted local session all identify the same immutable release. Conflicting retries or attempts to
attach a session to a different game fail without changing the prior playable state.

**Why this priority**: Release identity is the boundary connecting authored behavior, authoritative
configuration, and recovery. A mismatch can present one game's UI over another game's shared state.

**Independent Test**: Attempt fresh, duplicate, response-lost, wrong-release, wrong-session, wrong-team,
changed-service, and changed-run joins and verify that only exact or safely recoverable bindings persist.

**Acceptance Scenarios**:

1. **Given** matching installed, session, and snapshot release identities, **When** a participant joins,
   **Then** one durable shared-session binding is created and survives restart.
2. **Given** any release identity mismatch, **When** join or pull data is processed, **Then** the
   operation fails before projections, credentials, or session bindings become usable by the game.
3. **Given** an existing shared-session binding, **When** an exact join response is replayed, **Then**
   it returns the original binding without rewriting immutable identity fields.
4. **Given** an existing binding and changed run, release, session, participant, team, or service identity,
   **When** a conflicting response is processed, **Then** the prior binding remains unchanged and an
   explicit conflict is reported.

### Edge Cases

- A configured application export is missing or statically malformed, or its statically valid `mount`
  throws or returns an invalid cleanup handle at runtime.
- A command or content identity appears in source behavior but is absent from the project definition,
  or the same identity is bound to incompatible roles.
- An authoritative mechanic is unknown, unsupported at the declared version, missing configuration,
  or paired with the wrong aggregate schema.
- A command commits an event or effect while leaving canonical state unchanged, or claims no-op while
  emitting durable outputs.
- A progression receives heterogeneous commands, simultaneous eligible transitions, a conflict, a
  cycle, or a transition-limit overrun.
- Synchronization is interrupted after durable enqueue, before submit, after server decision, before
  pull, during snapshot replacement, or after local commit but before notification.
- A corrective pull repeats retained terminal results whose original outbox rows are already gone.
- Several UI actions request synchronization concurrently, including while the device changes between
  offline, degraded, and online states.
- A join response or later snapshot changes release, run, session, participant, team, membership, or
  service binding unexpectedly.
- A local-only release, shared release, and future player-specific release are installed in succession
  without rebuilding the player.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every playable release MUST expose one application lifecycle whose definition shape is
  compiler-validated and whose mount result is runtime-validated. It MUST start through the standard
  player runtime and return an explicit cleanup handle that the player invokes before remount or
  disposal. The player MUST also roll back every component cleanup registered by a mount that throws or
  returns an invalid handle, without exposing disposal authority to the application.
- **FR-002**: The validated project definition MUST be the sole composition authority for commands,
  aggregate models, progression, components, content, assets, capabilities, and the optional trusted
  mechanic binding.
- **FR-003**: The generated runtime adapter MUST consume the compiler-resolved composition and MUST NOT
  require author-maintained duplicate command, progression, or component registries. It MUST pass the
  application only a root and generated component factories; durable state reads and subscriptions MUST
  remain component-scoped.
- **FR-004**: Every declared logical resource MUST resolve to exactly one inspectable artifact role,
  and unresolved, ambiguous, or incompatible bindings MUST prevent compilation.
- **FR-005**: Compilation MUST reject unknown declared references, and the runtime or host MUST reject
  any platform-visible command, resource, capability, aggregate model, or trusted mechanic operation
  absent from the caller's validated project composition.
- **FR-006**: Component declarations MUST name their platform-visible command, content, asset,
  capability, and optional shared-projection dependencies, and each component MUST receive a
  runtime context that resolves only those declared dependencies. The context MUST also expose pure
  durable-local-view reads and post-commit change notification without direct persistence mutation.
- **FR-007**: A release MUST declare at most one trusted authoritative mechanic. When present, the
  binding MUST declare a stable identity and version, accepted command types, aggregate model,
  configuration input, and projection schema identity/version, and MUST bind the matching platform-owned
  initialization, decision, validation, and projection roles.
- **FR-008**: The authoritative service MUST resolve only the supported trusted mechanic declared by
  the release; its platform adapter MUST own the complete resolved server model, handlers, validators,
  and projection, each validator MUST identify the exact inventoried schema digest it implements, and
  the service MUST NOT execute release-authored server code. Trusted Mechanic MUST NOT supply hidden
  server progression.
- **FR-009**: Aggregate models MUST bind authority/kind, exact state and initialization schemas,
  deterministic initialization, validation, and typed durable event/effect declarations. Each command
  and optional progression MUST reference exactly one compatible aggregate model; models MUST NOT
  repeat those relationships. Command type MUST be unique within each derived model command set, and
  heterogeneous registries MUST invoke typed logic only after state- and payload-specific schema narrowing.
- **FR-010**: Command handling MUST distinguish accepted, rejected, no-op, and invalid decisions
  explicitly. Local recorded terminals MUST retain their full schema-validated outcome. Shared recorded
  terminals MUST preserve the exact Sync participant-visible result through a lossless trusted-outcome
  restriction and deterministic invalid-diagnostic mapping. Preflight invalidity MUST remain a local
  non-committable result.
- **FR-011**: One accepted command MUST advance the aggregate state version exactly once whenever it commits
  state, progression, a durable event, or a post-commit effect. An effect-only acceptance MUST durably
  record its effect intent and resulting state version, but this feature MUST NOT add generalized effect
  delivery, workers, or retry infrastructure.
- **FR-012**: A no-op MUST preserve aggregate state and state version and MUST emit no durable event, effect,
  or progression change.
- **FR-013**: Progression MUST be optional, MUST have one authoritative state representation when used,
  and MUST support facts produced by multiple command types without unsafe payload or outcome assumptions.
- **FR-014**: The runtime MUST provide a canonical initial progression instance from its validated
  definition when progression is used.
- **FR-015**: Local runtime adaptation MUST resolve the correct aggregate model, command, and optional
  progression and map the complete result to the host contract without game-specific protocol glue.
- **FR-016**: Shared commands MUST move through an explicit durable lifecycle that prevents the same
  queued row from being selected indefinitely while preserving safe exact retry after interruption.
- **FR-017**: At most one synchronization run per shared session MUST submit queued work and apply a
  pull at a time.
- **FR-018**: One synchronization pass MUST select each command eligible when the pass starts at most
  once in stable order, perform at most one pull, terminate, and persist honest transport and recovery
  status visible to the game; later enqueues MUST request a subsequent pass.
- **FR-019**: Corrective and repeated snapshots MUST be idempotent even when retained terminal results
  no longer have corresponding outbox rows.
- **FR-020**: Snapshot replacement, result reconciliation, outbox reconciliation, cursor advancement,
  and membership changes MUST remain atomic. An authenticated revocation MUST atomically mark local
  membership revoked and every queued or submitting action blocked before credential removal.
- **FR-021**: Every shared projection MUST match the release-declared schema ID, version, and digest and
  pass payload validation before persistence or component exposure.
- **FR-022**: The player MUST reserve at most one pending-or-bound shared session per run and make the
  exact join request plus its secret references durable before the first network attempt. Parallel or
  changed joins for the run MUST conflict before submission. Joining shared play MUST then prove equality
  among the installed run release, join response release, authorized snapshot release, and persisted
  shared-session release before exposing the view.
- **FR-023**: Exact join retries MUST preserve the original immutable run, release, session, participant,
  team, and service binding; changed reuse MUST fail without partially updating it.
- **FR-024**: Shared bridge errors for a well-formed request MUST preserve its request identity so the
  caller always reaches a terminal response.
- **FR-025**: Local-only releases MUST remain playable without shared-session controls or shared
  persistence requirements.
- **FR-026**: The co-op game MUST use the ordinary compiled-release lifecycle, generated
  composition, generic shared-play contract, and trusted mechanic binding without game-specific
  player routing.
- **FR-027**: The field puzzle and co-op game MUST both pass one external-consumer-style
  compile, install, mount, action, recovery, and report acceptance path appropriate to their authority.
- **FR-028**: Existing immutable release identity, deterministic replay, atomic local persistence,
  privacy redaction, authorization, and trusted-code boundaries MUST remain intact or change only
  through an explicitly accepted architecture decision.
- **FR-029**: Every Project Configuration release MUST export one host-owned Game Play Report
  selected only by run and optional shared-session binding. The export MUST NOT execute release code,
  select a game-specific report builder, or include game-specific completion fields, protected values,
  credentials, precise locations, service identities, or raw durable state.
- **FR-030**: Provider-free behavior, simulated native compatibility, and physical-device evidence
  MUST remain separately reported; this feature MUST NOT infer physical acceptance from other gates.
- **FR-031**: The compiler, player, and report readers MUST accept only the corrected contracts.
  They MUST NOT provide compatibility aliases, legacy parsers, artifact/report migrations, or automatic
  database resets. Incompatible artifacts MUST require recompilation, and an incompatible player
  database MUST fail with explicit reset or reinstall guidance.

### Key Entities

- **Game Application**: The single validated lifecycle that mounts a compiled game using its resolved
  runtime composition and host capabilities.
- **Game Composition**: The authoritative set of aggregate models, commands, progression, components,
  content, assets, capabilities, resources, and optional trusted mechanic selected for one release.
- **Aggregate Model**: The schema-identified durable state boundary with initialization, validation,
  events, effects, and command/progression membership derived from one-way registrations.
- **Progression Ruleset**: Optional deterministic activity-status model driven by accepted aggregate
  facts and represented once in durable aggregate state.
- **Trusted Mechanic Binding**: Declaration connecting a release to one supported
  platform-owned authoritative mechanic and its configuration, aggregate, commands, and projection.
- **Shared Session Binding**: Immutable relationship among one game run, release, service session,
  participant, team, service location, membership, and recovery cursor.
- **Shared Action**: One durable game intent with stable identity, target, expected state version,
  observations, lifecycle status, and eventual exact terminal.
- **Authorized Snapshot**: Complete current shared view plus participant terminal results and recovery
  cursor, safe to apply atomically and repeatedly.
- **Game Play Report**: Deterministic host-owned evidence export for one run and its optional immutable
  shared binding, containing generic lifecycle, command, capability, synchronization, recovery, and
  redacted diagnostic events rather than game-specific state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The field puzzle and co-op game each complete one validate-to-first-action path
  and one report-export path through the same installed-game lifecycle with zero game-specific player
  branches.
- **SC-002**: 100% of reference releases missing or statically mis-shaping their application definition
  are rejected before installation; 100% whose mount throws or returns an invalid handle fail explicitly
  before playable state is exposed.
- **SC-003**: 100% of runtime commands, resources, capabilities, and the trusted mechanic used by the
  two reference games are traceable to one declared composition identity with zero hidden bindings.
- **SC-004**: Across 100 queued-action retries and every recorded synchronization interruption point,
  each shared action reaches exactly one terminal; every pass selects each start-eligible row at most
  once, performs at most one pull, and terminates.
- **SC-005**: Applying the same normal, corrective, or revoked authorized snapshot 100 times produces
  the same confirmed view, terminal set, outbox state, membership, and cursor as applying it once.
- **SC-006**: 100% of mismatched release, run, session, participant, team, or service join fixtures,
  including parallel changed joins for one run, perform no conflicting network submission, expose no
  mismatched game view, and leave the prior durable reservation or binding unchanged.
- **SC-007**: Representative accepted, rejected, no-op, recorded execution-invalid, event-only,
  effect-only, and progression-changing commands preserve their exact terminal and aggregate state version
  across execution, persistence, recovery, and replay. Representative preflight-invalid commands return
  locally with no receipt, observation consumption, or durable mutation across 100 repeats.
- **SC-008**: An author can add or change one reference-game mechanic without editing duplicate runtime
  registries or game-specific player routing.
- **SC-009**: The complete cooperative provider-free lifecycle covers installation, mounting, joining,
  multiple queued discoveries, response loss, restart, corrective recovery, revocation, generic Game
  Play Report export with no target-specific fields, and a changed release that starts a fresh
  run and session without active-session migration or manual state repair.
- **SC-010**: All privacy, authorization, deterministic replay, immutable artifact, and failure-atomicity
  regression gates pass with zero newly exposed credentials, precise locations, protected content, or
  raw durable state.

## Assumptions

- This feature repairs and integrates the existing field puzzle and co-op game; it does not add
  a new game, external creator workflow, secret-role projections, or hostile-code execution.
- The data-only project definition and immutable release remain the canonical portable boundary.
- Release code remains trusted internal code in the existing single game view.
- Trusted authoritative mechanics remain platform-owned and execute in the existing modular service;
  releases select supported mechanics but do not provide server-executed code.
- The co-op game retains one session, one team, one team aggregate, foreground synchronization,
  and complete authorized snapshots.
- General plugin loading, dependency injection containers, full event sourcing, entity-component
  simulation, microservices, WebSockets, background synchronization, delta feeds, and generalized
  cross-aggregate orchestration remain out of scope.
- Physical-device field validation remains governed by the existing product gates and is not required
  to establish provider-free architecture correctness in this feature.

## Architecture Decisions

- [ADR-0001: Integrated Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md)
- [ADR-0002: Immutable Release Format](../../adrs/0002-immutable-release-format.md)
- [ADR-0003: Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md)
- [ADR-0004: Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md)
- [ADR-0005: Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md)
- [ADR-0006: Unversioned Contract Names](../../adrs/0006-unversioned-contract-names.md)
