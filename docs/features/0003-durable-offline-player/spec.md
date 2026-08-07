---
status: Active
---

# Feature Specification: Durable Offline Field Puzzle

**Branch**: `feature/0003-durable-offline-player`
**Epic**: [Plotpoint Core Product Loops](../../epics/0001-plotpoint-core-platform/epic.md)
**PR**: Pending
**Created**: 2026-08-03
**Input**: Replace the platform-first player gate with Loop 1: edit, validate, compile, QR install,
offline field play, recover, export a redacted report, revise, and reinstall while establishing the
smallest reusable player contract for later games.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Install a Field Puzzle From Its Release (Priority: P1)

A core-team author can change a clue, checkpoint, or accuracy requirement, compile one immutable
release, make it available on the local network, and scan it into the mobile player. The player makes
only a complete, expected, compatible release playable and retains an existing playable installation
when a candidate fails.

**Why this priority**: The product loop cannot begin until an authored change reaches a field device
without rebuilding the player.

**Independent Test**: Compile a changed field-puzzle release, scan it on a device, disconnect the
device, and launch it. Repeat with altered bytes, the wrong expected identity, unsupported
requirements, an oversized transfer, a timeout, and interruption at every installation boundary.

**Acceptance Scenarios**:

1. **Given** a complete compatible release and its expected identity, **When** the author serves it
   and the player scans its installation code, **Then** the exact release becomes playable with its
   identity and requirements visible.
2. **Given** altered bytes, an identity mismatch, an unsupported requirement, an excessive size, or
   an interrupted transfer, **When** installation is attempted, **Then** the candidate never becomes
   playable and any prior installation remains intact.
3. **Given** a successfully installed release, **When** connectivity is removed before launch,
   **Then** the release starts without project source, author dependencies, or network access.
4. **Given** two materially different compatible releases, **When** each is installed and launched,
   **Then** both use the same Host API without game-specific player changes.

---

### User Story 2 - Complete a Location-Aware Puzzle Offline (Priority: P2)

A player can visit two configured checkpoints with an intervening puzzle while offline. The game owns
the checkpoint coordinates, radii, accuracy policy, clues, and progression. The host supplies explicit
foreground observations and does not treat sensor output as trusted proof by itself.

**Why this priority**: This is Plotpoint's first differentiated playable product, not merely a player
shell or storage demonstration.

**Independent Test**: Complete the route with connectivity disabled using both scripted observations
and real foreground locations. Exercise permission denial, unavailable location, stale observations,
and inadequate accuracy without advancing progress.

**Acceptance Scenarios**:

1. **Given** the player is within the first checkpoint's configured radius with acceptable accuracy,
   **When** the game consumes a fresh observation, **Then** the first clue unlocks through an accepted
   typed command.
2. **Given** the player solves the intervening puzzle, **When** the answer command is accepted, **Then**
   the second checkpoint becomes available.
3. **Given** an acceptable observation at the second checkpoint, **When** its command is accepted,
   **Then** the route completes.
4. **Given** denied permission, unavailable service, a stale observation, poor accuracy, or an
   out-of-radius location, **When** a checkpoint is attempted, **Then** the player receives an explicit
   outcome and durable progression does not advance.

---

### User Story 3 - Resume Accepted Progress Exactly Once (Priority: P3)

A player can destroy the game view or terminate and restart the application before, during, or after
a field action and resume the latest accepted progress without repeating or losing it. An accepted
command becomes visible only after its durable transition commits.

**Why this priority**: Field play must remain trustworthy when mobile operating systems discard views
or processes.

**Independent Test**: Interrupt installation, location capture, transition calculation, durable
commit, and result delivery. Restore the application and verify that each command is either absent or
present once as a complete accepted transition.

**Acceptance Scenarios**:

1. **Given** a transition has not committed, **When** the view or process disappears, **Then** recovery
   does not present it as accepted and leaves no partial durable transition.
2. **Given** a transition committed before interruption, **When** the player restarts, **Then** the
   release, aggregate version, progression, and original command result are restored exactly once.
3. **Given** the same command identity is delivered again, **When** the host handles it, **Then** the
   original durable result returns without advancing state or the journal again.
4. **Given** durable records cannot be validated, **When** launch is attempted, **Then** the player
   stops with a diagnostic instead of inventing or silently resetting progress.

---

### User Story 4 - Learn, Revise, and Start a Fresh Run (Priority: P4)

After field play, the core team can export a redacted report that explains the release, command
outcomes, progression, observation quality, interruptions, recoveries, and failures well enough to
make a concrete game revision. Installing changed release bytes creates a distinct release and fresh
run without migrating the prior run.

