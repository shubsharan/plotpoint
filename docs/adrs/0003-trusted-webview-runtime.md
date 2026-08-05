---
status: Accepted
---

# ADR: Trusted Single-WebView Runtime

## Context

Loop 1 must run an immutable game release on iOS and Android soon enough to validate the complete
field-play product loop. Separating deterministic logic into a worker or native-managed realm would
add another execution protocol before the first real game has tested the host contract. The initial
audience is the core team and release code is trusted, but the player must still prevent accidental
network and native authority and must describe the boundary honestly.

## Decision

1. Loop 1 runs the release logic bundle and presentation bundle in one `react-native-webview`
   instance inside an Expo mobile application.
2. The host generates a bootstrap document from verified release entrypoints. It locks navigation,
   denies remote network connections, and exposes native operations only through a strict,
   serializable bridge whose compatibility is negotiated centrally.
3. Game logic receives state, context, and observations explicitly through the runtime contract.
   The trusted single realm is a convention-enforcement boundary, not a sandbox against malicious
   release code; documentation, diagnostics, and compatibility claims must preserve that distinction.
4. Foreground location is the only production native capability in Loop 1. Additional capabilities
   require product evidence from a later loop.
5. External creator execution is blocked until a later accepted ADR selects and proves a stronger
   isolation boundary.

## Consequences

- Loop 1 can ship one cross-platform runtime without first designing a second execution realm.
- UI and logic share browser ambient APIs, so the host cannot claim hostile-code isolation or
  enforce determinism against intentionally adversarial code.
- Locked navigation, denied remote connections, release verification, and the bridge still constrain
  accidental authority and keep native capabilities host-owned.
- A future stronger isolation boundary may change the Host API while the active release format remains
  unchanged.

## Supersession

**Supersedes**: None
**Superseded by**: None
