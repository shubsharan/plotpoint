# Loop 1 Implementation Evidence

## Historical Provider-Free Baseline

These checks describe the implementation before the reusable Host API contract was revised. They
remain provenance, not current acceptance evidence.

| Recorded   | Command       | Result          | Acceptance meaning                                                      |
| ---------- | ------------- | --------------- | ----------------------------------------------------------------------- |
| 2026-08-03 | `pnpm verify` | PASS, 330 tests | Historical baseline only; does not accept the revised Host API contract |

- [x] Field project validated and compiled into a structurally verified release on 2026-08-03.
- [x] Expo dependency compatibility and production bundle export passed for iOS and Android.
- [x] The historical `pnpm verify` run passed 330 tests on 2026-08-03.

## Current Provider-Free Gate

**Revised-contract acceptance record**: PASS on 2026-08-04. `pnpm verify` completed formatting and
lint with no warnings, 16 of 16 typecheck tasks, 9 of 9 build tasks, 413 tests across 67 files, the
Spec Kit workflow contract tests, and the documentation synchronization check.

- [x] Host API Core rejects unknown fields, versions, directions, malformed payloads, and incompatible releases.
- [x] Accepted, no-op, rejected, and recorded-invalid terminals preserve their exact durable semantics.
- [x] The field puzzle and minimal local puzzle pass one conformance harness without player branches.
- [x] Installation identity, compatibility, bounds, interruption, prior-preservation, and race fixtures pass.
- [x] Location outcomes, observation ownership, exactly-once transitions, recovery, and report redaction pass.
- [x] The revised full `pnpm verify` gate passes and its exact result is recorded.

## Host API Review Remediation

- [x] Release code uses the semantic Host Runtime client instead of reconstructing bridge payloads.
- [x] Runtime terminals map exhaustively to exact Host API candidates and preflight failures remain local.
- [x] The disconnected-route test exercises actual field logic and session code through the host router.
- [x] Both conformance releases participate in workspace type checking and the full gate passes.

## iOS Simulator Native Check

- [x] Build the SDK-aligned debug app for the iOS simulator.
- [x] Install and open `com.plotpoint.player` on the recorded iPhone simulator.
- [x] Keep complete route, lifecycle, recovery, and report claims tied to provider-free fixtures.
- [x] Record the simulated-platform boundary without treating it as physical evidence.

## Android Emulator Native Check

- [x] Build the SDK-aligned debug app for the Android emulator.
- [x] Install and resume `com.plotpoint.player/.MainActivity` on the recorded emulator.
- [x] Keep complete route, lifecycle, recovery, and report claims tied to provider-free fixtures.
- [x] Record the simulated-platform boundary without treating it as physical evidence.

## Final Reusable Contract Evidence

- [x] Both conformance releases install, bootstrap, execute, recover, and report without game-specific player changes.
- [x] A redacted field report produces a documented clue, location, radius, or accuracy revision.
- [x] The revised release starts a fresh run while the previous run remains intact.

## Final iOS Acceptance Combination

- [x] Complete the edit-to-revision and interruption matrix through provider-free fixtures.
- [x] Build, install, and launch the final dependency-aligned app on the iOS simulator.
- [x] Preserve physical camera, GPS, private-LAN, and lifecycle validation as deferred evidence.

## Final Android Acceptance Combination

- [x] Complete the edit-to-revision and interruption matrix through provider-free fixtures.
- [x] Build, install, and launch the final dependency-aligned app on the Android emulator.
- [x] Preserve physical camera, GPS, private-LAN, and lifecycle validation as deferred evidence.

## Reconciliation

Host API conformance, the provider-free gate, report-driven revision, fresh-run retention, and native
build-install-launch checks on iOS and Android simulators are complete. Physical field loops remain
`NOT RUN` in `evidence/physical-devices.md` and are deferred Loop 1 product evidence; no simulated
result is presented as physical behavior. Feature implementation acceptance is complete, while the
feature remains Pending until the merged pull request is verified.
