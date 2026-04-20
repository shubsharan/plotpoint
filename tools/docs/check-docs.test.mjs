import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const scriptPath = path.resolve('tools/docs/check-docs.mjs');

function write(relativePath, content, cwd) {
  const fullPath = path.join(cwd, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createBaseDocsFixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'plotpoint-docs-check-'));

  write(
    'docs/index.md',
    `# Documentation Index

## Current State

### Epic Status Rollup

| Epic      | Status    | Doc                                                        |
| --------- | --------- | ---------------------------------------------------------- |
| EPIC-0001 | Planned   | [epics/EPIC-0001-test-epic.md](epics/EPIC-0001-test-epic.md) |

### Feature Status Rollup

| Feature   | Epic      | Status      | Doc                                                                |
| --------- | --------- | ----------- | ------------------------------------------------------------------ |
| FEAT-0001 | EPIC-0001 | Not Started | [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md) |

## Docs Inventory

### \`product/\`

- [product/product-roadmap.md](product/product-roadmap.md)
- [product/product-strategy.md](product/product-strategy.md)

### \`runbooks/\`

- [runbooks/deferred-followups.md](runbooks/deferred-followups.md)

### \`epics/\`

- [epics/EPIC-0001-test-epic.md](epics/EPIC-0001-test-epic.md)

### \`features/\`

- [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md)

### \`architecture/\`

- [architecture/test-architecture.md](architecture/test-architecture.md)

### \`adrs/\`

- [adrs/ADR-0001-test-decision.md](adrs/ADR-0001-test-decision.md)
`,
    cwd,
  );

  write('docs/product/product-roadmap.md', '# Roadmap\n', cwd);
  write('docs/product/product-strategy.md', '# Strategy\n', cwd);
  write('docs/architecture/test-architecture.md', '# Architecture\n', cwd);
  write(
    'docs/adrs/ADR-0001-test-decision.md',
    `| Field                           | Value |
| ------------------------------- | ----- |
| **Status**                      | Accepted |
| **Date**                        | 2026-04-15 |
| **Deciders**                    | product-engineering |
| **Related Epics**               | [EPIC-0001-test-epic](../epics/EPIC-0001-test-epic.md) |
| **Related Feature PRDs**        | [FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md) |
| **Related Architecture Docs**   | [test-architecture](../architecture/test-architecture.md) |

# ADR-0001 - Test Decision
`,
    cwd,
  );
  write('docs/runbooks/deferred-followups.md', '# Deferred Follow-ups\n', cwd);

  write(
    'docs/epics/EPIC-0001-test-epic.md',
    `| Field                                        | Value |
| -------------------------------------------- | ----- |
| **Status**                                   | Planned |
| **Product and Architecture Docs**            | [product-roadmap](../product/product-roadmap.md)<br>[product-strategy](../product/product-strategy.md)<br>[test-architecture](../architecture/test-architecture.md) |
| **Related Epics and Cross-PRD Dependencies** | None. |
| **Related ADRs**                             | [ADR-0001-test-decision](../adrs/ADR-0001-test-decision.md) |
| **Feature Breakdown**                        | [FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md) |

# EPIC-0001 - Test Epic

## Goal

Test epic.

## Context

Test context.

## Scope

### In scope

- Item

### Out of scope

- Item

## Success Criteria

- Works

## Risks and Mitigations

- Risk and mitigation

## Milestones and Sequencing

1. Step

## Open Questions

- None.
`,
    cwd,
  );

  write(
    'docs/features/FEAT-0001-test-feature.md',
    `| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0001-test-epic](../epics/EPIC-0001-test-epic.md) |
| **Related Feature PRDs**      | None. |
| **Related ADRs**              | [ADR-0001-test-decision](../adrs/ADR-0001-test-decision.md) |
| **Related Architecture Docs** | [test-architecture](../architecture/test-architecture.md) |

# FEAT-0001 - Test Feature

## Goal

Test feature.

## Background and Context

Test context.

## Scope

### In scope

- Item

### Out of scope

- Item

## Requirements

1. Requirement

## Architecture and Technical Notes

- Note

## Acceptance Criteria

- [ ] Done

## Test Plan

- Tests

## Rollout and Observability

- None.

## Risks and Mitigations

- Risk and mitigation

## Open Questions

- None.
`,
    cwd,
  );

  return cwd;
}

function runDocsCheck(cwd) {
  execFileSync(process.execPath, [scriptPath], {
    cwd,
    stdio: 'pipe',
  });
}

function runDocsCheckFailure(cwd) {
  try {
    runDocsCheck(cwd);
    assert.fail('expected docs:check to fail');
  } catch (error) {
    return String(error.stderr ?? error.message);
  }
}

test('docs:check passes for valid metadata-table contracts', () => {
  const cwd = createBaseDocsFixture();
  assert.doesNotThrow(() => runDocsCheck(cwd));
});

test('docs:check fails when a feature PRD is missing the parent epic row', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      /^\| \*\*Parent Epic\*\*.*\n/m,
      '',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /missing table field \*\*Parent Epic\*\*/);
});

