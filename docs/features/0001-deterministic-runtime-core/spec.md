---
status: Done
---

# Feature Specification: Deterministic Runtime Core

**Branch**: `feature/0001-deterministic-runtime-core`
**Epic**: [Deterministic Runtime Core](../../epics/0001-deterministic-runtime-core/epic.md)
**PR**: [https://github.com/shubsharan/plotpoint/pull/1](https://github.com/shubsharan/plotpoint/pull/1)
**Created**: 2026-08-03
**Input**: Feature 0001 based on the Deterministic Runtime Core gate in `docs/roadmap.md` and the runtime direction in `docs/product.md`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Execute a Reproducible Command (Priority: P1)

A game author defines a command that changes durable game state. The author can execute that command with an explicit starting aggregate and explicit external observations, then inspect the resulting state, semantic outcome, domain events, and post-commit effect intents. Repeating the same execution produces the same complete result without accessing ambient services or performing effects.

**Why this priority**: Deterministic command execution is the foundation for every later player, persistence, synchronization, and authoritative-service capability. Without it, game behavior cannot be reproduced or trusted.

**Independent Test**: Execute a representative command fixture repeatedly from the same canonical aggregate, command, and observations. This slice is complete when every run returns the same canonical result and no external effect is performed during the transition.

**Acceptance Scenarios**:

1. **Given** a valid aggregate, command, expected state version, and explicit observations, **When** the command is executed repeatedly, **Then** every execution returns identical next state, outcome, events, and effect intents.
2. **Given** a command that needs time, randomness, an identifier, or a device-derived value, **When** the command is executed, **Then** it uses only the corresponding explicit observation and does not read an ambient source.
3. **Given** a command that requests an external action, **When** its transition is accepted, **Then** the result describes the action as post-commit data and does not perform it during execution.
4. **Given** a command that does not satisfy its game rule, **When** it is evaluated, **Then** it returns an explicit semantic rejection without changing state or producing commit-dependent effects.

---

### User Story 2 - Protect Aggregate Boundaries (Priority: P2)

A game author models durable player, team, and session state as separately identified and versioned aggregates. Each command targets one aggregate, rejects stale or invalid input explicitly, and cannot mutate another aggregate through a hidden shared reference.

**Why this priority**: Clear aggregate boundaries make offline and authoritative execution safe to add later. They also prevent invisible cross-player or cross-session state corruption.

**Independent Test**: Run valid, stale, invalid, and aliasing fixtures for each aggregate type. This slice is complete when accepted commands advance only their target, rejected commands preserve the original canonical state, and non-target aggregates remain byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** player, team, and session aggregate fixtures, **When** a valid command is applied to each target in isolation, **Then** only the target aggregate changes and its state version advances exactly once.
2. **Given** a command whose expected state version does not match the target aggregate, **When** execution is attempted, **Then** the command is rejected with a stale-version diagnostic and no result is committed.
3. **Given** durable input or output containing a value outside the supported serializable state model, **When** it is validated, **Then** execution fails with a diagnostic identifying the invalid value location.
4. **Given** two aggregates whose source fixtures share nested references, **When** one aggregate is processed, **Then** neither the other aggregate nor the caller's original input is mutated.

---

### User Story 3 - Model Bounded Progression (Priority: P3)

A game author describes progression as a graph in which multiple activities can be available or active at once. After an accepted command, the author can evaluate branching, completion, skipping, and automatic transitions and receive either a stable progression result or an explicit cycle or limit diagnostic.

**Why this priority**: Plotpoint must support puzzle hunts, tours, and interactive stories that do not fit a single linear scene. Bounded evaluation keeps those models deterministic and diagnosable.

**Independent Test**: Evaluate representative graph fixtures covering branching, parallel availability, activation, completion, skipping, cycles, and transition limits. This slice is complete when valid graphs reach the expected stable state and invalid or non-terminating paths stop predictably with diagnostics.

**Acceptance Scenarios**:

1. **Given** a graph with two independently eligible nodes, **When** progression is evaluated, **Then** both nodes can become available or active without forcing a single global current node.
2. **Given** branching rules driven by the accepted command result, **When** a node completes or is skipped, **Then** the graph reaches the same next stable state for identical explicit inputs.
3. **Given** automatic transitions that revisit an already traversed progression state, **When** evaluation detects the cycle, **Then** it stops and returns a cycle diagnostic with enough traversal context to locate the problem.
4. **Given** automatic transitions that exceed the configured bound, **When** the next automatic transition would overrun the limit, **Then** evaluation stops without silently accepting a partial result and reports the limit overrun.

---

### User Story 4 - Test Game Logic Without Platform Infrastructure (Priority: P4)

A game author can construct deterministic fixtures for clocks, identifiers, randomness, external observations, and declared capabilities, then use them to reproduce and explain command and progression behavior without a player, database, network, or physical device.

**Why this priority**: A practical deterministic contract needs an author-facing way to supply and record every external value. This turns the earlier runtime guarantees into repeatable evidence.

**Independent Test**: Run command and progression scenarios entirely from recorded fixtures. This slice is complete when changing one fixture changes only behavior that consumes it, and replaying a recorded fixture reproduces the complete prior result and diagnostics.

**Acceptance Scenarios**:

1. **Given** scripted clock, identifier, randomness, observation, and capability fixtures, **When** a scenario is run without platform infrastructure, **Then** it completes using only those fixtures and returns an inspectable execution record.
2. **Given** the recorded inputs from a prior scenario, **When** the scenario is replayed, **Then** its state, outcome, events, effects, progression changes, and diagnostics match the original.
3. **Given** a scenario whose required observation is missing or exhausted, **When** execution requests it, **Then** the run fails at that request with an explicit diagnostic rather than choosing a default ambient value.

### Edge Cases

- A command, aggregate, observation, transition result, event, or effect contains a non-finite number, missing value, function, class instance, cyclic reference, or unsupported host object.
- A handler attempts to mutate its command, observations, aggregate input, or a nested object shared with another fixture.
- A command identifies the wrong aggregate type, an unknown aggregate, or an expected state version that is stale.
- A rejected or no-op command attempts to emit effects or advance progression as though a state change committed.
- A progression graph contains duplicate node identifiers, a reference to an unknown node, an unreachable rule target, or contradictory lifecycle changes.
- Zero is configured as the automatic-transition limit, the exact limit is reached, or one additional transition would overrun it.
- Multiple progression nodes become eligible simultaneously, including a mixture of newly available and already active nodes.
- A progression rule cycles through distinct nodes before returning to a previously observed progression state.
- A scripted external value is missing, exhausted, supplied in the wrong order, or present but never consumed.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The runtime MUST evaluate a command from an explicit command, one explicit target aggregate, its expected state version, and explicit observations or runtime context.
- **FR-002**: Repeated evaluation of identical canonical inputs MUST produce identical canonical next state, semantic outcome, domain events, post-commit effect intents, progression changes, and diagnostics.
- **FR-003**: Transition and progression rules MUST NOT read an ambient clock, generate ambient randomness or identifiers, access storage or a network, invoke a device capability, or perform another external effect.
- **FR-004**: Every external value used during evaluation MUST be supplied as an explicit input or observation and MUST be identifiable in the resulting execution record.
- **FR-005**: Every evaluated command MUST produce an explicit semantic outcome that distinguishes acceptance, rule-level rejection, and invalid execution.
- **FR-006**: Accepted transitions MUST return their next state, outcome, domain events, and effect intents as data before any effect can be performed.
- **FR-007**: Rejected and invalid commands MUST leave the target aggregate unchanged and MUST NOT produce effect intents that depend on a commit.
- **FR-008**: Durable aggregate state and every durable transition output MUST have a canonical JSON-compatible representation.
- **FR-009**: Validation MUST reject unsupported durable values, including non-finite numbers, functions, class instances, cyclic references, and host-specific handles, with a diagnostic that locates the invalid value.
- **FR-009a**: A policy or input that cannot be canonicalized MUST return a preflight invalid result without throwing, without claiming a canonical aggregate, and without constructing a replay record.
- **FR-010**: The runtime MUST support separately identified player, team, and session aggregates, each with an aggregate type, aggregate identity, schema version, state version, authority designation, and durable state.
- **FR-011**: A command MUST target exactly one aggregate and MUST NOT mutate any non-target aggregate or any caller-owned input.
- **FR-012**: An accepted state-changing command MUST advance the target aggregate's state version exactly once; a rejected or invalid command MUST NOT advance it.
- **FR-013**: A command whose expected state version differs from the target aggregate's current state version MUST fail with an explicit stale-version diagnostic before mutation.
- **FR-013a**: Aggregate kind MUST be shared by aggregate, command, command definition, progression definition, execution result, fixture, and replay types so a mismatched kind fails static checking and runtime validation.
- **FR-014**: The runtime MUST represent progression as addressable nodes and transitions rather than requiring one global current scene.
- **FR-015**: Progression nodes MUST support locked, available, active, completed, and skipped lifecycle states, including multiple available or active nodes at the same time.
- **FR-016**: Progression evaluation MUST support branching, parallel availability, activation, completion, skipping, and automatic transitions after an accepted command.
- **FR-017**: Automatic progression MUST stop at a stable state or at a configured transition bound and MUST record each automatic transition in order.
- **FR-018**: Progression evaluation MUST detect a repeated progression state or traversal cycle and return an explicit cycle diagnostic instead of continuing indefinitely.
- **FR-019**: Exceeding the automatic-transition bound MUST return an explicit limit-overrun diagnostic and MUST NOT present the partial traversal as a successfully stabilized result.
- **FR-019a**: Static progression definitions MUST be validated, normalized, ordinally ordered, and frozen once before execution; locale-aware collation MUST NOT determine durable ordering.
- **FR-020**: Diagnostics MUST identify the command or progression evaluation involved, classify the failure, and include enough aggregate, value-path, version, node, or traversal context for a game author to reproduce it.
- **FR-021**: The authoring test surface MUST provide deterministic controls for time, identifiers, randomness, external observations, and declared capability results.
- **FR-022**: The authoring test surface MUST detect missing, exhausted, out-of-order, and unused scripted external values and report them explicitly.
- **FR-023**: A complete execution record MUST allow a command and its resulting progression evaluation to be replayed without a player, persistence service, network service, physical device, or other platform infrastructure.
- **FR-024**: Every result produced after successful preflight MUST contain a canonical execution record assembled only from validated canonical components.
- **FR-025**: A no-op MUST contain no events, effects, direct progression work, automatic progression work, or progression trace.

### Key Entities

- **Aggregate**: A separately identified player, team, or session unit of durable gameplay state, including its schema version, state version, authority designation, and canonical state.
- **Command**: A typed game intent addressed to one aggregate, including its identity, payload, and expected aggregate state version.
- **Observation and Runtime Context**: Explicit external values available to deterministic evaluation, such as time, generated identifiers, random selections, or capability results.
- **Transition Result**: The complete result of command evaluation: next aggregate state, semantic outcome, domain events, post-commit effect intents, diagnostics, and any progression input.
- **Semantic Outcome**: A game-meaningful accepted, rejected, or invalid result that callers can interpret without inferring meaning from state changes alone.
- **Domain Event**: A durable fact describing what an accepted transition says happened in the game domain.
- **Effect Intent**: Data describing an external action that may be performed only after the associated transition commits.
- **Progression Graph**: Addressable progression nodes and transition rules that can produce multiple simultaneous available or active nodes.
- **Progression Node**: A content or activity position with a stable identity and a lifecycle state of locked, available, active, completed, or skipped.
- **Diagnostic**: Structured explanatory information for invalid input, rejected execution, stale versions, graph defects, cycles, limit overruns, or scripted-value misuse.
- **Execution Record**: The explicit inputs, ordered decisions, outputs, and diagnostics needed to explain and replay a command and its progression evaluation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across the representative command suite, 100% of at least 100 repeated executions for each identical fixture produce identical canonical state, outcomes, events, effect intents, progression changes, and diagnostics.
- **SC-002**: 100% of transition fixtures complete without reading an ambient clock, randomness source, identifier source, storage system, network, or device capability and without performing an external effect during evaluation.
- **SC-003**: 100% of invalid-value, stale-version, and rule-rejection fixtures preserve the original aggregate and return a diagnostic that identifies the failure class and relevant location or version.
- **SC-004**: Representative accepted and rejected fixtures for player, team, and session aggregates demonstrate zero changes to every non-target aggregate and every caller-owned input.
- **SC-005**: Model-based progression tests cover branching, simultaneous availability, activation, completion, skipping, cycles, and transition-bound overruns, with 100% of generated traversals either stabilizing within the configured bound or stopping with the expected explicit diagnostic.
- **SC-006**: 100% of accepted fixtures that request external work return that work as post-commit effect intent data, and zero fixtures perform the work during transition evaluation.
- **SC-007**: A game author can replay every recorded representative scenario without player or service infrastructure and obtain the same complete result and explanation as the original run.
- **SC-008**: Every malformed policy, aggregate, command, and observation fixture returns a typed preflight failure without throwing, while every post-preflight result contains a replayable record.
- **SC-009**: Compile-time contract fixtures reject every player/team/session mismatch across commands, aggregates, progression, fixtures, results, and replay.

## Assumptions

- This feature covers Gate 1 of the product roadmap and has no dependency on a previous delivery gate.
- The exact public SDK syntax, package boundaries, and wire encoding are design decisions for planning; this specification defines observable behavior rather than those shapes.
- JSON compatibility is the default durable value model. Richer values require explicit codecs and are outside this feature unless separately specified.
- External observations are trusted only as recorded inputs to deterministic game logic; proving that a physical-world event occurred is outside this feature.
- Each command mutates at most one gameplay aggregate. Cross-aggregate transactions and hidden cross-aggregate mutation are outside this feature.
- Persistence, command journaling, effect delivery, synchronization, player integration, release compilation, backend authority, and native capability implementation are outside this feature.
- Progression evaluates only from the accepted command result, current graph state, and explicit observations. Performance indexing and incremental invalidation strategies are deferred until representative games provide evidence for them.

## Architecture Decisions

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md)