**Why this priority**: The product loop closes only when real play produces useful learning and that
learning reaches a revised playable release.

**Independent Test**: Export a report after a successful and a failed route, inspect its privacy
boundary, change one game input based on the report, install the new release, and begin a separate run.

**Acceptance Scenarios**:

1. **Given** a completed or interrupted run, **When** the user exports its report, **Then** the report
   correlates release, run, command outcomes, versions, progression changes, observation quality bands,
   recovery events, and diagnostic codes.
2. **Given** a report export, **When** it is inspected, **Then** it contains no raw coordinates,
   credentials, command payloads, raw aggregate state, or protected content.
3. **Given** the author changes a clue, coordinate, or radius and compiles again, **When** the new
   release is installed, **Then** it has a distinct release identity and starts a fresh run while the
   previous run remains intact.

### Edge Cases

- The installation code names a non-private address, redirects outside the private network, changes
  descriptor values between reads, or serves more bytes than declared.
- Multiple network interfaces are present, no private interface is available, or the device cannot
  reach the author's machine.
- The same release is installed twice or two installations for one identity race.
- The application loses permission or location availability between observation request and result.
- A location timestamp is in the future, too old, malformed, or paired with invalid accuracy.
- The game view submits malformed, unknown, duplicated, stale-version, wrong-aggregate, or
  unreferenced-observation transitions.
- The view disappears after commit but before acceptance is delivered.
- Export is attempted with no run, during an active transition, or after local records fail validation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The author MUST be able to validate, compile, and locally serve one complete immutable
  release without a hosted Plotpoint service.
- **FR-002**: Local serving MUST expose an installation description containing the release
  location and expected content identity and MUST reject invalid release input before advertising it.
- **FR-003**: The player MUST accept local installation descriptions only from eligible private-network
  sources and MUST bound transfer size and duration.
- **FR-004**: The player MUST verify the complete artifact and expected identity and assess format,
  host, aggregate-schema, and capability compatibility before executing game code or publishing the
  installation.
- **FR-005**: Failed, interrupted, altered, excessive, timed-out, or incompatible candidates MUST NOT
  become playable or displace an existing playable installation.
- **FR-006**: A published installation MUST contain every verified release entry needed for later
  launch without project source, package discovery, dependency resolution, or network access.
- **FR-007**: The player MUST run trusted release logic and presentation inside a replaceable game
  view whose navigation, remote network access, storage, and native authority are controlled by the
  host.
- **FR-008**: The game view and host MUST communicate through a closed, compatibility-checked, serializable
  protocol with stable request identities and explicit error results.
- **FR-009**: The host MUST own installed releases, runs, aggregate snapshots, command receipts,
  journals, observations, recovery records, and exported report material.
- **FR-010**: Each durable gameplay change MUST originate from a typed command targeting one explicit
  aggregate identity and expected version.
- **FR-011**: Before accepting a candidate transition, the host MUST validate command identity,
  aggregate target, expected version, canonical result shape, schemas, and referenced observations.
- **FR-012**: A locally accepted command MUST atomically persist its receipt, resulting snapshot and
  version, journal entry, semantic outcome, and observation links before acceptance is reported.
- **FR-013**: A repeated command identity MUST return its original durable result without advancing
  state, progression, or journal more than once.
- **FR-014**: Rejected, malformed, stale, incompatible, unauthorized, or interrupted pre-commit
  transitions MUST leave durable gameplay state unchanged.
- **FR-015**: The player MUST reconstruct the current view from the selected installed release and
  host-owned durable records whenever the game view is created or recreated.
- **FR-016**: Accepted progress MUST survive game-view destruction, application termination,
  application restart, device restart simulation, and loss of connectivity.
- **FR-017**: The host MUST provide a one-shot foreground location observation containing stable
  identity, capture time, coordinates, accuracy, and availability or permission outcome.
- **FR-018**: The host MUST persist a successful observation before returning it to game logic, and a
  command MUST explicitly identify each observation it consumes.
- **FR-019**: Checkpoint coordinates, radii, maximum acceptable accuracy, freshness rules, clues, and
  progression MUST be defined by the game release rather than the host.
- **FR-020**: Permission denial, unavailable location, stale input, inadequate accuracy, and
  out-of-radius input MUST produce explicit non-progressing outcomes.
- **FR-021**: The flagship game MUST include two location checkpoints and one intervening puzzle and
  MUST be completable with connectivity disabled after installation.
