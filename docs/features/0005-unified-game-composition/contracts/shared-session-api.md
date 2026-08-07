# Contract: Shared Session HTTP API

## Idempotency Amendment

Command identity is participant-scoped: `(sessionId, participantId, commandId)`. The service stores the
canonical request digest and exact participant-visible result JSON. An exact retry by that participant
returns the original result bytes, changed canonical intent conflicts, and another participant may use
the same command ID independently. Stale behavior is decided only by the selected trusted mechanic.

Shared aggregate and projection contracts contain `stateVersion`, logical schema ID, and inventoried
schema digest as applicable, but no aggregate schema-generation counter.

Shared Session API replaces game-specific participant routing with a game-neutral transport. The
existing Node modular monolith, PostgreSQL authority, credential handling, command receipts, and Sync
envelopes remain. The `/v1` route prefix is the one centralized HTTP compatibility boundary; individual
request and response bodies do not repeat a version. HTTPS is required outside loopback tests. JSON
stays bounded at 256 KiB and release upload at 64 MiB.

## Routes

- `POST /v1/releases`: operator uploads Release Format bytes and supplies the expected release ID in
  the existing trusted header. The API verifies Game Composition and its optional trusted mechanic,
  matches any data-only server contracts and schema digests to the platform adapter without importing
  bundle exports, stores the immutable registration, and discards bytes.
- `POST /v1/shared-sessions`: operator supplies `creationId`, `releaseId`, and `teamLabel`.
  The release must contain one trusted mechanic; its platform adapter initializes the session's
  aggregate only from validated release configuration. `teamLabel` remains operator metadata and never
  becomes an implicit mechanic input. Exact retry returns the original session/team/release binding.
- `POST /v1/shared-sessions/{sessionId}/invitations`: operator supplies `invitationId` and
  `expiresAt`; one raw one-use invitation is returned once and only its keyed digest persists.
- `POST /v1/shared-sessions/{sessionId}/participants`: unauthenticated join supplies
  `joinRequestId`, `expectedReleaseId`, invitation, and native-generated participant credential.
- `POST /v1/shared-sessions/{sessionId}/participants/{participantId}/revoke`: operator supplies an
  idempotent operation ID; revocation remains terminal.
- `POST /v1/shared-sessions/{sessionId}/commands`: authenticated participant submits one Sync Command
  to a command allowed by the release's trusted-mechanic binding.
- `GET /v1/shared-sessions/{sessionId}/sync?after=<cursor>`: authenticated participant receives one
  complete Sync Pull.

`after`, `nextCursor`, and every result's `decisionPosition` remain opaque numeric strings. Their
ordering scope is the authenticated participant: a pull reads that participant's committed receipt
counter as its high-water mark and returns only that participant's receipts through it.

No player route, request, or response contains target, clue, or other example-game vocabulary.

## Join

```ts
interface SharedJoinRequest {
  readonly joinRequestId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly invitation: string;
  readonly participantCredential: string;
}

interface SharedJoinResponse {
  readonly participantId: string;
  readonly teamId: string;
  readonly releaseId: `sha256:${string}`;
  readonly disposition: "joined" | "duplicate";
  readonly sync: SyncPull;
}
```

The server compares `expectedReleaseId` with the immutable session release before consuming an
invitation or creating a participant. A mismatch returns `session-release-mismatch`. The exact join
request digest includes expected release, invitation binding, generated credential digest, and session
scope. Before sending, the player durably stores the exact pending request provenance in SQLite and its
single pending invitation/credential envelope in SecureStore as defined by Shared Recovery. Response-loss retry with
the same request returns the original response; changed reuse fails.

Invitation expiration governs first consumption only. Once an invitation is consumed, the server compares
the complete stored join identity before applying expiration: an exact retry returns the original participant
binding even after `expires_at`, while every nonmatching consumed attempt remains `join-not-authorized`.
An expired unconsumed invitation cannot create a participant.

The response must agree internally:

```text
response.releaseId = response.sync.snapshot.releaseId
response participant/team = snapshot participant/team
route session = snapshot session
```

The player independently compares these values with its active run and existing binding before local
commit. Server success alone never authorizes a mismatched local view.

## Command Dispatch

After authentication and membership locking, the service resolves the registered release's one trusted
mechanic, its platform-owned resolved aggregate model, and command type. Undeclared command type, wrong
aggregate model or schema, incompatible observation, or unauthorized target returns an explicit stable
terminal or the minimum transport error defined by its layer. The service never dispatches on a
compiler-private path or executes release code.

Command receipt identity, canonical request digest, domain-aware stale policy, transaction locking,
unique constraints, no-op behavior, and participant result visibility remain governed by Sync and
ADR 0005.

Trusted Mechanic makes the Sync result mapping lossless at its public boundary: trusted semantic
outcomes are exact `{ code }` objects copied to `outcomeCode`; execution invalidity uses the executor's
deterministic primary diagnostic while the full diagnostics stay in the authoritative record. The API
never serializes or silently drops additional trusted outcome fields because such a schema is rejected at
release registration.

Before a projection enters Sync Pull, the adapter validates its payload with the release-matched
projection validator and stamps the declared schema ID. The player independently repeats schema ID,
digest, and payload validation before persistence or component exposure.

## Errors and Privacy

Transport/policy failures use a closed `{ code, requestId }` object. Unknown, expired,
consumed, or wrong-session invitations collapse to `join-not-authorized`. A known revoked credential
returns `participant-revoked` without disclosing session state; Shared Recovery requires the player
to atomically mark membership/actions revoked before removing the credential. Every response carries a
new server request ID for operator correlation; credentials never enter bodies except the one join
request, logs, diagnostics, WebView messages, or reports.

Raw location and protected game configuration obey the existing redaction boundary. The generic route
does not weaken participant projection authorization. For command idempotency the service canonicalizes
the authenticated request in memory and stores only its digest plus the complete participant-visible
result. Canonical command JSON, observation payloads, coordinates, capture timestamps, and accuracy do
not enter authoritative receipts, journals, events, projections, logs, or reports.

PostgreSQL transaction time accompanies the locked aggregate into trusted execution. It is an internal
authority input, not a public request or response field. Exact receipt lookup precedes mechanic execution,
so a response-loss retry returns its original result even when new execution would now reject the evidence.

## Clean Break

The repository is pre-release: the operator client, player HTTP adapter, provider-free fixtures, and
existing example replace `/v1/hunt-sessions` with `/v1/shared-sessions` together. No compatibility alias
or alternate public route remains. Existing PostgreSQL table names may stay implementation-owned when
renaming them adds no product value; public route names and code-facing service ports must be generic.
