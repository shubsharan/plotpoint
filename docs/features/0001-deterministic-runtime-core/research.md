# Research: Deterministic Runtime Core

## Runtime and Package Boundary

**Decision**: Put canonical values, aggregate and command contracts, deterministic evaluation, diagnostics, execution records, and progression in dependency-free `@plotpoint/runtime`. Put scripted observations, fixtures, scenario replay, assertions, and model generators in `@plotpoint/testkit`, which depends only on runtime for Gate 1. Leave `@plotpoint/protocol` unchanged.

**Rationale**: Gate 1 is an in-process authoring and execution contract. Release, bridge, and synchronization encodings first appear in later roadmap gates, and the current `protocol -> runtime` dependency direction lets those formats encode runtime concepts later without pulling transport concerns into the kernel.

**Alternatives considered**:

- Runtime contracts in `protocol`: rejected because authoring semantics are not yet a wire format.
- New aggregate, command, progression, or shared-contract packages: rejected as unproven fragmentation.
- Deep package exports: rejected because they multiply public compatibility surfaces before representative consumers exist.

## Canonical Durable Values

**Decision**: Define a versioned JSON-compatible subset containing null, booleans, strings without lone surrogates, finite numbers, dense arrays, and plain or null-prototype objects with enumerable data properties. Reject undefined, bigint, symbols, functions, non-finite numbers, sparse or extended arrays, accessors, symbol keys, custom prototypes, class instances, dates, collections, typed arrays, host objects, and cycles. Traverse property descriptors without invoking getters or `toJSON`, normalize negative zero to zero, preserve array order, sort object keys lexicographically, and produce both a detached canonical tree and canonical text.

**Rationale**: Bare `JSON.stringify` silently drops or normalizes unsupported values and preserves construction-sensitive key order. `structuredClone` accepts cycles and richer host values. A small explicit canonical model makes validation failures local, replay equality stable, and later persistence predictable without taking on a broader cross-language canonicalization standard.

**Alternatives considered**:

- Bare JSON serialization: rejected because invalid values can disappear or change silently.
- `structuredClone`: rejected because cloneability is broader than durable game state.
- An RFC 8785 library: deferred because Gate 1 needs a stable Plotpoint value model, not yet a cross-language signing or hashing promise.

## Validation and Immutability

**Decision**: Canonical-clone every caller input, recursively freeze the detached clone, and pass only readonly clones to handlers and rules. Canonicalize handler output again before constructing a result. Use iterative traversal with explicit depth and node limits; the resolved limits are versioned and recorded. Mutation attempts fail without reaching caller-owned or non-target objects.

**Rationale**: Type-level readonly declarations do not isolate aliased runtime objects. Detached frozen copies protect the caller and give deterministic validation a single boundary. Iterative traversal avoids uncontrolled recursion and denial by pathological fixtures.

**Alternatives considered**:

- Trusting readonly types: rejected because they disappear at runtime.
- Freezing caller input directly: rejected because it mutates caller ownership.
- Copy-on-write proxies: rejected as a larger, trap-sensitive abstraction with no Gate 1 need.

## Command Decision and Version Semantics

**Decision**: Commands carry a stable identity, type, exact target reference, expected state version, and canonical payload. Handlers return accepted or rejected decisions; executor-produced invalidity is separate. Target mismatch and stale version short-circuit before handler invocation or observation consumption. An accepted candidate is combined with progression and canonicalized. The aggregate version advances once only when final game or progression state differs. A true no-op must not emit events, effects, or progression work. Rejected, invalid, and no-op results retain the original version.

**Rationale**: Discriminated decisions make illegal mixtures easier to reject, while runtime-owned version advancement prevents handlers from inventing concurrency state. Final-state comparison resolves no-op behavior after progression rather than assuming the handler's game-state proposal is the only durable change.

**Alternatives considered**:

- Handler-owned versions: rejected because version consistency is a runtime invariant.
- Exceptions for expected rejection: rejected because rejection is a semantic outcome, not an infrastructure failure.
- Incrementing on every attempted command: rejected because rejected and invalid work is not a committed transition.

