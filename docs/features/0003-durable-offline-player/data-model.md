# Data Model: Durable Offline Field Puzzle

## Install Descriptor

Version 1 transport document containing one absolute private-network release URL and one expected
release identity. It never enters release bytes or durable player storage. The complete contract is
defined in `contracts/install-descriptor.md`.

## Installation Operation

An installation operation is transient host work, not a durable entity. It downloads into a unique
staging location, verifies the complete artifact and expected identity, assesses compatibility, and
atomically publishes files before creating an Installed Release record. Cancellation, rejection, or
interruption removes only staging material and leaves every published installation unchanged.

Installation failures may produce host diagnostics, but the player does not persist candidate,
verified, compatible, rejected, or partially published release states.

## Installed Release

One atomically published release keyed by content identity.

- `releaseId`: verified whole-artifact identity and primary key.
- `artifactUri`: private URI for the complete verified release artifact.
- `manifest`: validated canonical release manifest metadata.
- `installedAt`: host timestamp recorded after file publication succeeds.

An Installed Release exists only after publication. Reinstalling the same identity is idempotent;
changed bytes have a different identity and create a distinct Installed Release.

## Game Run

One fresh playthrough pinned to one Installed Release.

- `runId`: host-generated stable identity.
- `releaseId`: immutable reference to the Installed Release.
- `startedAt`: host timestamp used as the origin for relative report timing.
- `status`: `active` or `invalid`.
- `invalidatedAt` and `diagnosticCode`: present only after durable validation fails.

Game completion remains release-owned aggregate state; the host does not infer it from game-specific
fields. Installing a changed release starts a new active run without migrating or deleting earlier
runs.

## Aggregate Snapshot

The latest canonical state for the run's one local player aggregate.

- Aggregate identity and kind.
- Aggregate schema identity and positive schema version.
- Non-negative safe-integer state version.
- Canonical aggregate state.
- Non-negative safe-integer transition-journal position.

Before the first changing command, the release supplies initial state at version `0`. An accepted
changing transition increments the state version and journal position by exactly one. No-op, rejected,
recorded-invalid, malformed, stale, unauthorized, or interrupted pre-commit results do not change the
snapshot.

## Command Receipt

One immutable, idempotent result keyed by `(runId, commandId)` for a canonical runtime execution.
Transport request identity is not part of this key.

Every receipt records the aggregate target, expected version, terminal, original durable result,
resulting version, consumed observation identities, and relative occurrence time. Its terminal is one
of:

- `accepted`: a changing transition; resulting version is expected version plus one.
- `no-op`: a valid accepted decision that changed neither state nor progression; resulting version is
  the expected version.
- `rejected`: a semantic game rejection; resulting version is the expected version.
- `invalid`: a recorded runtime execution failure with stable diagnostic codes; resulting version is
  the expected version.

A repeated command identity returns the original receipt regardless of the transport request identity.
Malformed envelopes, stale versions, unsupported schemas, missing observations, and other host-policy
failures do not become command receipts; they produce Host Diagnostics and leave durable gameplay state
unchanged.

## Transition Journal Entry

Ordered evidence for an accepted changing transition only. It references its Command Receipt and
records the before/after versions, semantic outcome, progression changes, and resulting journal
position. The receipt, next snapshot, journal entry, and consumed-observation links commit in one
transaction before acceptance is returned.

No-op, rejected, and recorded-invalid receipts do not create transition journal entries.

## Location Observation

One persisted terminal result for every completed foreground-location request. All variants contain
version, stable observation identity, run identity, host-recorded time, and availability.

- `available`: additionally contains sensor capture time, signed age at delivery, finite latitude and
  longitude in geographic range, and finite non-negative horizontal accuracy.
- `permission-denied`, `unavailable`, or `failed`: contains no coordinates, sensor capture time, or
  accuracy; `failed` may contain a stable diagnostic code.

The host persists the observation before returning it to game logic. Game commands identify consumed
observations explicitly. The host validates shape and same-run ownership; release logic decides
freshness, acceptable accuracy, radius membership, and progression. Future capture time is represented
by negative age and produces a release-owned non-progressing outcome rather than being silently fixed.

## Run Event

One minimal internal evidence stream for host lifecycle, interruption, recovery, and diagnostic events.
Each event contains run identity, relative time, kind, stable code or disposition, and safe request or
command correlation when known. The SQLite representation is an implementation detail rather than part
of Host API.

Run Events contain no raw command payloads, raw aggregate state, coordinates, protected content, host
paths, credentials, or stack traces. Separate recovery and diagnostic persistence models are deferred
until distinct transactional or retention behavior is demonstrated.

## Play Report

`PlayReport` is an allowlisted projection of one run's validated durable records. Its header contains
release identity, run identity, platform, and total duration. Its body is one non-decreasing ordered
timeline of discriminated command, capability, lifecycle, and diagnostic events. Command events keep
terminal, versions, redacted semantic outcome, and progression changes together. Capability events use
an independently validated, allowlisted projection defined by that capability contract.

Report generation has no partial-success state: coherent records produce one complete report, while
missing or incoherent evidence produces an explicit failure.
