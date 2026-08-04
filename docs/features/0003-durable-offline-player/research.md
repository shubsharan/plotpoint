# Research: Durable Offline Field Puzzle

## Expo mobile baseline

**Decision**: Use Expo SDK 56 development clients with Expo Camera, Location, SQLite, FileSystem, and
Sharing plus `react-native-webview`.

**Rationale**: The selected packages cover both target platforms behind one TypeScript application;
SQLite persists across restarts and WebView supports Expo, iOS, and Android. Development clients allow
private-LAN installation without committing to public distribution.

**Alternatives considered**: native iOS first would not close both-platform evidence; a PWA would not
prove host-owned SQLite or native location; Expo SDK 57 would depart from the approved plan.

## Trusted runtime boundary

**Decision**: Generate a host bootstrap document around the two verified v1 entrypoints and run logic
and presentation together. Lock navigation and remote connections; communicate only through closed
bridge messages.

**Rationale**: This closes the first product loop with trusted internal code. ADR 0003 prevents a false
sandbox claim and blocks external creator execution until stronger isolation is selected.

**Alternatives considered**: Web Worker logic and a separate native-managed realm add a second
execution protocol before field evidence exists.

## Installation transport

**Decision**: `plotpoint serve` verifies one artifact, serves a versioned JSON descriptor and exact
bytes over a selected private IPv4 interface, and displays a QR for the descriptor URL. The player
requires an expected identity, a private-network source, a 64 MiB limit, and a 30-second deadline.

**Rationale**: It supports rapid core-team iteration without accounts, registry storage, or player
rebuilds. Artifact verification remains the trust boundary, not the development transport.

**Alternatives considered**: file import complicates repeat field iteration; a hosted registry adds an
unvalidated backend; self-signed HTTPS adds certificate provisioning without improving artifact trust.

## Persistence and reporting

**Decision**: SQLite owns normalized installation, run, snapshot, receipt, journal, observation, and
diagnostic records. Reports are derived redacted projections rather than database exports.

**Rationale**: Atomic command commitment and recovery remain host-owned, while reports can omit raw
coordinates, payloads, state, and protected content by construction.

**Alternatives considered**: WebView storage is not durable enough; full event sourcing is unnecessary;
hosted telemetry is outside Loop 1.