test('docs:check fails when a relationship row mixes links with None', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      '| **Related Feature PRDs**      | None. |',
      '| **Related Feature PRDs**      | None.<br>[FEAT-9999-missing](../features/FEAT-9999-missing.md) |',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /"Related Feature PRDs" cannot mix doc links with 'None\.'/);
});

test('docs:check fails when a parent epic cell is plain text instead of a link', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      /\[EPIC-0001-test-epic\]\(\.\.\/epics\/EPIC-0001-test-epic\.md\)/,
      'EPIC-0001-test-epic',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /"Parent Epic" must contain linked docs/);
});

test('docs:check fails when a required related-doc link target is missing', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      '../adrs/ADR-0001-test-decision.md',
      '../adrs/ADR-missing.md',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /links missing doc 'adrs\/ADR-missing\.md'/);
});

test('docs:check parses multi-link table cells', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0002-peer-feature.md',
    `| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0001-test-epic](../epics/EPIC-0001-test-epic.md) |
| **Related Feature PRDs**      | [FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md) |
| **Related ADRs**              | None. |
| **Related Architecture Docs** | None. |

# FEAT-0002 - Peer Feature

## Goal

Peer feature.

## Background and Context

Peer context.

## Scope

### In scope

- Item

### Out of scope

- Item

## Requirements

1. Requirement

## Architecture and Technical Notes

- Note

## Acceptance Criteria

- [ ] Done

## Test Plan

- Tests

## Rollout and Observability

- None.

## Risks and Mitigations

- Risk and mitigation

## Open Questions

- None.
`,
    cwd,
  );
  write(
    'docs/index.md',
    readFileSync(path.join(cwd, 'docs/index.md'), 'utf8').replace(
      '| FEAT-0001 | EPIC-0001 | Not Started | [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md) |',
      `| FEAT-0001 | EPIC-0001 | Not Started | [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md) |
| FEAT-0002 | EPIC-0001 | Not Started | [features/FEAT-0002-peer-feature.md](features/FEAT-0002-peer-feature.md) |`,
    ).replace(
      '- [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md)',
      `- [features/FEAT-0001-test-feature.md](features/FEAT-0001-test-feature.md)
- [features/FEAT-0002-peer-feature.md](features/FEAT-0002-peer-feature.md)`,
    ),
    cwd,
  );
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      '| **Related Feature PRDs**      | None. |',
      '| **Related Feature PRDs**      | [FEAT-0002-peer-feature](../features/FEAT-0002-peer-feature.md)<br>[FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md) |',
    ),
    cwd,
  );

  assert.doesNotThrow(() => runDocsCheck(cwd));
});

test('docs:check allows an epic with no feature PRDs when feature breakdown uses None', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/index.md',
    `# Documentation Index

## Current State

### Epic Status Rollup

| Epic      | Status    | Doc                                                        |
| --------- | --------- | ---------------------------------------------------------- |
| EPIC-0001 | Planned   | [epics/EPIC-0001-test-epic.md](epics/EPIC-0001-test-epic.md) |

### Feature Status Rollup

| Feature   | Epic      | Status      | Doc |
| --------- | --------- | ----------- | --- |

## Docs Inventory

### \`product/\`

- [product/product-roadmap.md](product/product-roadmap.md)
- [product/product-strategy.md](product/product-strategy.md)

### \`runbooks/\`

- [runbooks/deferred-followups.md](runbooks/deferred-followups.md)

### \`epics/\`

- [epics/EPIC-0001-test-epic.md](epics/EPIC-0001-test-epic.md)

### \`architecture/\`

- [architecture/test-architecture.md](architecture/test-architecture.md)

### \`adrs/\`

- [adrs/ADR-0001-test-decision.md](adrs/ADR-0001-test-decision.md)
`,
    cwd,
  );
  write(
    'docs/epics/EPIC-0001-test-epic.md',
    readFileSync(path.join(cwd, 'docs/epics/EPIC-0001-test-epic.md'), 'utf8').replace(
      /\| \*\*Feature Breakdown\*\*.*\n/,
      '| **Feature Breakdown**                        | None. |\n',
    ),
    cwd,
  );
  write(
    'docs/adrs/ADR-0001-test-decision.md',
    readFileSync(path.join(cwd, 'docs/adrs/ADR-0001-test-decision.md'), 'utf8').replace(
      /\| \*\*Related Feature PRDs\*\*.*\n/,
      '| **Related Feature PRDs**        | None. |\n',
    ),
    cwd,
  );

  rmSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'));

  assert.doesNotThrow(() => runDocsCheck(cwd));
});

test('docs:check fails when an epic feature breakdown links a non-feature doc', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/epics/EPIC-0001-test-epic.md',
    readFileSync(path.join(cwd, 'docs/epics/EPIC-0001-test-epic.md'), 'utf8').replace(
      '../features/FEAT-0001-test-feature.md',
      '../adrs/ADR-0001-test-decision.md',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /"Feature Breakdown" contains invalid link 'adrs\/ADR-0001-test-decision\.md'/);
});

test('docs:check fails when an ADR is missing a required metadata row', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/adrs/ADR-0001-test-decision.md',
    readFileSync(path.join(cwd, 'docs/adrs/ADR-0001-test-decision.md'), 'utf8').replace(
      /^\| \*\*Date\*\*.*\n/m,
      '',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /missing table field \*\*Date\*\*/);
});
