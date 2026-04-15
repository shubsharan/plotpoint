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
    `| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | ADR                 |
| **Date**        | 2026-04-15          |
| **Deciders**    | product-engineering |
| **Last synced** | 2026-04-15          |

# ADR-0001 - Test Decision
`,
    cwd,
  );
  write('docs/runbooks/deferred-followups.md', '# Deferred Follow-ups\n', cwd);

  write(
    'docs/epics/EPIC-0001-test-epic.md',
    `| Field           | Value      |
| --------------- | ---------- |
| **Type**        | Epic       |
| **Epic ID**     | EPIC-0001  |
| **Status**      | Planned    |
| **Last synced** | 2026-04-15 |

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

## Dependencies

### Product and Architecture Docs

- [product-roadmap](../product/product-roadmap.md)
- [product-strategy](../product/product-strategy.md)
- [test-architecture](../architecture/test-architecture.md)

### Related Epics and Cross-PRD Dependencies

- None.

### Related ADRs

- [ADR-0001-test-decision](../adrs/ADR-0001-test-decision.md)

## Risks and Mitigations

- Risk and mitigation

## Feature Breakdown

- [FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md)

## Milestones and Sequencing

1. Step

## Open Questions

- None.
`,
    cwd,
  );

  write(
    'docs/features/FEAT-0001-test-feature.md',
    `| Field           | Value      |
| --------------- | ---------- |
| **Type**        | PRD        |
| **Feature ID**  | FEAT-0001  |
| **Status**      | Not Started |
| **Epic**        | EPIC-0001  |
| **Domains**     | Docs       |
| **Last synced** | 2026-04-15 |

# FEAT-0001 - Test Feature

## Goal

Test feature.

## Background and Context

Test context.

## Related Docs

### Parent Epic

- [EPIC-0001-test-epic](../epics/EPIC-0001-test-epic.md)

### Related Feature PRDs

- None.

### Related ADRs

- [ADR-0001-test-decision](../adrs/ADR-0001-test-decision.md)

### Related Architecture Docs

- [test-architecture](../architecture/test-architecture.md)

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

test('docs:check passes for valid related-doc contracts', () => {
  const cwd = createBaseDocsFixture();
  assert.doesNotThrow(() => runDocsCheck(cwd));
});

test('docs:check fails when a feature PRD is missing the related docs section', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      /## Related Docs[\s\S]*?## Scope/,
      '## Scope',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /missing "## Related Docs" section/);
});

test('docs:check fails when a feature PRD omits the ADR declaration', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      /### Related ADRs[\s\S]*?### Related Architecture Docs/,
      '### Related Architecture Docs',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /missing "### Related ADRs" subsection/);
});

test('docs:check fails when parent epic is plain text instead of a link', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      '- [EPIC-0001-test-epic](../epics/EPIC-0001-test-epic.md)',
      '- EPIC-0001-test-epic',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /"Parent Epic" must contain linked docs/);
});

test('docs:check fails when a required group is empty without None', () => {
  const cwd = createBaseDocsFixture();
  write(
    'docs/features/FEAT-0001-test-feature.md',
    readFileSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'), 'utf8').replace(
      '- None.',
      '',
    ),
    cwd,
  );

  const stderr = runDocsCheckFailure(cwd);
  assert.match(stderr, /"Related Feature PRDs" must contain linked docs or '- None\.'/);
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

test('docs:check allows an epic with no feature PRDs when Feature Breakdown uses None', () => {
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
      '- [FEAT-0001-test-feature](../features/FEAT-0001-test-feature.md)',
      '- None.',
    ),
    cwd,
  );

  rmSync(path.join(cwd, 'docs/features/FEAT-0001-test-feature.md'));

  assert.doesNotThrow(() => runDocsCheck(cwd));
});
