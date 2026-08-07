# Cooperative Hunt Implementation Evidence

Recorded on 2026-08-04. This record keeps provider-free contract and persistence evidence separate
from native shell compatibility and from deferred physical-device behavior.

## Provider-Free And PostgreSQL

- `pnpm verify`: PASS.
- Formatting and lint: PASS.
- Type checks: 16/16 tasks.
- Builds: 9/9 tasks.
- Tests: 445/445 across 75 files.
- PostgreSQL: PASS against disposable PostgreSQL 17 (`postgres:17-alpine`).
- Covered lifecycle: three one-use invitations, three participants, response-loss join retry,
  concurrent different-target stale acceptance, same-target no-op, exact receipt replay, changed-ID
  conflict, complete snapshot convergence, idempotent revocation, revoked credential rejection, and
  transaction rollback after an injected final-write failure.
- Covered player boundary: additive SQLite schema, persisted observation resolution, atomic snapshot,
  result, outbox, and cursor application under interruption, exact terminal propagation, bounded sync
  events, and adversarial report redaction.

## Native Simulation

These checks establish native dependency alignment and build-install-launch compatibility only. The
cooperative semantics and recovery loop are established by provider-free fixtures.

### iOS Simulator

- Simulator: iPhone 17 Pro.
- Runtime: iOS 26.5.
- Command: `pnpm --filter @plotpoint/player exec expo run:ios --device "iPhone 17 Pro" --no-bundler`.
- Build: PASS with 0 errors and 1 dependency warning.
- SecureStore native module: linked.
- Install and launch: PASS for `com.plotpoint.player`.

### Android Emulator

- Emulator: Plotpoint_API_36 (`sdk_gphone64_arm64`).
- Runtime: Android 16, API 36.
- Command: `ANDROID_HOME=/Users/shubhankarsharan/Library/Android/sdk pnpm --filter @plotpoint/player exec expo run:android --device Plotpoint_API_36 --no-bundler`.
- Build: PASS (`BUILD SUCCESSFUL`, 183 actionable tasks).
- SecureStore native module: linked.
- Install and launch: PASS; `com.plotpoint.player/.MainActivity` was the top resumed activity.

## Deferred Physical Devices

Physical iOS and Android validation is **NOT RUN**. Camera scanning, foreground GPS behavior,
private-LAN reachability, real process/device restart behavior, and trusted-client evidence quality
on physical hardware remain deferred behind the known technical blocker. No simulator, emulator,
configuration, or provider-free result is treated as physical-device acceptance.
