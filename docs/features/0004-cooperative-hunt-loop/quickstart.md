# Quickstart: Cooperative Hunt Loop

ADR 0005 is Accepted and implementation evidence is recorded in
`evidence/implementation.md`.

1. Start the local PostgreSQL test/service environment and configure non-production database, operator,
   credential-pepper, and loopback-origin values.
2. Compile `examples/releases/team-session-hunt`, install the same release through the existing verified
   player flow, and register those exact bytes with the API.
3. Create one session and three unique invitations; join three clean player stores.
4. Exercise fresh/in-zone and every rejected location class, a same-target race, and different-target stale acceptance.
5. Disconnect and restart one player while teammates finish the route; reconnect and confirm one atomic
   snapshot plus results converges all players.
6. Revoke one participant with queued work and confirm its commands become blocked-revoked.
7. Export Shared Hunt Report V1 and inspect it for prohibited credentials, coordinates, payload/state,
   protected content, reusable identities, SQL errors, paths, and stacks.
8. Run `pnpm verify`, focused PostgreSQL integration tests, iOS simulator validation, Android emulator
   validation, and `git diff --check`.

Physical-device evidence remains deferred behind the recorded native toolchain blocker and is not inferred
from simulator or emulator results.
