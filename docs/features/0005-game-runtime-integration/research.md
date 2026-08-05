# Research: Game Runtime Integration

## Composition Source and Versioning

**Decision**: Keep `plotpoint.project.json` as the only authored composition truth and replace its
private pre-release shape with Project Configuration V2. V2 declares one application, aggregate
models, commands, optional progression, components, schemas, content, assets, capabilities, and zero
or one trusted mechanic. The compiler lowers it into generated bundle registries plus a canonical Game
Composition V1 catalog at a fixed inventoried content path. Release Format V1 stays unchanged; new
releases require Host API 1.2 so an older player rejects them before installation. The compiler's public
`inspect` command layers a versioned Game Composition result over the unchanged game-agnostic Release
Format V1 inspector, making the generated catalog directly reviewable without executing bundle code.

**Rationale**: The strict JSON input already provides deterministic ordering, frozen input capture,
portable paths, and inspectability. The missing seam is not a more expressive authoring language; it
is making the compiled registries and their resource bindings authoritative when the game runs. A
versioned application catalog can evolve inside Release Format V1's existing application-content
inventory without changing ZIP, manifest, digest, or artifact identity semantics.

**Alternatives considered**:

- Add executable `defineGame()` configuration: rejected because it creates a second source of truth
  and weakens data-only validation.
- Preserve V1 plus optional fields: rejected because V1 is closed and the new lifecycle, model, and
  mechanic semantics are incompatible rather than optional hints.
- Introduce Release Format V2: rejected because no container, inventory, identity, or integrity rule
  changes; Host API and composition versions express the actual compatibility boundary.
- Add a general module/plugin manifest: rejected because two internal games do not justify dynamic
  discovery, third-party loading, or a dependency-injection system.

## Generated Application Composition

**Decision**: Define one `GameApplicationV1` lifecycle through a side-effect-free authoring helper.
The configured application export contains version metadata and `mount(context)`, which returns an
explicit handle the player unmounts before remount or disposal. Generated component factories register
cleanup callbacks in a player-owned mount scope at resource-acquisition time and expose only elements to
the application, so thrown mounts, invalid handles, and failed unmounts still clean up exactly once. The
compiler's bounded definition inspection validates the static definition shape without invoking `mount`,
then generates bundle roots exporting `application`, local `aggregateModels` with schema-narrowing
command/progression closures, and `components` in ordinal immutable registries. Progression remains
closed inside its owning model instead of becoming a second runtime selection map. The player calls only
the generated `application.mount` and supplies the bootstrap plus pre-scoped component factories.
Command, resource, capability, and shared-play clients exist only in the component context that declared
them.

**Rationale**: Today the compiler validates named registries but the player passes unrelated default
exports. A generated composition root makes compiled evidence operational while retaining ordinary
trusted TypeScript presentation code. Inspecting a data-shaped definition without executing its
lifecycle is the same limited trusted-authoring boundary already used for command and progression
metadata; it is not a sandbox claim.

**Alternatives considered**:

- Keep `logicModule.default` and `presentationModule.default`: rejected because authors must maintain
  duplicate registries that can disagree with the project.
- Let the player infer a lifecycle from any default export: rejected because invalid games fail only
  after installation and mounting and have no deterministic cleanup boundary.
- Add a rendering framework or component container: rejected because the field puzzle and hunt need
  only DOM-capable trusted functions and an explicit context.

## Aggregate Model and Decision Semantics

**Decision**: Make `ResolvedAggregateModelV2` the vertical deterministic unit. It binds one model
identity, aggregate kind, schema identity/version, authority, initializer, executable state/payload/
outcome/event/effect validators, command definitions, and zero or one progression. `executeCommand`
receives a resolved model, selects the command definition by type, validates the aggregate and schemas,
evaluates the handler and optional progression, and returns the complete result. The compiler owns the
resolved local player model. A trusted-mechanic adapter owns the resolved server model and must match the
release's data-only server model and command declarations. Both use the same executor without
game-specific `run()` translation or server execution of release code.

State-specific resolved models enter heterogeneous player or platform registries only through
`ExecutableAggregateModelV2`, a constructed wrapper that validates erased persisted JSON with the exact
state schema before invoking the closed typed initializer, command, or progression code. No registry
casts a state-specific function to a broad JSON function.

Handlers explicitly return `accepted`, `no-op`, or `rejected`; `invalid` remains runtime-produced.
An accepted result must commit at least one of state, progression, event, or effect and advances the
aggregate revision once. An explicit no-op preserves state, progression, and revision and contains no
events or effects. Event-only and effect-only acceptance is therefore durable and explainable without
being misclassified as invalid. Effect intents are recorded post-commit data only.

**Rationale**: Command, schema, initialization, progression, and adapter selection currently live in
separate ad hoc objects. One model makes illegal combinations unrepresentable at the supported API and
gives local persistence and trusted server mechanics the same functional core. Explicit decisions
avoid inferring domain intent from object equality.

