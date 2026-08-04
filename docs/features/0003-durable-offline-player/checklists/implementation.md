# Loop 1 Implementation Evidence

## Provider-Free Gate

- [x] Field project validates and compiles into a structurally verified release.
- [x] Install descriptor, private-network, compatibility, identity, bridge, and report contracts have automated coverage.
- [x] Duplicate and stale command handling, referenced observations, recovery records, and redaction have automated coverage.
- [x] Flagship route covers two checkpoints, the intervening puzzle, and explicit denied, unavailable, stale, inaccurate, and distant outcomes.
- [x] Expo SDK dependency compatibility check passes.
- [x] Expo/Metro exports production bundles for both iOS and Android.
- [x] Full `pnpm verify` passes on the implementation worktree (330 tests on 2026-08-03).

## Physical iOS Acceptance

- [ ] Install the development client on one physical iPhone.
- [ ] Scan, install, and launch a served release without rebuilding the player.
- [ ] Disable connectivity and complete the full route.
- [ ] Terminate and resume before and after every accepted stage.
- [ ] Export and inspect a redacted report, revise the game, and install a distinct release.

## Physical Android Acceptance

- [ ] Install the development client on one physical Android device.
- [ ] Scan, install, and launch a served release without rebuilding the player.
- [ ] Disable connectivity and complete the full route.
- [ ] Terminate and resume before and after every accepted stage.
- [ ] Export and inspect a redacted report, revise the game, and install a distinct release.

Loop 1 remains Active until both physical-device sections are complete. No database or terminal
intervention is permitted after serving each release.
