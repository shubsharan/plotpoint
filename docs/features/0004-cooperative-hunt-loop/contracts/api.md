# Contract: Cooperative Hunt HTTP API

The closed `/` API uses HTTPS outside loopback tests. Participant bearer credentials and the
core-team operator credential never enter JSON bodies, logs, diagnostics, WebView messages, or reports.
JSON is bounded at 256 KiB and release uploads at 64 MiB.

- `POST /releases`: operator uploads complete release-format bytes plus the expected identity;
  the API verifies and records immutable compatibility and trusted target configuration, then discards
  the bytes.
- `POST /hunt-sessions`: operator supplies `version`, `creationId`, `releaseId`, and `teamLabel`;
  exact retries return the original session and team.
- `POST /hunt-sessions/{sessionId}/invitations`: operator supplies `version`, `invitationId`, and
  `expiresAt`; one raw one-use invitation is returned once and stored only as a digest.
- `POST /hunt-sessions/{sessionId}/participants`: an unauthenticated join supplies `version`,
  `joinRequestId`, invitation, and native-generated 256-bit credential. Exact response-loss retries
  return the original participant and initial Sync snapshot.
- `POST /hunt-sessions/{sessionId}/participants/{participantId}/revoke`: operator supplies
  `version` and an idempotent operation ID. Revocation locks the participant row, marks it revoked, and
  invalidates its credential. Reactivation and credential recovery are not supported.
- `POST /hunt-sessions/{sessionId}/commands`: authenticated participant submits one Sync Command.
- `GET /hunt-sessions/{sessionId}/sync?after=<cursor>`: authenticated participant receives one
  complete Sync Pull snapshot.

Transport and policy failures use
`{ version: typeof CONTRACT_VERSIONS.sharedApi, code: string, requestId: string }`. Unknown,
expired, consumed, or wrong-session invitations collapse to `join-not-authorized`. A known revoked
credential returns `participant-revoked` without disclosing other session state. Authenticated command
semantics use exact Sync terminals rather than transport errors.
