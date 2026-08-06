# Unified Game Composition Implementation Evidence

Recorded on 2026-08-06. This record keeps provider-free behavior, disposable PostgreSQL and recovery,
public four-example artifact reproduction, native simulator/emulator compatibility, and physical-device
behavior as separate claims. A result remains `NOT RUN` until the named command completes against the
final Phase 8 worktree.

## Provider-Free Gate

- Status: **PASS**.
- Command: `pnpm verify`.
- Formatting and lint: **PASS**.
- Type checks: **PASS**, 17/17 tasks.
- Builds: **PASS**, 9/9 tasks.
- Tests: **PASS**, 648/648 across 93 files.
- Spec Kit workflow tests and consistency check: **PASS**.
- Diff hygiene command: `git diff --check`.
- Diff hygiene: **PASS**.

## Focused PostgreSQL And Recovery

- Status: **PASS**.
- PostgreSQL/Testcontainers command: `pnpm exec vitest run --config vitest.config.ts --project api apps/api/test/postgres.integration.test.ts`.
- One-hundred-iteration shared recovery command: `pnpm exec vitest run --config vitest.config.ts --project player apps/player/test/shared-recovery.acceptance.test.ts`.
- Disposable PostgreSQL result: **PASS**, 3/3 tests against `postgres:17-alpine`.
- Recovery, revocation, interruption, and retry result: **PASS**, 1/1 acceptance test. The
  fixture replays 100 response-loss commands, 100 identical normal pulls, corrective pulls, and 100
  revoked pulls; exact repeats are byte-equivalent and stale active reactivation is rejected.

## Four-Example Public Quickstart

- Status: **PASS**.
- Projects: `field-puzzle`, `minimal-local-puzzle`, `branching-media-tour`, and `co-op-game`.
- Build command: `pnpm build`.
- Per-project command sequence:

  ```bash
  PLOTPOINT_ARTIFACT_DIR="$(mktemp -d)"
  for game in field-puzzle minimal-local-puzzle branching-media-tour co-op-game; do
    first="$PLOTPOINT_ARTIFACT_DIR/$game-a.pprelease"
    second="$PLOTPOINT_ARTIFACT_DIR/$game-b.pprelease"
    pnpm plotpoint validate --project "examples/releases/$game"
    pnpm plotpoint compile --project "examples/releases/$game" --out "$first"
    pnpm plotpoint inspect "$first" --json
    pnpm plotpoint verify "$first"
    pnpm plotpoint compile --project "examples/releases/$game" --out "$second"
    cmp "$first" "$second"
  done
  ```

- Validate/compile/inspect/verify result: **PASS** for all four projects. Inspection found the required
  Game Composition in every artifact and the trusted target-discovery binding only in `co-op-game`.
- Release identities: `field-puzzle` `sha256:ae834cb605b177cb9d2a1c1a94469abf88f2da1768f99f2ac7f87e1b04fc6568`;
  `minimal-local-puzzle` `sha256:f20a39cce2d5ef93eb75b49bc8767bdb81dedf284126ef36afe6ffb40b91b00c`;
  `branching-media-tour` `sha256:1ac4013511e3019b1c84fe46af3f86d003fbf1ffc0477c5144eadebac02aab9e`;
  `co-op-game` `sha256:3878ab58a4e3b90eb95f60b63e95d13e0aca821e7353c2feeb8cf7b53d063822`.
- Byte reproduction result: **PASS**; both compiled artifacts for every project matched with `cmp`.

## Native Simulation

These checks establish only native dependency alignment and build-install-launch compatibility. They do
not replace the provider-free semantic fixtures or physical-device acceptance.

### iOS Simulator

- Simulator: iPhone 17 Pro.
- Command: `pnpm --filter @plotpoint/player exec expo run:ios --device "iPhone 17 Pro" --no-bundler`.
- Build: **PASS** after configuring Expo modules to build from source on iOS; Xcode completed with
  0 errors and one duplicate-library warning.
- Install: **PASS** on simulator `C31B6C45-91CE-4C2C-ABC5-FE4C709C44F5`.
- Launch: **PASS** for `com.plotpoint.player` on iPhone 17 Pro.

### Android Emulator

- Emulator: Plotpoint_API_36.
- Command: `ANDROID_HOME=/Users/shubhankarsharan/Library/Android/sdk pnpm --filter @plotpoint/player exec expo run:android --device Plotpoint_API_36 --no-bundler`.
- Build: **PASS** in 33 seconds. Gradle reported one upstream deprecated C++ API warning, SDK XML
  tool-version skew, and Gradle deprecation notices; the build completed successfully.
- Install: **PASS** on `Plotpoint_API_36` (`emulator-5554`).
- Launch: **PASS** for the Plotpoint development client on `Plotpoint_API_36`.

## Physical Devices

Physical iOS and Android validation is **NOT RUN**. Camera scanning, foreground GPS behavior,
private-LAN reachability, real process/device restart behavior, and trusted-client evidence quality on
physical hardware remain unverified. No provider-free, simulator, or emulator result is treated as
physical-device acceptance.
