---
status: Active
---

# Epic: Plotpoint Core Platform

## Context

Plotpoint's architecture describes a complete platform, but an external game cannot yet travel the full path from authored TypeScript project to immutable release, durable native play, authoritative shared state, offline recovery, and operational diagnosis. Proving only isolated packages or interfaces would leave the central product claim untested: materially different games must retain ownership of their logic, content, progression, and presentation while the platform supplies reusable execution, installation, persistence, capability, synchronization, authority, and recovery contracts.

## Outcome

External TypeScript games can be compiled into immutable releases, installed and run through a durable native player, and preserve correct local and authoritative gameplay across interruption and reconnection without moving game-specific rules into the host or backend.

## Epic Scenarios

1. **Publish and play an offline experience** — A game author compiles an external location-aware game into an immutable release; a player installs it, completes deterministic local progression through typed foreground capabilities, loses the WebView, process, device, or network, and resumes accepted progress without project source or package resolution.
2. **Run a trusted shared experience** — A game author publishes a cooperative or role-based game whose players join one release-pinned session, issue local and authoritative commands, receive player-specific projections, reconnect after duplication or reordering, and converge without exposing server-only state or applying accepted work twice.

## Done When

- **EDC-001**: At least three materially different external games—an offline location-aware tour, a cooperative puzzle hunt, and a player-specific secret or role-based experience—each compile into an immutable artifact, install in the player, and complete a representative play path spanning the aggregate, authority, capability, and recovery modes required by that game.
- **EDC-002**: Automated end-to-end evidence proves deterministic replay, artifact integrity and compatibility rejection, atomic local and authoritative durability, idempotent effect delivery, projection redaction, convergence after interruption, and diagnostics traceable through release identity, command receipt, aggregate versions, synchronization state, capability observations, and recovery events.

## Boundaries

- **In scope**: The roadmap's deterministic runtime, immutable release pipeline, durable offline player, authoritative platform services, domain-aware synchronization, typed foreground capabilities, representative mechanics, and multi-game initial platform proof.
- **Out of scope**: Active-session release migration, unrestricted background location, arbitrary game-authored server code, synchronous simulation multiplayer, cross-session global state, generic conflict merging, runtime package installation or a marketplace, commerce, entitlements, white-label binaries, and unproven distributed-service decomposition.
- **Invariant**: Game-specific logic, content, progression, and presentation remain in a complete immutable release; durable gameplay state changes only through typed one-aggregate commands with explicit observations; external effects execute only after commit; and clients receive only authorized projections.

## Planned Features

1. **Deterministic Runtime Core** *(current; Done)*
   - **Outcome**: Game logic executes, explains, and tests durable transitions and bounded progression over canonical player, team, and session aggregates without platform infrastructure or ambient I/O.
   - **Depends on**: None
   - **Advances**: EDC-002
2. **Immutable Release Pipeline** *(current; Pending)*
   - **Outcome**: An external game project compiles into a complete content-addressed artifact that the platform can validate and inspect without mutable project source.
   - **Depends on**: Deterministic Runtime Core
   - **Advances**: EDC-001, EDC-002
3. **Durable Offline Player** *(planned)*
   - **Outcome**: A player installs and runs a local-first release, commits locally authoritative progress atomically, and recovers it after WebView, process, device, or network interruption.
   - **Depends on**: Deterministic Runtime Core, Immutable Release Pipeline
   - **Advances**: EDC-001, EDC-002
4. **Authoritative Platform Services** *(planned)*
   - **Outcome**: Multiple players execute trusted authoritative mechanics in a release-pinned session while receiving only their permitted projections and applying committed work once.
   - **Depends on**: Deterministic Runtime Core, Immutable Release Pipeline
   - **Advances**: EDC-001, EDC-002
5. **Domain-Aware Synchronization** *(planned)*
   - **Outcome**: Local and authoritative gameplay converges after disconnection, duplication, rejection, and reordering according to aggregate-specific authority and conflict rules.
   - **Depends on**: Durable Offline Player, Authoritative Platform Services
   - **Advances**: EDC-001, EDC-002
6. **Capabilities and Representative Mechanics** *(planned)*
   - **Outcome**: Games compose deterministic progression, typed foreground device observations, and authoritative shared actions through reusable headless mechanics and replaceable presentation.
   - **Depends on**: Deterministic Runtime Core, Immutable Release Pipeline, Durable Offline Player, Authoritative Platform Services, Domain-Aware Synchronization
   - **Advances**: EDC-001
7. **Initial Platform Proof** *(planned)*
   - **Outcome**: Three materially different external games prove the platform contracts reusable, recoverable, compatible, secure by projection, and operationally diagnosable end to end.
   - **Depends on**: Deterministic Runtime Core, Immutable Release Pipeline, Durable Offline Player, Authoritative Platform Services, Domain-Aware Synchronization, Capabilities and Representative Mechanics
   - **Advances**: EDC-001, EDC-002

## Risks and Open Questions

- **[OPEN]** Which isolated realm and host policy will execute arbitrary release code without granting ambient authority? — Resolve in Durable Offline Player through an accepted player-isolation ADR.
- **[OPEN]** Will authoritative player projections be materialized transactionally or asynchronously? — Resolve in Authoritative Platform Services through an accepted projection-strategy ADR.
- **[RISK]** Package-level demonstrations could pass while the platform remains unusable or leaks game-specific concerns into infrastructure — Address in Initial Platform Proof with three external games and end-to-end interruption, compatibility, redaction, synchronization, capability, and diagnostic evidence.

## Features

<!-- speckit:generated:epic-features START -->

- [Deterministic Runtime Core](../../features/0001-deterministic-runtime-core/spec.md) — Done
- [Immutable Release Pipeline](../../features/0002-immutable-release-pipeline/spec.md) — Pending

<!-- speckit:generated:epic-features END -->
