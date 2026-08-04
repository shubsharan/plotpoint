# Plotpoint

Plotpoint is a programmable runtime for location-aware games, interactive stories, puzzle hunts, tours, and alternate-reality experiences.

Games own their TypeScript logic, web UI, content, rules, and progression. Plotpoint provides the durable platform underneath: immutable releases, deterministic command execution, local persistence, device capabilities, offline recovery, synchronization, authoritative shared state, and operational diagnostics.

## Architecture

```text
Game project
  -> compiler
  -> immutable release
  -> native player + web runtime
  -> command-based local and server state
```

The monorepo is organized around execution environments and versioned boundaries:

- `apps/player` - native host and embedded web shell
- `apps/api` - platform HTTP and synchronization APIs
- `apps/worker` - asynchronous effects and build or media work
- `packages/runtime` - deterministic commands, aggregates, progression, and module contracts
- `packages/protocol` - release, bridge, and synchronization wire formats
- `packages/compiler` - project validation, composition, bundling, and manifests
- `packages/db` - PostgreSQL schema, migrations, transactions, repositories, and durable outboxes
- `packages/modules` - first-party mechanics and adapters
- `packages/testkit` - deterministic fakes, fixtures, and runtime harnesses

See [the product and architecture direction](docs/product.md) for the full platform model, boundaries, and open decisions.

## Project Status

Loop 0 is complete: deterministic runtime execution and immutable release compilation are implemented
and verified. Loop 1 is active and is closing the first complete product loop with an internally
authored location-aware puzzle on iOS and Android:

```text
edit -> validate -> compile -> QR install -> offline field play -> recover -> export -> revise
```

The mobile player is under active development. Hosted services, accounts, synchronization, external
creator onboarding, and public distribution remain deferred until a concrete later loop requires
them.

## Development

Requires Node.js 25 or newer and pnpm 11.18.0.

```sh
pnpm install
pnpm build
pnpm check-types
pnpm lint
pnpm speckit:test
```

The first end-to-end product loop is documented in
[the Loop 1 quickstart](docs/features/0003-durable-offline-player/quickstart.md). After building the
compiler, use `pnpm plotpoint` to validate, compile, verify, and privately serve release artifacts.
