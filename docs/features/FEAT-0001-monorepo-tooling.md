# Feature: Monorepo & Build Tooling


| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| **Epic**   | [EPIC-0001 — Monorepo Scaffold + Core Types](../epics/EPIC-0001-monorepo-scaffold.md)     |                                                                                    |
| **Status** | Complete                                                                                  |
| **Scope**  | pnpm workspaces, Turborepo, shared TypeScript config, tsdown, oxlint, oxfmt, Vitest setup |


## Overview

This feature establishes the shared build infrastructure so that every subsequent Phase 1 package — `types`, `schemas`, `db`, `engine`, `components` — builds, tests, lints, formats, and typechecks through a single pipeline from the monorepo root.

**Tools:**


| Concern       | Tool       | Why                                                    |
| ------------- | ---------- | ------------------------------------------------------ |
| Workspaces    | pnpm       | Fast, disk-efficient, strict dependency resolution     |
| Orchestration | Turborepo  | Topological task runner with remote caching            |
| Language      | TypeScript | Strict mode, `isolatedDeclarations` for fast .d.ts     |
| Bundler       | tsdown     | Rust-based (rolldown ecosystem), fast ESM output + dts |
| Linting       | oxlint     | Rust-based, ~100x faster than ESLint                   |
| Formatting    | oxfmt      | Rust-based companion to oxlint                         |
| Testing       | Vitest     | Native ESM, TypeScript-first, fast watch mode          |


**References:**

- [Product overview](../product/overview.md) — Section 12: monorepo architecture
- [Product roadmap — Phase 1](../product/roadmap.md#phase-1-monorepo-scaffold--core-types)
- [CLAUDE.md](../../CLAUDE.md) — tech stack & code conventions

---

## 1. pnpm Workspace Configuration

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

All publishable/buildable code lives under `apps/` or `packages/`. No other top-level directories contain runnable packages.

### Root `package.json`

```jsonc
{
  "name": "plotpoint",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.32.1",
  "engines": {
    "node": ">=25.4.0"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "format": "oxfmt --check",
    "format:fix": "oxfmt ."
  },
  "devDependencies": {
    "oxfmt": "^0.38.0",
    "oxlint": "^1.53.0",
    "oxlint-tsgolint": "^0.16.0",
    "tsdown": "^0.21.2",
    "turbo": "^2.8.16",
    "typescript": "6.0.1-rc",
    "vitest": "^4.0.18"
  }
}
```

**Key decisions:**

- `"type": "module"` — ESM-only throughout the entire monorepo. No CJS outputs.
- `"private": true` — root is not publishable; only individual packages are.
- `"packageManager"` — enables corepack for deterministic pnpm version.
- `"engines"` — enforces Node >= 25.4.0. All TypeScript targets and tooling assume this baseline.
- All scripts delegate to `turbo` — never run tools directly from root.

---

## 2. Turborepo

### `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "//#quality": {
      "dependsOn": ["//#lint", "//#format"]
    },
    "//#quality:fix": {
      "dependsOn": ["//#lint:fix", "//#format:fix"]
    },
    "//#lint": {},
    "//#lint:fix": {
      "cache": false
    },
    "//#format": {},
    "//#format:fix": {
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Pipeline rationale:**


| Task        | `dependsOn` | Cached | Why                                                                                   |
| ----------- | ----------- | ------ | ------------------------------------------------------------------------------------- |
| `build`     | `^build`    | Yes    | Packages must build dependencies first; outputs are deterministic from inputs         |
| `typecheck` | `^build`    | Yes    | Needs `.d.ts` from dependencies to resolve cross-package imports                      |
| `lint`      | —           | Yes    | Linting is file-local; no dependency ordering needed. Cached based on source + config |
| `format`    | —           | No     | Formatting mutates files in-place; caching would skip necessary rewrites              |
| `test`      | `^build`    | No     | Tests import from built dependencies; not cached so tests always run fresh            |
| `dev`       | —           | No     | Watch mode; persistent task that never terminates                                     |


`globalDependencies` includes the root `tsconfig.json` because all packages extend it — a change there invalidates every cache.

---

## 3. TypeScript Configuration

### Root `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    // Language & modules
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],

    // Strict mode
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,

    // Declarations
    "declaration": true,
    "isolatedDeclarations": true,
    "declarationMap": true,

    // Emit
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,

    // Interop
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  },
  "exclude": ["node_modules", "dist"]
}
```

**Key decisions:**

- `target: ES2024` — Node 25 supports ES2024 natively. No downleveling needed.
- `module: NodeNext` / `moduleResolution: NodeNext` — required for ESM-only packages with `"type": "module"`. Enforces explicit `.js` extensions in imports.
- `isolatedDeclarations: true` — enables tsdown to generate `.d.ts` files without a full TypeScript program, dramatically speeding up builds.
- `verbatimModuleSyntax: true` — enforces `import type` for type-only imports, making the ESM boundary explicit.
- `noUncheckedIndexedAccess: true` — catches a common source of `undefined` bugs that base `strict` doesn't cover.
- `exactOptionalPropertyTypes: true` — distinguishes between `undefined` and "not present" in optional properties.

### Package-Level `tsconfig.json` Pattern

Each package extends the root config and sets its own boundaries:

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- `outDir` and `rootDir` are repeated to make each package self-contained (editors and tools resolve these relative to the nearest `tsconfig.json`).
- `include` scopes compilation to `src/` only — test files, configs, and scripts are excluded from the build.

---

## 4. tsdown

### Shared `tsdown.config.ts` Pattern (Library Packages)

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  outDir: "dist",
  clean: true,
});
```

