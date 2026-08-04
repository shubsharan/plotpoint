# Implementation Plan: Durable Offline Field Puzzle

**Branch**: `feature/0003-durable-offline-player` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0003-durable-offline-player/spec.md`

## Summary

Close Plotpoint Loop 1 with one internally authored field puzzle that compiles into release-format v1,
installs over a bounded private-LAN QR flow, runs offline in a trusted single WebView on Expo iOS and
Android, commits local transitions atomically to host-owned SQLite, survives interruption, exports a
redacted play report, and supports a revised fresh release without rebuilding the player.

## Technical Context

**Language/Version**: TypeScript 7 for shared packages; Expo SDK 56 with React Native and React for mobile
**Primary Dependencies**: existing runtime/compiler/protocol; Expo Camera, Location, SQLite, FileSystem,
Sharing; react-native-webview; Node HTTP; qrcode
**Storage**: SQLite for player records; release-ID-addressed private files for installed material
**Testing**: Vitest for portable contracts, serving, persistence policy, redaction, and scripted lifecycle;
Expo type checks and physical-device acceptance on iOS and Android
**Target Platform**: Node.js 25 author tooling; physical iOS and Android development clients
**Project Type**: monorepo CLI + cross-platform mobile application + external example game
**Performance Goals**: reject transfers above 64 MiB; fail transfers after 30 seconds; restore a valid
installed puzzle to a playable view within 5 seconds on each reference device
**Constraints**: release-format v1 and project-format v1 unchanged; no hosted services; private-network
HTTP only during installation; offline play; trusted code with no hostile-code isolation claim; no
active-run migration; exported reports omit sensitive values
**Scale/Scope**: one core-team-authored game, one foreground capability, one local player aggregate,
one reference device per mobile platform

## Constitution Check

- **PASS — Complete Product Loop**: install, field play, recovery, report, and revision close one loop.
- **PASS — Durable Contracts Stay Small**: host API 1.0 adds only installation, bridge, location, and
  report contracts; release-format v1 remains unchanged.
- **PASS — Trust Boundaries Are Honest**: accepted ADR 0003 records trusted single-realm limits.
- **PASS — Evidence Before Abstraction**: no backend, generalized effects, sync, or broad capability catalog.
- **PASS — Local-First Privacy and Recovery**: accepted ADR 0004 owns atomic durability and redaction.

Post-design re-check: PASS. Contracts and data entities are limited to the Loop 1 journey and every
Major decision is governed by an Accepted ADR.

## Architecture Decisions

**Impact**: Major

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) — **Accepted**
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) — **Accepted**
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md) — **Accepted**
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) — **Accepted**

## Project Structure

### Documentation

```text
docs/features/0003-durable-offline-player/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code

```text
apps/player/
├── App.tsx
├── app.json
└── src/
    ├── bridge/
    ├── install/
    ├── persistence/
    ├── reports/
    └── runtime/

packages/protocol/src/player/   # portable installation, bridge, capability, report contracts
packages/compiler/src/serve/    # verified private-LAN release server and QR rendering
examples/releases/field-puzzle/ # two checkpoints and an intervening puzzle
```

**Structure Decision**: Extend the existing compiler binary and protocol package rather than creating
new tooling packages. Keep native adapters in `apps/player`; portable validation and policy remain
testable without an Expo runtime.

## Delivery Phases

1. Publish protocol contracts and portable validators, then add the verified LAN serve command.
2. Establish the Expo player shell, SQLite migrations, installation publication, and recovery bootstrap.
3. Connect the trusted WebView bridge and atomic transition commit path.
4. Add foreground location, the field-puzzle release, redacted report export, and scripted evidence.
5. Verify provider-free gates; record physical iOS and Android acceptance separately when performed.

## Complexity Tracking

No constitution violations require justification.
