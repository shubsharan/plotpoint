---
status: Accepted
---

# ADR: Host-Owned Atomic Player Persistence

## Context

The WebView is disposable, while accepted local progress must survive view destruction, process
termination, application restart, device restart, and loss of connectivity. Loop 1 also needs stable
duplicate handling, explicit location observations, and a redacted play report without making the
game presentation or release bundle the owner of durable records.

## Decision

1. The Expo native host owns installed releases, runs, aggregate snapshots, command receipts,
   journals, location observations, diagnostics, and recovery metadata in SQLite.
2. Bridge protocol v1 uses closed, versioned request and response envelopes with stable request IDs.
   The WebView computes a candidate deterministic transition from host-supplied state and explicit
   observations, then requests `transition.commit`.
3. Before commit, the host validates the command identity, target aggregate, expected version,
   canonical transition shape, schema compatibility, and referenced observation identities.
4. One SQLite transaction writes the command receipt, next snapshot and version, journal entry, and
   observation links. Acceptance is returned only after commit. Duplicate command identities return
   the original durable result without advancing state again.
5. A changed release identity starts a new run. Loop 1 does not migrate an active run between
   releases.
6. Play reports are derived from host-owned records and exclude raw coordinates, command payloads,
   raw aggregate state, credentials, and protected content.

## Consequences

- WebView destruction cannot erase an accepted transition, and recovery has one durable source of
  truth.
- The bridge becomes a persisted compatibility surface governed by host API 1.0.
- The host trusts the semantic result produced by trusted Loop 1 release code, while independently
  enforcing identity, version, schema, and atomicity constraints.
- General effect outboxes, authoritative server state, synchronization, and active-run migration are
  deferred until a concrete later product loop requires them.

## Supersession

**Supersedes**: None
**Superseded by**: None
