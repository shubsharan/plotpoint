# Research: Unified Game Composition

## Composition Source and Compatibility

**Decision**: Keep `plotpoint.project.json` as the only authored composition truth and correct Project
Configuration in place. It declares one application, aggregate models, commands, optional local
progression, components, schemas, content, assets, capabilities, and zero or one trusted mechanic. The
compiler lowers it into generated bundle registries plus mandatory Game Composition at a fixed
inventoried content path. Release Format and Host API 1.0/1.1 stay unchanged. The public `inspect`
command layers one required composition result over the game-agnostic Release Format inspector,
making the catalog reviewable without executing bundle code.

Commands and progressions are the sole owners of their aggregate-model references. Models do not
repeat command/progression lists. The trusted-mechanic binding alone selects its server model and
trusted commands; those descriptors do not repeat mechanic identity. Authority/kind is a closed union:
local/player or server/team-or-session. Initialization content must carry the model's exact input
schema; absent content means canonical `{}` validated against that schema.

The clean break migrates every valid compiler example rather than shrinking the prior evidence matrix.
`field-puzzle`, `minimal-local-puzzle`, `branching-media-tour`, and the renamed `co-op-game` all adopt
the corrected shape. Discarded configurations survive only as explicit invalid fixtures.

Repository interfaces, schema IDs, command/component/mechanic IDs, catalog paths, and contract files
use stable plain names. Per-interface `version` fields and embedded generation suffixes are removed.
Existing top-level project/release format metadata, Host API and capability
negotiation, state versions, and the `/v1` HTTP route remain because they are already centralized
compatibility or concurrency boundaries. This feature does not invent a future schema migration system.

**Rationale**: The strict JSON input already provides deterministic ordering, frozen input capture,
portable paths, and inspectability. The missing seam is not a more expressive authoring language; it
is making the compiled registries and their resource bindings authoritative when the game runs. A
application catalog can evolve inside Release Format's existing centralized compatibility boundary
without suffixing every interface or schema name or changing ZIP, manifest, digest, or artifact
identity semantics.

**Alternatives considered**:

- Add executable `defineGame()` configuration: rejected because it creates a second source of truth
  and weakens data-only validation.
- Preserve the discarded shape behind legacy parsing: rejected because the app is pre-release and
  there is no supported artifact or user data to justify two meanings.
- Introduce a new project, release, or Host API generation: rejected because no compatibility burden,
  container, inventory, identity, integrity, or wire-message rule requires it.
- Add generation suffixes or independent versions to every interface and schema: rejected because it
  spreads compatibility policy across names without providing migration or negotiation.
- Build a centralized schema/interface evolution registry now: deferred until incompatible published
  contracts exist and require it.
- Add a general module/plugin manifest: rejected because two internal games do not justify dynamic
  discovery, third-party loading, or a dependency-injection system.

## Generated Application Composition

**Decision**: Define one `GameApplication` lifecycle through a side-effect-free authoring helper.
The configured application export contains a plain lifecycle definition and `mount(context)`, which returns an
explicit handle the player unmounts before remount or disposal. Generated component factories register
cleanup callbacks in a player-owned mount scope at resource-acquisition time and expose only elements to
the application, so thrown mounts, invalid handles, and failed unmounts still clean up exactly once. The
compiler's bounded definition inspection validates the static definition shape without invoking `mount`,
then generates bundle roots exporting `application`, local `aggregateModels` with schema-narrowing
command/progression closures, and `components` in ordinal immutable registries. Progression remains
closed inside its owning model instead of becoming a second runtime selection map. The player calls only
the generated runtime adapter, which consumes bootstrap before calling `application.mount` with only
the root and pre-scoped component factories. State reads/subscriptions and command, resource,
capability, and shared-play clients exist only in the component context that declared them.

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
- Add a rendering framework or component container: rejected because the field puzzle and co-op game need
  only DOM-capable trusted functions and an explicit context.

## Aggregate Model and Decision Semantics

**Decision**: Make plain `ResolvedAggregateModel` the vertical deterministic unit. It binds one model
identity, aggregate kind, authority, one state schema, initializer, executable state/payload/
outcome/event/effect validators, command definitions, and zero or one progression. `executeCommand`
receives a resolved model, selects the command definition by type, validates the aggregate and schemas,
evaluates the handler and optional progression, and returns the complete result. The compiler owns the
resolved local player model. A trusted-mechanic adapter owns the resolved server model and must match the
release's data-only server model and command declarations. Both use the same executor without
game-specific `run()` translation or server execution of release code.

State-specific resolved models enter heterogeneous player or platform registries only through
`ExecutableAggregateModel`, a constructed wrapper that validates erased persisted JSON with the exact
state schema before invoking the closed typed initializer, command, or progression code. No registry
casts a state-specific function to a broad JSON function.

Handlers explicitly return `accepted`, `no-op`, or `rejected`; `invalid` remains runtime-produced.
An accepted result must commit at least one of state, progression, event, or effect and advances the
aggregate state version once. An explicit no-op preserves state, progression, and state version and contains no
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
- Increment state versions on rejected, invalid, or no-op attempts: rejected because no durable aggregate
  fact was accepted.
- Add event sourcing or an effect worker: rejected because current persistence needs replayable
  records, not event reconstruction or generalized delivery.

## Progression Rules

