# Plotpoint Product Loop Roadmap

- **Status:** Loop 0 complete; Loop 1 active
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

## Loop 2: Cooperative Hunt — Planned

A real cooperative hunt pulls the minimum authoritative platform services and synchronization needed
for multiple players to join one release-pinned session, submit trusted shared commands, receive only
authorized projections, disconnect, reconnect, and converge without duplicate accepted work. The
game, not a generic backend checklist, determines the first authoritative mechanics and conflict
rules.

## Loop 3: Creator and Multi-Game Proof — Planned

An external creator completes the authoring and iteration loop without undocumented core-team help,
and a secret or role-based game tests player-specific projections. Evidence from the field puzzle,
cooperative hunt, and secret-role experience determines the minimum stable capability and module
contracts and whether stronger untrusted-code isolation is required.

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
