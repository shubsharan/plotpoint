---
status: Active
---

# Epic: Plotpoint Core Product Loops

## Context

Plotpoint has proven the deterministic runtime, immutable releases, and complete provider-free and
simulator/emulator game paths. The product now advances through physical field evidence for its active
game loops before broader platform infrastructure is introduced.

## Outcome

Materially different games repeatedly close their own author-to-player-to-learning loop while sharing
the smallest durable Plotpoint contracts and keeping game-specific rules inside immutable releases.

## Epic Scenarios

1. **Ship and revise a field puzzle** — The core team edits a location-aware puzzle, compiles and QR
   installs it, plays offline on iOS and Android, recovers after interruption, exports a redacted
   report, and installs a revised release without rebuilding the player.
2. **Add shared play when demanded** — A co-op game introduces authoritative sessions and
   synchronization only after the local field loop is proven.
3. **Validate external creation** — An external creator completes the loop without undocumented help,
   and a secret-role game tests authorized player-specific views.

## Done When

- **EDC-001**: The field-puzzle loop closes twice on physical iOS and Android devices, including a
  report-driven revision and fresh release installation.
- **EDC-002**: A co-op game and a secret or role-based experience later close their required
  local, authoritative, synchronization, and projection loops without game-specific host or backend
  code.
- **EDC-003**: At least one external creator completes the supported authoring and iteration loop
  without undocumented core-team intervention.

## Boundaries

- **Active scope**: The internally authored Loop 1 field puzzle and Loop 2 co-op game, private-LAN
  installation, trusted mobile runtime, offline durability, foreground location, authoritative shared
  sessions, foreground synchronization and recovery, authorized shared projections, generic redacted
  report export, and provider-free Host API conformance across materially different releases.
- **Later loops**: Secret-role or other player-specific projection models, external creator usability,
  and stronger release-code isolation.
- **Out of scope**: Marketplace, commerce, hosted telemetry, active-run migration, unrestricted
  background execution, arbitrary server code, and unproven distributed infrastructure.

## Planned Features

1. **Deterministic Runtime Core** _(Done)_ — deterministic command and progression contracts.
2. **Immutable Release Pipeline** _(Done)_ — complete inspectable content-addressed releases.
3. **Durable Offline Player** _(Active)_ — the complete Loop 1 field-puzzle product loop.
4. **Co-op Game Loop** _(Active)_ — authoritative shared play and recovery-driven sync, awaiting
   physical-device evidence.
5. **Unified Game Composition** _(Done)_ — one runnable composition and recovery path across the
   field puzzle and co-op game.
6. **Creator and Multi-Game Proof** _(Planned)_ — external authoring and secret-role projections.

## Risks and Open Questions

- **[RISK]** Trusted release code shares one WebView realm — preserve the honest non-sandbox claim and
  require a later isolation decision before external creator execution.
- **[RISK]** Mobile platform behavior can diverge — Loop 1 closes only with the same field journey on
  physical iOS and Android devices.
- **[OPEN]** Which authoritative and projection contracts are reusable — let the cooperative and
  secret-role games decide rather than fixing them during Loop 1.

## Features

<!-- speckit:generated:epic-features START -->

- [Deterministic Runtime Core](../../features/0001-deterministic-runtime-core/spec.md) — Done
- [Immutable Release Pipeline](../../features/0002-immutable-release-pipeline/spec.md) — Done
- [Durable Offline Field Puzzle](../../features/0003-durable-offline-player/spec.md) — Active
- [Co-op Game Loop](../../features/0004-cooperative-hunt-loop/spec.md) — Active
- [Unified Game Composition](../../features/0005-unified-game-composition/spec.md) — Done
- [Platform Architecture Guide](../../features/0006-platform-architecture-guide/spec.md) — Pending

<!-- speckit:generated:epic-features END -->