**Decision**: Keep progression optional and owned by one aggregate model. Edit `defineProgression` in
place: it continues to declare nodes with stable IDs and initial lifecycle statuses and names every legal
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
receiving persistence mutation authority; Shared Play is present only for a component declaring the
mechanic's projection and only after an exact session binding. Game Composition carries logical
descriptors and maps schemas/content/assets/descriptors to exact artifact roles and paths. Fixed
generated map exports eliminate per-item export fields. Release Manifest remains the sole authority
for Host API and release-wide capabilities; compilation proves its capability list equals the union
derived from component/mechanic selections. Compiler reference checks reject missing or ambiguous
bindings; host-facing operations reject undeclared capabilities and commands.

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

**Decision**: Allow zero or one trusted-mechanic registration in Project Configuration and
Game Composition. The binding names the platform mechanic ID, data-only server aggregate
model and accepted command contracts, configuration content, required capabilities, and projection
schema. Selecting that identity binds the platform adapter's initialization, decision,
validation, and projection roles; those are not release-authored role exports. The API composition root
owns a closed registry of platform implementations, each owning the complete resolved server model and
executable validators. Every platform validator declares the digest of the exact inventoried schema
bytes it implements. Release registration verifies the artifact's catalog, manifest inventory, and
data descriptors against those digests and selects an exact supported adapter; it never imports release
bundles on the server. Target discovery is the first adapter. Participant HTTP routes become
game-neutral shared-session routes, while operator and domain logic remain in the existing modular
monolith. Trusted Mechanic prohibits server progression because the release has no declarative server
progression contract. Binding validation returns canonical configuration plus initializer input or a
closed diagnostic; authorization returns a runtime command with transformed observations or a stable
rejected/invalid terminal; projection returns a complete validated `SharedProjection` or a closed
failure. The adapter preserves Sync state-version fields directly. It also restricts trusted outcomes to exact stable-code objects so Sync's
`outcomeCode` is lossless for semantic outcomes; execution invalidity publishes a deterministic primary
diagnostic while retaining the complete server record. Session initialization derives only from
validated release configuration; generic operator metadata does not become an implicit mechanic input.

**Rationale**: The co-op example currently depends on an undeclared command and a hard-coded content path in
server code. An explicit binding lets the release select known server behavior without allowing
arbitrary server execution and removes example-game vocabulary from the player transport.

**Alternatives considered**:

- Execute release-authored server code: rejected by the trust boundary and release model.
- Hard-code target discovery in the player or API route: rejected because the release cannot be
  inspected as the complete game definition and future shared games would require host changes.
- Build a generic remote plugin protocol or separate mechanic service: rejected because one trusted
  mechanic is evidence only for a closed port in the existing service.

## Runnable Co-op Reference Boundary

**Decision**: Keep the runnable co-op game to the product-proven target-discovery loop. Its composition
contains one local/player shell model and one server/team model selected by
`plotpoint.location.target-discovery`. The trusted binding selects the complete target-discovery
command set, and the game declares no server progression. The former `advance-round` and `solve-clue`
sample commands plus their session/team progressions are removed rather than reclassified. The field
puzzle remains the progression-bearing reference game.

The complete acceptance journey uses three participants to discover every configured target, recover
across disconnect and restart, and export a generic report. A first-release rejected command paired with
an expired capability event provides privacy-safe evidence to revise only the observation-freshness
configuration. The revised artifact has a new release identity, starts a fresh session, and completes
without active-session migration.

**Rationale**: The discarded co-op commands were compiler examples, not behavior reachable through the
authoritative product loop. Under the selected authority model, local models are player-owned, the one
server model is owned by the trusted target-discovery adapter, and Trusted Mechanic intentionally has
no server progression. Preserving unused team/session logic would force broader authority and mechanic
abstractions before a game needs them.

**Alternatives considered**:

- Add multiple trusted mechanics or multiple server models to preserve the sample commands: rejected
  because the current game needs only one target-discovery aggregate and mechanic.
- Fold clue solving and round advancement into target discovery: rejected because it would make a
  reusable platform mechanic inherit game-specific vocabulary and progression.
- Keep the files as valid but unreachable release code: rejected because valid composition must describe
  executable product behavior rather than decorative examples.

## Shared Synchronization and Recovery

**Decision**: Preserve Host API 1.1 Shared Play and Sync wire shapes. Use the existing
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
transaction. Sync does not reconstruct report provenance after both local result and outbox data
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
- Change Sync to resend all local report provenance: deferred because the server intentionally does
  not retain it and current recovery only promises convergence from intact host data.
- Support service rebinding, credential rotation, active-session release migration, or multi-device
  membership: deferred until a product loop requires them.

## Generic Evidence Export

**Decision**: Replace local and game-specific report builders in place with one host-owned Game Play
Report. Selection is keyed only by the installed run and its optional
immutable shared binding. The host derives generic lifecycle, command, capability, synchronization,
recovery, and diagnostic events from committed evidence; it never executes release code or projects
game-specific completion fields. Superseded report shapes are not read. Only command aliases remain for
useful intra-report correlation; constant run/session/participant/team aliases are removed. Stable
ordering preserves repeatability, and the existing privacy boundary excludes raw state, projections,
observations, protected content, precise locations, credentials, and service or membership identities.

**Rationale**: A composition-driven player cannot claim zero game-specific branches while report export
still dispatches to `createSharedHuntReport`. A single evidence contract closes the product lifecycle
without making report semantics another author-controlled execution surface. Product acceptance tests,
not report-specific target fields, prove that a game was completed.

**Alternatives considered**:

- Let every release provide a report projector: rejected because it executes release code over
  host-owned evidence and makes privacy enforcement game-specific.
- Add optional game fields to one generic envelope: rejected because the player would still need
  per-game schema selection and redaction logic.
- Keep both current builders for new releases: rejected because the report route would remain the
  last game-specific branch in an otherwise composition-driven lifecycle.