- **FR-022**: The player MUST export a report containing release and run identities, relative
  timing, command outcomes, versions, progression changes, location quality bands, interruption and
  recovery events, and diagnostic codes.
- **FR-023**: Exported reports MUST exclude raw coordinates, credentials, command payloads, raw
  aggregate state, and protected content.
- **FR-024**: Installing changed release bytes MUST create a distinct installation and fresh run and
  MUST NOT migrate the active state of an earlier release.
- **FR-025**: The complete edit-to-revision loop MUST pass the provider-free conformance fixtures, and
  the same dependency-aligned native player MUST build, install, and launch on one iOS simulator and
  one Android emulator without platform-specific game or release-contract changes.
- **FR-026**: Host API MUST install, bootstrap, execute, recover, and report at least two materially
  different releases without game-specific player code or persisted-contract changes.

### Key Entities

- **Installation Description**: Local-network directions for retrieving one release and the
  expected identity that must match it.
- **Installed Release**: Atomically published verified release material keyed by content identity.
- **Game Run**: One fresh playthrough pinned to one installed release.
- **Aggregate Snapshot**: Current canonical gameplay state and version for a run's local player
  aggregate.
- **Command Receipt**: Stable identity, target, expected version, and durable accepted or rejected
  result used for duplicate handling.
- **Journal Entry**: Ordered evidence connecting a command receipt to the resulting aggregate version
  and semantic outcome.
- **Location Observation**: Host-recorded foreground sensor result with identity, time, coordinates,
  accuracy, and availability state.
- **Play Report**: Redacted learning record derived from host-owned run evidence.
- **Host API**: Compatibility-checked release-to-player contract for bootstrap, canonical transition results,
  capability dispatch, and explicit host-policy errors.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A core-team author can change a clue, coordinate, or radius and reach a newly playable
  installation without rebuilding the player or using a hosted service.
- **SC-002**: 100% of altered, wrong-identity, incompatible, excessive, timed-out, and interrupted
  installation fixtures leave zero failed candidates playable and preserve every prior playable
  installation.
- **SC-003**: The full two-checkpoint route completes with connectivity disabled in provider-free host
  fixtures, and the native player builds, installs, and launches on one iOS simulator and one Android
  emulator.
- **SC-004**: 100% of denied, unavailable, stale, inaccurate, and out-of-radius location fixtures
  produce an explicit outcome and zero durable progression advancement.
- **SC-005**: Across interruption tests immediately before and after every command durability boundary,
  each command is restored either zero times or exactly once as a complete transition.
- **SC-006**: Replaying one accepted command identity 100 times advances the aggregate and journal
  exactly once and returns the same durable result every time.
- **SC-007**: After view destruction, application termination, restart, device restart simulation,
  and network loss, the player restores the same release identity, aggregate state, version, and
  progression for 100% of valid recovery fixtures.
- **SC-008**: 100% of exported report fixtures contain the required correlation and learning fields
  and contain zero raw coordinates, credentials, command payloads, raw state, or protected content.
- **SC-009**: At least one exported report leads to a documented clue, checkpoint, radius, or accuracy
  revision that compiles to a distinct release and starts a fresh run on both platforms.
- **SC-010**: The full edit-to-revision loop passes twice through the shared provider-free contracts,
  and the resulting player configuration builds, installs, and launches on both simulated reference
  platforms without platform-specific game code.
- **SC-011**: The field puzzle and one materially different release pass the same provider-free Host API
  conformance suite and run without game-specific player changes.

## Assumptions

- The first audience is the core team and every Loop 1 release is trusted internal code.
- Trusted single-view execution is not a hostile-code sandbox and cannot support external creator
  execution without a later isolation decision.
- Installation may use private-network connectivity; gameplay and recovery do not require connectivity.
- Foreground location is the only production native capability in this feature.
- General post-commit effect delivery, authoritative multiplayer, synchronization, hosted telemetry,
  accounts, public distribution, and active-run migration are deferred to later product loops.
- Feature acceptance uses provider-free scripted location and lifecycle fixtures plus native
  build/install/launch checks on an iOS simulator and Android emulator. Physical device field evidence
  remains a deferred Loop 1 product-validation activity and is not inferred from simulated results.
- Host API is intended for later games, but Loop 1 does not generalize aggregate count, authority,
  synchronization, or native capabilities beyond evidence from the two conformance releases.

## Architecture Decisions

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md)
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md)
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md)
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md)
- [Centralized Contract Evolution](../../adrs/0006-centralized-contract-evolution.md)
