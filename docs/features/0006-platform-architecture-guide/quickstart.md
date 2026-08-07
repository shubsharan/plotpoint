# Quickstart: Verify the Platform Architecture Guide

This quickstart reviews `docs/architecture.md` as a new project owner or contributor would. It checks
comprehension, contract traceability, and ownership before mechanical repository gates.

## 1. Take the Ten-Minute Reading Path

Start at `README.md`, follow the architecture link, and read the opening mental model, system map,
pattern table, and local/shared flow sections.

Without opening another file, explain:

1. what a game project declares;
2. what the compiler puts in a release;
3. what executes in the trusted WebView;
4. what the native host, SQLite, API, and PostgreSQL each own; and
5. why local and shared commands cross different authority boundaries.

The pass condition is a coherent answer within 10 minutes.

## 2. Answer the Recurring Questions

Use the guide and its primary links to answer:

1. How is a game defined?
2. How are progression nodes and transitions defined and evaluated?
3. How are components defined, and where does their presentation and domain logic live?
4. How is multiplayer declared, executed, synchronized, and recovered?
5. How do schemas and versions preserve authority across heterogeneous registries and processes?

Each answer must identify the relevant data model, contract, authority, and durable owner.

## 3. Trace the Three Flows

Follow the guide from:

1. project configuration through compiler validation, composition, release verification, installation,
   bootstrap, and mount;
2. component intent through deterministic command execution, Host API transition, atomic SQLite commit,
   notification, and restart recovery; and
3. shared intent through durable enqueue, finite submission, authoritative mechanic execution,
   PostgreSQL commit, complete snapshot pull, atomic reconciliation, and revocation.

Confirm that each process crossing has a named contract and that no UI or transport layer silently
acquires durable authority.

## 4. Inspect the Core Data Models

For each model, identify its identity/version, schema authority, lifecycle, relationships, and owner:

- Project Configuration and Game Composition;
- immutable release;
- aggregate model and aggregate instance;
- command, decision, execution record, and progression;
- component context and observation;
- shared-session binding, outbox command, terminal result, projection, and snapshot; and
- Game Play Report.

Use the contract map for exact fields rather than expecting the guide to duplicate them.

## 5. Check Architectural Patterns

For every pattern in the guide, explain its Plotpoint-specific use and the property it protects.
Confirm that the non-goals do not introduce alternative architectures as requirements.

## 6. Check Change Ownership

For ten hypothetical changes—command rule, progression rule, project field, release packaging, game
UI, native capability, local transaction, trusted shared rule, sync retry, and report redaction—use the
guide's change table to select the owning subsystem. At least nine must lead to the correct primary
contract or repository boundary.

## 7. Audit the Architecture-Only Boundary

Search `docs/architecture.md` and confirm it contains:

- no dated implementation snapshot;
- no feature task counts;
- no current-versus-planned migration table;
- no delivery status legend; and
- no demo-game vocabulary presented as core infrastructure.

Progression node status, membership status, and synchronization status are valid domain models and do
not violate this boundary.

## 8. Check Links and Formatting

Open every repository-relative link in the guide, including README discovery, contracts, ADRs, package
boundaries, product direction, and roadmap. Then run:

```bash
pnpm format
pnpm speckit:check
git diff --check
```

## 9. Run the Provider-Free Gate

```bash
pnpm verify
git diff --check
```

This proves repository compatibility. Reader comprehension and architectural correctness still require
the manual checks above.