**Alternatives considered**:

- Keep `executeCommand({ definition, progression })`: rejected because every caller must reassemble
  the same model and can select incompatible pieces.
- Treat every unchanged state as no-op: rejected because events, effects, or progression may be the
  committed result.
- Increment revisions on rejected, invalid, or no-op attempts: rejected because no durable aggregate
  fact was accepted.
- Add event sourcing or an effect worker: rejected because current persistence needs replayable
  records, not event reconstruction or generalized delivery.

## Progression Rules

**Decision**: Keep progression optional and owned by one aggregate model. `defineProgression`
continues to declare nodes with stable IDs and initial lifecycle statuses, but V2 names every legal
status edge as an explicit transition with `from`, `to`, target node, priority, and optional automatic
predicate. The runtime constructs the canonical initial instance from those nodes. Automatic
predicates observe aggregate state, typed domain-event facts, and progression state; they are no
longer parameterized by one command payload/outcome pair. Direct intents use the same declared edges.

**Rationale**: The existing deterministic simultaneous rounds, tie detection, cycle detection, and
transition bound are strong. The defects are that callers must invent initial instances, rules are
coupled to one command type even when many commands affect an aggregate, and example graphs can remain
decorative. State- and event-driven facts compose across commands and preserve one progression value.

**Alternatives considered**:

- Remove progression entirely: rejected because parallel activity status is useful and the runtime
  already has well-tested deterministic semantics.
- Put progression phases only in game state: allowed when a game does not need platform-managed
  progression; duplicating both representations is rejected.
- Adopt XState/SCXML or hierarchical statecharts: rejected as a much broader runtime and serialization
  contract than the two games require.

## Components, Resources, and Capabilities

**Decision**: Keep components as declared presentation slices. Each component registration lists the
commands, content, assets, capabilities, and optional shared-projection schema it needs. The generated
component registry supplies a scoped `ComponentContext` whose dispatchers and resolvers can access only
those IDs. Every component can read and subscribe to the release's one durable local aggregate without
receiving persistence mutation authority; Shared Play V1 is present only for a component declaring the
mechanic's projection and only after an exact session binding. Game Composition V1 maps every logical schema, content, asset,
component, command, progression, model, and mechanic ID to its exact artifact role and path. Compiler
reference checks reject missing or ambiguous bindings; host-facing operations reject release-wide
undeclared capabilities and commands.

**Rationale**: Dependency metadata is useful only if it shapes the supported runtime API. A small
scoped context provides composition and testability without claiming that mutually trusted functions
inside one WebView are isolated from each other.

**Alternatives considered**:

- Leave component dependencies as validation-only metadata: rejected because they do not constrain or
  help the running game.
- Remove components and mount one opaque application: rejected because two games already use reusable
  declared presentation slices and resource relationships.
- Sandbox each component or introduce DI scopes: rejected because ADR 0003 intentionally has one
  trusted WebView realm.

## Trusted Authoritative Mechanics

**Decision**: Allow zero or one versioned trusted-mechanic registration in Project Configuration V2 and
Game Composition V1. The binding names the platform mechanic ID/version, data-only server aggregate
model and accepted command contracts, configuration content, required capabilities, and projection
schema. Selecting that identity/version binds the platform adapter's initialization, decision,
validation, and projection roles; those are not release-authored role exports. The API composition root
owns a closed registry of platform implementations, each owning the complete resolved server model and
executable validators. Every platform validator declares the digest of the exact inventoried schema
bytes it implements. Release registration verifies the artifact's catalog, manifest inventory, and
data descriptors against those digests and selects an exact supported adapter; it never imports release
bundles on the server. Target discovery is the first adapter. Participant HTTP routes become
game-neutral shared-session routes, while operator and domain logic remain in the existing modular
monolith. Trusted Mechanic V1 prohibits server progression because the release has no declarative server
progression contract. It also restricts trusted outcomes to exact stable-code objects so Sync V1's
`outcomeCode` is lossless for semantic outcomes; execution invalidity publishes a deterministic primary
diagnostic while retaining the complete server record. Session initialization derives only from
validated release configuration; generic operator metadata does not become an implicit mechanic input.

**Rationale**: The hunt currently depends on an undeclared command and a hard-coded content path in
server code. An explicit binding lets the release select known server behavior without allowing
arbitrary server execution and removes hunt vocabulary from the player transport.

**Alternatives considered**:

- Execute release-authored server code: rejected by the trust boundary and release model.
- Hard-code target discovery in the player or API route: rejected because the release cannot be
  inspected as the complete game definition and future shared games would require host changes.
- Build a generic remote plugin protocol or separate mechanic service: rejected because one trusted
  mechanic is evidence only for a closed port in the existing service.

## Shared Synchronization and Recovery

