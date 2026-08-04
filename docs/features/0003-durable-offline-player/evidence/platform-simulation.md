# Platform Simulation Evidence

Recorded on 2026-08-04. This evidence accepts only native dependency alignment plus build, install,
and launch on simulated platforms. Complete route, interruption, recovery, report, and revision
behavior is established by provider-free fixtures. Camera scanning, GPS, private-LAN reachability,
and real process or device restart behavior remain `NOT RUN` in `physical-devices.md`.

## Dependency Alignment

- `expo install --check`: PASS
- Expo: 57.0.10
- React Native: 0.86.2
- Expo native modules: SDK 57-compatible versions
- Android mismatch found and corrected: SDK 57 `expo-modules-core` could not compile against React
  Native 0.85.3 because the required JSI `ArrayBuffer` API was unavailable.

## iOS Simulator

- Simulator: iPhone 17 Pro
- Runtime: iOS 26.5
- Command: `pnpm --filter @plotpoint/player exec expo run:ios --device "iPhone 17 Pro" --no-bundler`
- Native build: PASS, 0 errors and 1 dependency warning
- Install: PASS
- Launch: PASS, `com.plotpoint.player` opened

## Android Emulator

- Emulator: Plotpoint_API_36 (`sdk_gphone64_arm64`)
- Runtime: Android 16, API 36
- Command: `ANDROID_HOME="$HOME/Library/Android/sdk" pnpm --filter @plotpoint/player exec expo run:android --no-bundler`
- Native build: PASS, `BUILD SUCCESSFUL`
- Install: PASS, debug APK installed
- Launch: PASS, `com.plotpoint.player/.MainActivity` was the resumed activity

## Acceptance Boundary

Together with the provider-free conformance gate, these results close Feature 0003 implementation
acceptance on the user-approved simulator/emulator tier. They do not close the roadmap's physical
field-validation evidence; that evidence remains explicitly deferred and unclaimed.

- `pnpm verify`: PASS on 2026-08-04
- Verification result: formatting and lint passed; 16/16 typecheck tasks; 9/9 build tasks; 413/413
  tests across 67 files; Spec Kit workflow tests and documentation synchronization passed