## Explicit Observations and Replay

**Decision**: Model time, identifiers, random selections, sensors, and capability results as one ordered canonical observation script. A handler consumes the exact next `{kind, key}` entry through its explicit context. Missing, exhausted, or out-of-order requests invalidate the candidate; the testkit treats unused script entries as a strict scenario failure. The execution record stores the supplied script, ordered consumption trace, resolved limits, terminal result, progression trace, and stable diagnostics, but no ambient timestamps, durations, stacks, random record IDs, or host error text.

**Rationale**: One ordered ledger makes hidden inputs visible and replayable and prevents capability-specific adapters from falling back to ambient sources. Removing ambient metadata keeps records identical across replays.

**Alternatives considered**:

- Separate clock, random, identifier, and device provider interfaces: rejected because each can hide fallback behavior and complicate replay ordering.
- Unordered observation maps: rejected because repeated requests become ambiguous.
- Hash-only records: rejected because authors need the material inputs and explanation, and release identity does not exist in Gate 1.

## Progression Evaluation

**Decision**: A progression instance belongs to one aggregate. After direct command intents apply to a candidate, automatic rules run in deterministic simultaneous rounds. Every rule sees the same immutable pre-round state. For each target node, the lowest numeric priority wins; equal-priority enabled rules conflict explicitly. Independent winners are ordered canonically and applied as one batch. Completed and skipped states are terminal. The next round sees the completed prior batch.

**Rationale**: Batch rounds support parallel availability and remove accidental dependence on rule array iteration. Explicit conflicts are safer than silently selecting one branch. The approach borrows run-to-completion and parallel-state ideas from SCXML without adopting its hierarchy or event machinery.

**Alternatives considered**:

- Apply the first eligible rule and rescan: rejected because unrelated rule order becomes observable.
- Apply every enabled rule without conflict selection: rejected because one node can receive contradictory changes.
- Adopt SCXML wholesale: rejected as substantially broader than Plotpoint's lifecycle graph.

## Atomicity, Limits, and Cycles

**Decision**: Command evaluation plus progression stabilization is one proposal. Graph invalidity, rule failure, conflict, cycle, or limit overrun returns the original aggregate and non-committable attempted trace. The automatic-transition limit counts individual node changes, excludes direct command intents, never splits a batch, and succeeds at the exact limit only if no next transition is enabled. Compare complete canonical progression states after each batch; retain the state as well as any fingerprint to avoid collision-only cycle decisions.

**Rationale**: A result is safe to commit only when its progression is stable. Batch-aware limit handling avoids arbitrary partial application, and complete-state comparison supports multiple active nodes where a current-node pointer cannot detect cycles.

**Alternatives considered**:

- Commit command state before progression: rejected because it can persist an inconsistent graph.
- Return partial progression on failure: rejected because the partial state is not stable.
- Detect only repeated node IDs or rely only on hashes: rejected because parallel graph state can repeat or collide in more subtle ways.

## Test Tooling and Evidence

**Decision**: Use Vitest 4.1 as the repository test runner, with named runtime and testkit projects in one root configuration. Package scripts select the corresponding project, while the root test command runs both through the same configuration. Use Vitest's TypeScript/ESM support, watch mode, filtering, assertions, spies, and isolated workers for unit, contract, integration, and author-facing tests. Use `fast-check` only as a test dependency for seeded, replayable, shrinkable model cases; keep generators internal rather than exporting them from testkit. Compare the implementation to a structurally simpler reference model and exhaustively enumerate small two-to-four-node graphs.

**Rationale**: Vitest gives contributors one consistent TypeScript-native authoring and watch experience across both packages, named-project filtering for package-scoped runs, and familiar assertion and diagnostic output. `fast-check` adds replay and shrinking for graph counterexamples. Both remain test-only, so the production runtime stays dependency-free and testkit's public API remains framework-neutral.

**Alternatives considered**:

- Node's built-in test runner: technically sufficient, but rejected in favor of the requested Vitest workflow and its stronger monorepo authoring, filtering, watch, and assertion experience.
- Only handwritten examples: rejected because branching, parallel batches, conflict, cycle, and limit combinations need generated coverage.
- Export public arbitraries: deferred until author usage proves a stable reusable contract.

## Ambient Authority Boundary

**Decision**: Guarantee that Plotpoint runtime code performs no ambient I/O, never executes effect intents, and supplies handlers only frozen canonical inputs plus the explicit observation context. The testkit audits common ambient APIs and repeated behavior for representative handlers. Do not claim that an in-process TypeScript function is a hostile-code sandbox; Gate 2 compiler import/global enforcement and later player isolation must strengthen the boundary without changing Gate 1 semantics.

**Rationale**: JavaScript functions can close over globals regardless of the parameters an API exposes. The plan can remove ambient authority from the supported contract and provide evidence for authored fixtures, but claiming absolute same-process prevention would be false.

**Alternatives considered**:

- Serialize functions into an ad hoc sandbox: rejected because closures, modules, browser parity, and security semantics require a separate architecture decision.
- Ignore ambient access entirely: rejected because deterministic test evidence is a Gate 1 exit requirement.

## Preflight Invalidity and Record Construction

**Decision**: Canonical policy and input preparation is a distinct preflight phase. If preparation fails, return typed diagnostics without an aggregate or execution record. After preflight, construct records only from canonical components and never revalidate the complete record under a second combined node budget.

**Rationale**: An invalid raw value cannot be embedded in a canonical record. Making the record optional only for preflight failure keeps expected invalidity total and prevents a valid collection of individually bounded values from failing merely because the explanatory record repeats them.

**Alternatives considered**:

- Sanitized placeholders in one record shape: rejected because the record would no longer contain replay inputs.
- A preflight record containing canonical subsets: rejected as extra compatibility machinery without replay value.
- Throwing when the invalid record cannot be built: rejected because malformed durable input is an expected diagnostic result.

## Type, Object, and Definition Ergonomics

**Decision**: Share aggregate kind as a generic parameter across the complete author API. Canonicalization of `unknown` returns `JsonValue` and domain validators narrow it. Canonical objects are recursively frozen ordinary objects constructed descriptor-safely. Add `defineProgression` to validate and freeze static graph metadata once.

**Rationale**: These choices make TypeScript reject cross-kind composition, avoid an unchecked generic cast, preserve familiar object behavior, and remove repeated static graph validation from the hot path.

**Alternatives considered**:

- Preserve null-prototype author objects: rejected because ordinary JSON-shaped state should retain ordinary object ergonomics.
- Preserve raw progression literals on every execution: rejected because definitions are static author artifacts.
- Add compatibility wrappers: rejected because the packages are private, unreleased, and version `0.0.0`.

## Canonical Ordering and No-Op Semantics

**Decision**: Use one ordinal code-unit comparator for every durable node/rule ordering. A final aggregate equal to the original is a valid no-op only when events, effects, and the complete progression trace are empty. Direct-intent trace offsets remain separate from automatic-transition counts used for cycle diagnostics.

**Rationale**: Locale collation is not a portable canonical order, and a traced transition that later reverts is still progression work even if its final snapshot matches the original.

## Sources

- [Vitest guide](https://vitest.dev/guide/) - TypeScript/ESM test authoring, watch mode, filtering, and runner behavior.
- [Vitest projects](https://vitest.dev/guide/projects) - multiple named test configurations in one repository.
- [Vitest features](https://vitest.dev/guide/features) - assertions, mocks, concurrency, and related test capabilities.
- [ECMAScript language specification](https://tc39.es/ecma262/) - property ordering and JSON number/string serialization behavior.
- [W3C SCXML](https://www.w3.org/TR/scxml/) - run-to-completion, parallel-state, and conflict-ordering precedent.
- [fast-check model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/) - deterministic seed/path replay and shrinking.