**Decision**: Preserve Host API 1.1 Shared Play and Sync V1 wire shapes. Use the existing
`queued | submitting | blocked-revoked` SQLite statuses as an explicit durable state machine. One
atomic `beginSubmissionBatch(sessionId)` recovers interrupted submissions, captures all rows eligible
at pass start in `(enqueued_at, command_id)` order, marks that finite set submitting, and records
syncing status. The pass submits each captured row once, performs at most one pull, and terminates.
Failure requeues pass-owned rows and records degraded status; exact server receipts make a later pass
safe after response loss.

A long-lived coordinator owns a keyed single-flight scheduler. Overlapping triggers for one session
share the active promise and request at most one following serialized pass. A durable view read never
starts network work; enqueue, foreground/reconnect, and explicit retry do. Notifications follow
durable state changes.

**Rationale**: The server protocol already supports command idempotency and complete snapshots. The
failure is orchestration: the current loop never changes the selected row and every message creates a
new coordinator. A finite claimed batch and single-flight ownership repair this without leases,
workers, or protocol churn.

**Alternatives considered**:

- Submit until no queued rows remain: rejected because continuously arriving work makes one pass
  unbounded and obscures the pull boundary.
- Delete an outbox row on HTTP response: rejected because pull remains the authoritative recovery and
  a lost response must retain retry evidence.
- Add background workers, WebSockets, or a multi-process lease: rejected because foreground single-app
  synchronization is the current product boundary.

## Snapshot Reconciliation, Join, and Bridge Correlation

**Decision**: Make terminal results immutable compare-or-insert records. During one SQLite
transaction, validate all session identities, reject duplicate projection/result identities, replace
the complete projection, compare existing terminals or insert from outbox provenance, delete only
matched outbox rows, advance cursor/membership/status, and commit. A repeated corrective result may
reuse an existing local terminal when its outbox row is gone; any changed repeat aborts the whole
transaction. Sync V1 does not reconstruct report provenance after both local result and outbox data
are lost.

Before the first join request crosses the network, the player reserves the run with one exclusive
`preparing` pending row, persists invitation and participant credential secrets in SecureStore, and
advances the non-secret exact request/digest record through `ready` to `submitting`. A unique
pending-or-bound invariant makes parallel changed joins conflict before network submission, while
exact reuse resumes the same keys and request. Restart can therefore resend the same request after
response loss; a successful immutable session/snapshot commit deletes the pending row atomically,
while a mismatch retains the full attempt. Join and every later pull require equality among active run
release, response release, snapshot release, session, participant, team, and canonical service origin
before exposing state. Fresh insert owns immutable identity columns; exact retry updates only recovery
state. SQLite guards those columns against later mutation and treats multiple sessions for one run as
corruption. An authenticated revocation error atomically marks the membership revoked and all
queued/submitting rows blocked before credential removal; an authenticated revoked snapshot performs
the same blocked-outbox transition inside snapshot application. A two-stage shared bridge parser
preserves every safely decoded request ID on semantic errors; only invalid JSON or an invalid ID uses
`unknown`.

**Rationale**: Corrective snapshots are expected to repeat history, and release identity connects the
installed code to authoritative configuration and projection. Compare-or-insert semantics make retry
safe without weakening evidence or silently rebinding one game run.

**Alternatives considered**:

- Upsert and overwrite terminals or binding fields: rejected because conflicting history would become
  success-shaped local state.
- Change Sync V1 to resend all local report provenance: deferred because the server intentionally does
  not retain it and current recovery only promises convergence from intact host data.
- Support service rebinding, credential rotation, active-session release migration, or multi-device
  membership: deferred until a product loop requires them.

## Generic Evidence Export

**Decision**: Replace new-release use of local Play Report V1 and hunt-specific Shared Hunt Report V1
with one host-owned Game Play Report V2. Selection is keyed only by the installed run and its optional
immutable shared binding. The host derives generic lifecycle, command, capability, synchronization,
recovery, and diagnostic events from committed evidence; it never executes release code or projects
game-specific completion fields. Historical V1 reports remain readable, while Project Configuration V2
releases emit only V2. Deterministic report-local aliases and stable ordering preserve repeatability,
and the existing privacy boundary excludes raw state, projections, observations, protected content,
precise locations, credentials, and service or membership identities.

**Rationale**: A composition-driven player cannot claim zero game-specific branches while report export
still dispatches to `createSharedHuntReport`. A single evidence contract closes the product lifecycle
without making report semantics another author-controlled execution surface. Product acceptance tests,
not report-specific target fields, prove that a game was completed.

**Alternatives considered**:

- Let every release provide a report projector: rejected because it executes release code over
  host-owned evidence and makes privacy enforcement game-specific.
- Add optional game fields to one generic envelope: rejected because the player would still need
  per-game schema selection and redaction logic.
- Keep both current V1 builders for new releases: rejected because the report route would remain the
  last game-specific branch in an otherwise composition-driven lifecycle.
