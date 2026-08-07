# Plotpoint Product Loop Roadmap

- **Status:** Loop 0 complete; Loops 1 and 2 active
- **Authority:** [Plotpoint Core Platform](product.md)
- **Delivery model:** Complete product loops with recorded exit evidence

## Purpose

This roadmap sequences usable Plotpoint products, not isolated platform layers. Every loop starts
with a concrete game, closes authoring through real play and learning, and introduces only the
platform contracts required by that game.

## Delivery Epics

<!-- speckit:generated:roadmap-epics START -->

- [Plotpoint Core Product Loops](epics/0001-plotpoint-core-platform/epic.md) — Active

<!-- speckit:generated:roadmap-epics END -->

## Loop 0: Foundations — Done

### Product evidence

External TypeScript game projects can define deterministic gameplay, validate their composition,
and compile into complete immutable release artifacts without a player or hosted service.

### Delivered

- Deterministic typed commands, semantic outcomes, explicit observations, aggregate isolation, and
  bounded progression.
- External-consumer runtime testkit and deterministic replay.
- Strict project validation, closed import graphs, static composition, and stable diagnostics.
- Content-addressed `.pprelease` artifacts with non-executing verification and compatibility data.
- Three materially different compiler fixtures exercising player, team, session, content, assets,
  components, progression, and declared capabilities.

### Evidence

- [Runtime implementation evidence](features/0001-deterministic-runtime-core/checklists/implementation.md)
- [Release implementation evidence](features/0002-immutable-release-pipeline/checklists/implementation.md)

## Loop 1: Field Puzzle — Active

### Product loop

```text
edit location puzzle
  -> validate and compile
  -> serve and scan QR
  -> verify and install
  -> play offline in the field
  -> kill and recover
  -> export a redacted report
  -> revise and install a new release
```

### Audience and game

The core team authors a location-aware puzzle with two physical checkpoints and an intervening
puzzle. The same compiled release runs in an Expo mobile player on physical iOS and Android devices.

### Product boundary

- Trusted single-WebView logic and presentation inside a stable mobile host.
- Host-owned SQLite installation, run, aggregate, command, observation, journal, recovery, and report
  records.
- Local QR installation over a private network, followed by fully offline play.
- One-shot foreground location as the only production native capability.
- No accounts, hosted registry, telemetry backend, synchronization, multiplayer authority, active-run
  migration, generalized effect delivery, or external creator execution.

### Exit evidence

- A clue, coordinate, or radius can be changed, compiled, served, scanned, and installed without
  rebuilding the player.
- Altered, incompatible, oversized, timed-out, or wrong-identity candidates never become playable.
- The full route completes offline on one physical iOS and one physical Android device.
- Every accepted command survives view destruction and process restart and is applied exactly once.
- Permission denial, location unavailability, stale observations, and inadequate accuracy produce
  explicit non-progressing outcomes.
- The exported report supports a concrete revision while excluding raw coordinates, command payloads,
  durable state, credentials, and protected content.
- The revised release installs as a distinct release and begins a fresh run.

## Loop 2: Co-op Game — Active

### Product loop

```text
compile one co-op release
  -> create a release-pinned session
  -> join three physical players
  -> discover shared targets
  -> disconnect, restart, and converge
  -> revoke one participant
  -> export a redacted report
  -> revise and start a fresh session
```

### Audience and game

The core team authors one location-aware cooperative game in which three players discover shared
targets. The same compiled release runs on physical iOS and Android devices while PostgreSQL owns
authoritative team decisions and each player retains only its authorized projection. The game pulls
only the services and synchronization needed to join, submit trusted shared commands, disconnect,
reconnect, and converge without duplicate accepted work; its mechanics determine the conflict rules.

### Product boundary

- One release-pinned session, one embedded team identity, and one team aggregate.
- One-use invitations, idempotent join, terminal operator revocation, and native credential custody.
- Generic Host API shared commands/views and an internal complete-snapshot Sync contract.
- One trusted target-discovery server mechanic using persisted foreground-location observations.
- No WebSockets, deltas, participant projection stores, delivery workers, generic effects, accounts,
  device attestation, or release-authored server execution.

### Evidence so far

- Provider-free tests cover three-player lifecycle, concurrent target discovery, complete snapshot
  convergence, revocation, rollback, interruption safety, and redacted reporting.
- Native player build-install-launch passes on the reference iOS simulator and Android emulator.
- Physical-device location and network behavior has not yet been run; simulated evidence does not
  establish it.
- [Feature 0005 remediation evidence](features/0005-unified-game-composition/evidence/remediation.md)

### Exit evidence

- Three physical players join the same release-pinned session across iOS and Android and discover
  every configured target through the installed component action.
- Foreground location, disconnection, application termination, response loss, and reconnection
  preserve exact command identity and converge every participant on the same authorized projection.
- Revocation blocks further authoritative work without deleting queued evidence or exposing another
  participant's credential or view.
- PostgreSQL receipts, player records, operational evidence, and exported reports retain no raw
  coordinates or shared command payloads.
- A report-driven rule revision compiles to a distinct release and completes in a fresh session
  without migrating the previous session.

## Loop 3: Creator and Multi-Game Proof — Planned

### Product loop

```text
external creator authors a game
  -> validates and compiles without private guidance
  -> installs and plays it
  -> exports evidence and revises it
  -> repeats with player-specific secret or role projections
```

An external creator completes the authoring and iteration loop without undocumented core-team help,
and a secret or role-based game tests player-specific projections. Evidence from the field puzzle,
co-op game, and secret-role experience determines the minimum stable capability and module
contracts and whether stronger untrusted-code isolation is required.

### Exit evidence

- An external creator completes authoring, validation, compilation, installation, play, reporting,
  and revision using only supported repository documentation and diagnostics.
- A materially different secret or role-based game proves participant-specific projections without
  leaking protected state through views, receipts, reports, or recovery.
- Evidence from all three loops supports an explicit decision on stable capability/module contracts
  and the isolation required before accepting untrusted creator code.

## Deferred Until Pulled By A Loop

- active-session release migration;
- unrestricted background location;
- arbitrary game-authored authoritative server code;
- synchronous simulation multiplayer;
- generic conflict merging or cross-session global state;
- marketplace, commerce, entitlements, and white-label distribution;
- hosted telemetry and operational dashboards;
- generalized effect, queue, or distributed-service infrastructure;
- third-party module signing, software bills of materials, and hermetic builds.
