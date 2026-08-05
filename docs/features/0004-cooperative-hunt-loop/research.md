# Research: Cooperative Hunt Loop

## Decisions

- Use the existing `team-session-hunt` release as a real location-aware three-player game. Register
  verified release bytes but do not host them.
- Keep one PostgreSQL-backed Node modular monolith using `pg`, raw migrations, explicit transactions,
  and real PostgreSQL integration tests.
- Model the complete hunt as one team aggregate. `plotpoint.hunt.target-discovery.v1` performs the only
  domain-aware stale decision required by the game.
- Reuse Foreground Location Capability V1. The host resolves observation IDs from its durable store;
  the server validates target zone, freshness, and accuracy without claiming device attestation.
- Preserve Host API 1.0 and add generic Host API 1.1 commands/projections. Hunt semantics remain in the
  release and trusted module.
- Use full authorized snapshot pulls plus incremental terminal results. This removes participant
  projection materialization, delivery feeds, gap scheduling, corrective deltas, and cursor tables.
- Support one-use join and terminal revocation only. Defer account recovery and membership reactivation.
- Keep Shared Hunt Report V1 separate while reusing exact Play Report terminals and Location V1
  redacted projections.

## Rejected Alternatives

- Per-target aggregates and client lanes add ordering machinery before measured contention.
- Hunt-specific host messages would force player changes for later games.
- Deltas and participant delivery rows optimize a small view prematurely.
- WebSockets, background sync, ORMs, distributed services, general accounts, device attestation,
  arbitrary server code, and generic effect workers are not required by this loop.
- Strict aggregate-version rejection would create false conflicts when a stale command names a still
  available independent target.
