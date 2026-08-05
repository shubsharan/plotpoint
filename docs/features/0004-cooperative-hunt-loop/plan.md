# Implementation Plan: Cooperative Hunt Loop

**Branch**: `feature/0004-cooperative-hunt-loop` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

## Summary

Close Loop 2 with a three-player location hunt using a generic Host API 1.1, one PostgreSQL team
aggregate, trusted location validation, durable SQLite command outbox, and complete authorized snapshot
recovery. Simulator/emulator validation is accepted for sequencing; physical-device evidence remains deferred.

## Technical Context

TypeScript, Node modular-monolith HTTP API, `pg`, PostgreSQL, Expo SQLite/SecureStore, existing release
format v1 and Foreground Location V1, Vitest, and Testcontainers. Production credentials use HTTPS.
There are no WebSockets, background location, ORM, distributed services, general accounts, delta feed,
participant projection store, or arbitrary server execution.

## Architecture Decisions

**Impact**: Major

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) - **Accepted**
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) - **Accepted**
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md) - **Accepted**
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) - **Accepted**
- [Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md) - **Accepted**

## Implementation

1. Add closed generic shared-play, service sync, and report contracts without changing Host API 1.0.
2. Add minimal PostgreSQL records and `READ COMMITTED` authoritative transactions for registration,
   join/revoke, one team aggregate, receipts, journals, and safe events.
3. Implement trusted location discovery with host-resolved persisted observations and domain-aware stale acceptance.
4. Add additive SecureStore/SQLite shared-session, outbox, projection, result, cursor, and report state.
5. Add foreground submit/pull orchestration that atomically replaces the complete authorized snapshot.
6. Prove three-player join, discovery races, disconnect/restart convergence, revocation, and redaction in
   provider-free tests plus iOS simulator and Android emulator evidence.

## Constitution Check

PASS. The feature closes one named product loop, keeps public contracts game-neutral, uses the fewest
runtime boundaries, states the trusted-client location boundary honestly, and preserves durable local
pending/confirmed evidence. ADR 0005 records the current reviewed design.

## Complexity Tracking

No constitution exception. Physical-device evidence is explicitly deferred behind the known blocker.