**Key decisions:**

- `format: "esm"` — ESM-only, no CJS dual output. Matches `"type": "module"` in every `package.json`.
- `dts: true` — generates `.d.ts` files. Works fast because of `isolatedDeclarations: true` in `tsconfig.json`.
- `clean: true` — removes stale output before each build. Prevents leftover files from causing phantom imports.
- `platform` is omitted (defaults to `neutral`) — appropriate for library packages that may run in Node or bundled into a mobile app.

For packages that are Node-only (e.g., `db`), add `platform: "node"` to the config.

### Package `package.json` Exports Pattern

Every buildable package uses the `exports` field for clean ESM resolution:

```jsonc
{
  "name": "@plotpoint/<package-name>",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint src/",
    "format": "oxfmt src/",
    "test": "vitest run"
  }
}
```

- `exports` replaces `main`/`types` — the modern standard for package entry points.
- `files: ["dist"]` — only the built output is relevant for consumption (even in a monorepo, this keeps things clean).
- Scripts call tools directly — Turborepo invokes these per-package scripts via the pipeline.

---

## 5. oxlint

### `.oxlintrc.json`

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/nicolo-ribaudo/oxc-project/refs/heads/nicolo/oxlint-schema/npm/oxlint/configuration_schema.json",
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "warn",
    "eqeqeq": "error"
  },
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "plugins": ["typescript"],
  "ignorePatterns": ["dist", "node_modules"]
}
```

**Key decisions:**

- `correctness: error` — catches definite bugs (unreachable code, invalid types, wrong usage patterns).
- `suspicious: warn` — flags code that is likely wrong but may have legitimate uses.
- `typescript` plugin — enables TypeScript-specific lint rules.
- `no-console: warn` — catches accidental console.log in library packages. App packages can override if needed.
- `ignorePatterns` excludes build output and dependencies.

---

## 6. oxfmt

### `.oxfmtrc.json`

```jsonc
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "ignorePatterns": ["dist", "node_modules"]
}
```

**Key decisions:**

- `printWidth: 100` — wider than the 80-char default; reduces unnecessary line wrapping in TypeScript generics and function signatures.
- `singleQuote: true` — consistent with TypeScript ecosystem conventions.
- `trailingComma: "all"` — cleaner git diffs when adding items to arrays/objects/parameters.
- `semi: true` — explicit semicolons prevent ASI edge cases.

---

## 7. Vitest

### Per-Package `vitest.config.ts` Pattern

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

**Key decisions:**

- Test file discovery matches the CLAUDE.md convention: `src/__tests__/**/*.test.ts`. Tests live in `__tests__/` folders, not next to source files.
- No root-level Vitest workspace config — each package is self-contained with its own `vitest.config.ts`, run independently by Turborepo.
- No coverage reporter configured in Phase 1. Coverage can be added per-package when meaningful thresholds exist.

---

## 8. Package Scaffold Template

Every package in the monorepo follows this canonical file structure:

```
packages/<name>/
  package.json
  tsconfig.json
  tsdown.config.ts       # only if buildable (produces dist/)
  vitest.config.ts
  src/
    index.ts
    __tests__/
```

### Files per package:


| File               | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `package.json`     | Name, type, exports, scripts, dependencies |
| `tsconfig.json`    | Extends root, sets include/outDir/rootDir  |
| `tsdown.config.ts` | Build config (omit for empty packages)     |
| `vitest.config.ts` | Test config with `__tests__/` discovery    |
| `src/index.ts`     | Package entry point (barrel export)        |
| `src/__tests__/`   | Test directory                             |


### Packages receiving this scaffold:


| Package      | Buildable | Notes                             |
| ------------ | --------- | --------------------------------- |
| `types`      | Yes       | Shared TypeScript types           |
| `schemas`    | Yes       | Zod validation schemas            |
| `db`         | Yes       | Drizzle ORM, `platform: "node"`   |
| `engine`     | No        | Empty — implementation in Phase 2 |
| `components` | No        | Empty — implementation in Phase 3 |


Empty packages (`engine`, `components`) still get `package.json`, `tsconfig.json`, `vitest.config.ts`, and `src/index.ts` — but no `tsdown.config.ts` until they have code to build. Their `src/index.ts` exports nothing (empty file) and their test directory contains a single placeholder test to satisfy the "at least one passing test per package" acceptance criterion.

---

## 9. Acceptance Criteria

- `pnpm install` from root succeeds with no errors
- `pnpm turbo build` succeeds across all packages (no type errors, no build failures)
- `pnpm turbo test` runs Vitest in every package with at least one passing test per package
- `pnpm turbo typecheck` passes with strict TypeScript in every package
- `pnpm turbo lint` runs oxlint across all packages with zero errors
- `pnpm turbo format` runs oxfmt across all packages
- Each package is self-contained (own `package.json`, `tsconfig.json`, `vitest.config.ts`)
- ESM-only throughout — no CJS outputs, `"type": "module"` in every `package.json`
- No runtime logic, UI, or business logic in any package
- `tsdown` generates `.d.ts` files for all buildable packages
- Cross-package imports resolve correctly (e.g., `schemas` imports from `types`)

---

## 10. Out of Scope

- Any runtime logic, UI, or business logic
- Schema definitions — covered by `[core-domain-schemas.md](core-domain-schemas.md)`
- Database tables — covered by `[database-skeleton.md](database-skeleton.md)`
- App shell contents — covered by `[app-shells.md](app-shells.md)`
- Story JSON format — covered by `[story-json-format.md](story-json-format.md)`
- CI/CD pipeline configuration
- Remote caching setup for Turborepo
- Package publishing configuration

