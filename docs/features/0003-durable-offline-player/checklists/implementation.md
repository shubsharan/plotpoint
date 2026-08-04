# Loop 1 Implementation Evidence

## Historical Provider-Free Baseline

These checks describe the implementation before the reusable Host API V1 contract was revised. They
remain provenance, not current acceptance evidence.

| Recorded   | Command       | Result          | Acceptance meaning                                                         |
| ---------- | ------------- | --------------- | -------------------------------------------------------------------------- |
| 2026-08-03 | `pnpm verify` | PASS, 330 tests | Historical baseline only; does not accept the revised Host API V1 contract |

- [x] Field project validated and compiled into a structurally verified release on 2026-08-03.
- [x] Expo dependency compatibility and production bundle export passed for iOS and Android.
- [x] The historical `pnpm verify` run passed 330 tests on 2026-08-03.

## Current Provider-Free Gate

**Revised-contract acceptance record**: PASS on 2026-08-03. `pnpm verify` completed formatting and
lint with no warnings, 14 of 14 typecheck tasks, 9 of 9 build tasks, 401 tests across 66 files, the
Spec Kit workflow contract tests, and the documentation synchronization check.

- [x] Host API Core rejects unknown fields, versions, directions, malformed payloads, and incompatible releases.
- [x] Accepted, no-op, rejected, and recorded-invalid terminals preserve their exact durable semantics.
- [x] The field puzzle and minimal local puzzle pass one conformance harness without player branches.
- [x] Installation identity, compatibility, bounds, interruption, prior-preservation, and race fixtures pass.
- [x] Location outcomes, observation ownership, exactly-once transitions, recovery, and report redaction pass.
- [x] The revised full `pnpm verify` gate passes and its exact result is recorded.

## Early Physical iOS Smoke Loop

- [ ] Install the generated debug app on one physical iPhone and record device and OS.
- [ ] Scan, install, and launch the field release without rebuilding the player.
- [ ] Disable connectivity, complete the route, terminate/restart once, and export the current report.
- [ ] Record observed blockers without treating the smoke loop as final acceptance.

## Early Physical Android Smoke Loop

- [ ] Install the generated debug app on one physical Android device and record device and OS.
- [ ] Scan, install, and launch the field release without rebuilding the player.
- [ ] Disable connectivity, complete the route, terminate/restart once, and export the current report.
- [ ] Record observed blockers without treating the smoke loop as final acceptance.

## Final Reusable Contract Evidence

- [x] Both conformance releases install, bootstrap, execute, recover, and report without game-specific player changes.
- [x] A redacted field report produces a documented clue, location, radius, or accuracy revision.
- [x] The revised release starts a fresh run while the previous run remains intact.

## Final Physical iOS Loop

- [ ] Complete the edit-to-revision loop a second time on the reference iPhone.
- [ ] Interrupt before and after every accepted durability boundary and recover exactly once.
- [ ] Inspect final report redaction and fresh-run evidence without database or terminal intervention.

## Final Physical Android Loop

- [ ] Complete the edit-to-revision loop a second time on the reference Android device.
- [ ] Interrupt before and after every accepted durability boundary and recover exactly once.
- [ ] Inspect final report redaction and fresh-run evidence without database or terminal intervention.

## Reconciliation

Host API conformance, the current provider-free gate, the report-driven revision, and fresh-run
retention are complete. The early and final physical iOS and Android loops remain `NOT RUN` in
`evidence/physical-devices.md`; no automated result is used as native-platform evidence. Loop 1
therefore remains Active and the feature remains Pending until those external loops are recorded and
the merged pull request is verified. Historical checks cannot satisfy revised contract acceptance.
