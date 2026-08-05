# Contract: Cooperative Hunt HTTP API V1

The closed `/v1` API uses HTTPS outside loopback tests. Participant bearer credentials and the
core-team operator credential never enter JSON bodies, logs, diagnostics, WebView messages, or reports.
JSON is bounded at 256 KiB and release uploads at 64 MiB.

- `POST /v1/releases`: operator uploads complete release-format v1 bytes plus the expected identity;
  the API verifies and records immutable compatibility and trusted target configuration, then discards
  the bytes.
- `POST /v1/hunt-sessions`: operator supplies `version`, `creationId`, `releaseId`, and `teamLabel`;
  exact retries return the original session and team.
- `POST /v1/hunt-sessions/{sessionId}/invitations`: operator supplies `version`, `invitationId`, and
  `expiresAt`; one raw one-use invitation is returned once and stored only as a digest.
- `POST /v1/hunt-sessions/{sessionId}/participants`: an unauthenticated join supplies `version`,
  `joinRequestId`, invitation, and native-generated 256-bit credential. Exact response-loss retries
  return the original participant and initial Sync V1 snapshot.
- `POST /v1/hunt-sessions/{sessionId}/participants/{participantId}/revoke`: operator supplies
  `version` and an idempotent operation ID. Revocation locks the participant row, marks it revoked, and
  invalidates its credential. Reactivation and credential recovery are not supported.
- `POST /v1/hunt-sessions/{sessionId}/commands`: authenticated participant submits one Sync Command V1.
- `GET /v1/hunt-sessions/{sessionId}/sync?after=<cursor>`: authenticated participant receives one
  complete Sync Pull V1 snapshot.

Transport and policy failures use `{ version: 1, code: string, requestId: string }`. Unknown,
expired, consumed, or wrong-session invitations collapse to `join-not-authorized`. A known revoked
credential returns `participant-revoked` without disclosing other session state. Authenticated command
semantics use exact Sync V1 terminals rather than transport errors.
