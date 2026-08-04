# Research: Durable Offline Field Puzzle

## Expo mobile baseline

**Decision**: Use one Expo SDK 56 application built with `expo run:ios` and `expo run:android`, with
Expo Camera, Location, SQLite, FileSystem, and Sharing plus `react-native-webview`. Record the exact
reference device and operating-system versions with physical acceptance evidence.

**Rationale**: The selected packages cover both target platforms behind one TypeScript application;
SQLite persists across restarts and WebView supports Expo, iOS, and Android. Generated debug apps
allow private-LAN installation without committing to public distribution or adding a hosted build.

**Alternatives considered**: separate native iOS and Android hosts duplicate the contract surface; a
PWA would not prove host-owned native SQLite, location, or restart behavior; Expo Go does not represent
the intended native configuration. An SDK upgrade is a separate compatibility change after Loop 1.

**Required evidence**: Automated checks prove package, contract, and scripted lifecycle behavior only.
Private-LAN reachability, platform permission behavior, generated native configuration, and the full
offline route require separate physical iOS and Android acceptance. Native permissions must remain
limited to the camera and foreground location capabilities Loop 1 actually uses.

## Trusted runtime boundary

**Decision**: Generate a host bootstrap document around the two verified v1 entrypoints and run logic
and presentation together. Lock navigation and remote connections; communicate only through closed
bridge messages.

**Rationale**: This closes the first product loop with trusted internal code. ADR 0003 prevents a false
sandbox claim and blocks external creator execution until stronger isolation is selected.

**Alternatives considered**: Web Worker logic and a separate native-managed realm add a second
execution protocol before field evidence exists.

**Required evidence**: Bridge validators reject unknown envelope and payload fields, navigation and
remote loads remain denied, and recovery revalidates the installed release and durable records before
creating a replacement view.

## Reusable player contract

**Decision**: Host API V1 owns only runtime bootstrap, canonical recorded transition terminals,
transport-versus-command identity, version/schema validation, generic versioned capability dispatch,
and explicit host-policy errors. Installation transport, capability payloads, report projections, and
SQLite layout remain independently versioned or internal. Prove reuse with the field puzzle and the
materially different minimal local puzzle without player branches.

**Rationale**: Later games need one stable player boundary, but one field game cannot distinguish a
reusable contract from game-specific host code. A second release provides external-consumer-style
evidence while keeping multiplayer, multiple aggregates, synchronization, and capability catalogs out
of Loop 1.

**Alternatives considered**: A field-puzzle-only bridge would hard-code current game assumptions; a
general multi-aggregate or authoritative protocol anticipates later loops without evidence; treating
SQLite tables as the public contract would prevent internal storage changes without improving release
compatibility.

## Installation transport

**Decision**: `plotpoint serve` verifies one captured artifact, serves a versioned JSON descriptor and
those exact bytes over one selected private IPv4 interface, and displays a QR for the descriptor URL.
The player requires an expected identity, a private-network source, same-origin descriptor and release
URLs, no redirects, a 64 KiB descriptor limit, a 64 MiB streaming release limit, and one 30-second
network-phase deadline.

**Rationale**: It supports rapid core-team iteration without accounts, registry storage, or player
rebuilds. Artifact verification remains the trust boundary, not the development transport.

**Alternatives considered**: file import complicates repeat field iteration; a hosted registry adds an
unvalidated backend; self-signed HTTPS adds certificate provisioning without improving artifact trust.

**Required evidence**: Alteration, descriptor mutation, excessive transfer, deadline, interrupted
publication, repeat installation, and racing installation fixtures never create a durable candidate or
displace an existing playable installation.

## Host-owned persistence and recovery

**Decision**: SQLite in WAL mode owns published releases, runs, snapshots, immutable command receipts,
accepted-transition journals, observation links, recovery events, and diagnostics. Accepted changes
commit their receipt, next snapshot, journal entry, and observation links in one exclusive transaction.
No-op, rejected, and recorded-invalid executions persist only their receipt and observation links and
do not advance gameplay state. Recovery reopens the pinned verified release and validates coherent
durable records; it fails closed instead of repairing or resetting them. Changed release bytes start a
fresh run.

**Rationale**: The disposable WebView cannot own accepted progress. One host transaction provides the
durability boundary and stable duplicate handling without a server or generalized recovery system.

**Alternatives considered**: WebView storage has the wrong ownership and recovery boundary; ad hoc JSON
files weaken multi-record atomicity; full event sourcing and active-run migration are unnecessary;
hosted persistence is outside Loop 1.

## Foreground location

**Decision**: Expose one one-shot foreground location capability as a discriminated terminal result.
Persist available, permission-denied, unavailable, and failed observations before returning them,
reference observations explicitly from commands, and keep checkpoint coordinates, radii, freshness,
accuracy, and progression rules inside the release. Do not request background or microphone authority.

**Rationale**: Explicit observations make sensor input durable evidence without turning it into
host-declared proof. The same contract supports scripted fixtures and real devices.

**Alternatives considered**: Background tracking adds privacy and operating-system complexity;
host-owned geofencing moves game rules into the player; WebView geolocation bypasses host authority.

## Redacted play reports

**Decision**: Derive `PlayReportV1` as an allowlisted projection of validated host records with one
ordered discriminated event timeline. Keep each command terminal, versions, redacted outcome code, and
progression changes together; include observation quality, lifecycle/recovery evidence, and correlated
diagnostics at relative times. Never serialize raw database rows.

**Rationale**: The projection returns actionable field evidence while raw coordinates, command
payloads, aggregate state, credentials, protected content, host paths, and stack traces remain local.

**Alternatives considered**: Raw database or event exports violate the privacy boundary; a
release-authored report can be incomplete; hosted telemetry is outside Loop 1.
