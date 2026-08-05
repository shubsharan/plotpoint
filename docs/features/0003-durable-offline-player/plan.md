# Implementation Plan: Durable Offline Field Puzzle

**Branch**: `feature/0003-durable-offline-player` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0003-durable-offline-player/spec.md`

## Summary

Close Plotpoint Loop 1 with an internally authored field puzzle that compiles into release-format,
installs over a bounded private-LAN QR flow, runs offline in a trusted single WebView on Expo iOS and
Android, commits local transitions atomically to host-owned SQLite, survives interruption, exports a
redacted play report, and supports a revised fresh release without rebuilding the player. Establish
Host API as a reusable player contract by running a second materially different release through the
same install, bootstrap, transition, recovery, and reporting surfaces without player changes.

## Technical Context

**Language/Version**: TypeScript 7 for shared packages; Expo SDK 57 with React Native 0.86 and React 19 for mobile
**Primary Dependencies**: existing runtime/compiler/protocol; Expo Camera, Location, SQLite, FileSystem,
Sharing; react-native-webview; Node HTTP; qrcode
**Storage**: SQLite for player records; release-ID-addressed private files for installed material
**Testing**: Vitest for portable contracts, serving, persistence policy, redaction, and scripted lifecycle;
Expo type checks, an iOS simulator native build, and an Android emulator native build
**Target Platform**: Node.js 25 author tooling; iOS and Android development clients, accepted for this
feature through simulator/emulator build-install-launch checks
**Project Type**: monorepo CLI + cross-platform mobile application + external example game
**Performance Goals**: reject transfers above 64 MiB; fail transfers after 30 seconds; restore a valid
installed puzzle to a playable view within 5 seconds on each reference device
**Constraints**: release-format and project-format unchanged; no hosted services; private-network
HTTP only during installation; offline play; trusted code with no hostile-code isolation claim; no
active-run migration; exported reports omit sensitive values
**Scale/Scope**: one complete core-team field game, one foreground capability, one local player
aggregate per run, one second conformance release, and one reference device per mobile platform

## Constitution Check

- **PASS — Complete Product Loop**: install, field play, recovery, report, and revision close one loop.
- **PASS — Durable Contracts Stay Small**: Host API contains bootstrap, canonical transition,
  capability-dispatch, and error semantics; installation, location, and reporting retain centralized
  compatibility metadata, and release-format remains unchanged.
- **PASS — Trust Boundaries Are Honest**: accepted ADR 0003 records trusted single-realm limits.
- **PASS — Evidence Before Abstraction**: the field puzzle and a second materially different release
  prove Host API reuse; no backend, generalized effects, sync, or broad capability catalog is added.
- **PASS — Local-First Privacy and Recovery**: accepted ADR 0004 owns atomic durability and redaction.

Post-design re-check: PASS. Contracts and data entities are limited to the Loop 1 journey and every
Major decision is governed by an Accepted ADR.

## Architecture Decisions

**Impact**: Major

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) — **Accepted**
- [Immutable Release Format](../../adrs/0002-immutable-release-format.md) — **Accepted**
- [Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md) — **Accepted**
- [Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md) — **Accepted**
- [Unversioned Contract Names](../../adrs/0006-unversioned-contract-names.md) — **Accepted**

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
examples/releases/minimal-local-puzzle/ # second Host API conformance release
```

**Structure Decision**: Extend the existing compiler binary and protocol package rather than creating
new tooling packages. Keep native adapters in `apps/player`; portable validation and policy remain
testable without an Expo runtime.

## Acceptance Evidence

- Provider-free tests cover closed contracts, exact served bytes, compatibility, transfer limits,
  interruption boundaries, atomic commit, duplicate delivery, recovery validation, and report redaction.
- The field puzzle and minimal local puzzle pass one Host API conformance harness without
  game-specific player branches or configuration.
- Scripted location and lifecycle adapters prove deterministic negative cases without claiming native
  platform behavior.
- Native iOS simulator and Android emulator checks prove the dependency-aligned development clients
  build, install, and launch on both platform toolchains.
- Provider-free conformance supplies the complete offline route, interruption, recovery, report,
  revision, and fresh-run evidence that simulators cannot establish reliably.
- Physical camera, GPS, private-LAN, and real process/device behavior remain deferred Loop 1 product
  evidence and are not part of this feature's implementation acceptance tier.

## Delivery Phases

1. Establish Host API core semantics and prove them provider-free with two materially different
   releases while keeping capability and report compatibility independently evaluable.
2. Complete verified installation and the offline field route, then build, install, and launch the
   dependency-aligned development client on an iOS simulator and Android emulator.
3. Harden atomic transition receipts, interruption recovery, and invalid-record handling from the
   conformance and device evidence.
4. Produce the redacted report, use it for a real revision, and install the fresh run on both platforms.
5. Complete the remaining boundary matrix, provider-free gate, and final native build-install-launch
   check on each simulated reference platform.

## Complexity Tracking

No constitution violations require justification.
