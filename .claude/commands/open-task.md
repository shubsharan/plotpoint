---
name: open-task
description: Import a Notion Task spec into the repo and scaffold a feature branch with draft PR. The Task is the atomic unit — one Task = one branch = one PR.
user_invocable: true
---

# /open-task

Import a Notion Task into the repo, create a feature branch, and open a draft PR.

## Inputs

The user provides one of:
- A Notion Task URL (e.g., `https://www.notion.so/...`)
- An Issue ID (e.g., `PP-12`)

Optional: branch name override.

## Database References

- **Tasks DB data source:** `collection://321997b3-842e-81d8-a513-000baef70a0f`
- **Docs DB data source:** `collection://321997b3-842e-818a-8bc9-000b3269a03d`
- **Projects DB data source:** `collection://321997b3-842e-8129-a3a5-000bd62b51ec`

## Steps

### 1. Resolve the Task

If the user gave a URL, fetch it directly with `notion-fetch`.

If the user gave an Issue ID (e.g., `PPT-12`), query the Tasks DB:
```
Use notion-search or notion-query-database-view to find the task by Issue ID.
```

Extract from the Task page:
- **Title** (Name property)
- **Issue ID** (e.g., `PPT-12`)
- **Status**
- **Project** relation
- **Docs** relation (links to PRDs, ADRs, Architecture docs)
- **Blocked By** / **Is Blocking** relations
- **Page content** (Context, Requirements, Affected Packages & Files, Acceptance Criteria, Dependencies, Technical Notes)

### 2. Fetch linked context

Follow the Task's **Docs** relation to fetch linked PRD(s), ADR(s), and Architecture docs.
Follow the Task's **Project** relation to get project context (Summary, Status).

### 3. Create issue branch

```bash
git checkout main && git pull
git checkout -b feat/PPT-{id}-{slug}
```

Where `{slug}` is the task title lowercased, spaces replaced with hyphens, non-alphanumeric chars removed, truncated to 50 chars.

If the user provided a branch name override, use that instead.

### 4. Import the PRD

For each linked Doc with Type=PRD that isn't already in `docs/prds/`:

Convert to markdown with metadata header:

```markdown
| Field | Value |
|---|---|
| **Source** | [PRD title](Notion URL) |
| **Type** | PRD |
| **Status** | from Notion |
| **Project** | from Project relation |
| **Domains** | from Domains property |
| **Last synced** | current timestamp |

{page content converted to clean markdown}
```

File naming: `docs/prds/PRD-{slug}.md` where `{slug}` comes from the PRD page title.

### 5. Import the Task spec

Write the Task content to `docs/tasks/PPT-{id}-{slug}.md` with metadata header:

```markdown
| Field | Value |
|---|---|
| **Source** | [Task title](Notion URL) |
| **Type** | Task |
| **Status** | from Notion Status property |
| **Project** | from Project relation |
| **Issue ID** | PP-{id} |
| **Last synced** | current timestamp |

{page content converted to clean markdown}
```

### 6. Import any linked ADRs or Architecture docs

For each linked Doc with Type=ADR, write to `docs/adrs/ADR-{slug}.md`.
For each linked Doc with Type=Architecture, write to `docs/architecture/{slug}.md`.

Use the same metadata header format, substituting the appropriate Type.

### 7. Notion-to-markdown conversion rules

When converting Notion page content to repo markdown:
- Strip Notion-specific formatting (colors, icons, callout blocks → plain blockquotes)
- Convert Notion to-do blocks → `- [ ]` / `- [x]` checkboxes
- Preserve code blocks with language tags
- Convert Notion mention links (`<mention url="...">text</mention>`) to plain text or relative repo paths where the target is a known imported doc
- Remove Notion page/database embed tags
- Preserve heading hierarchy, bold, italic, lists, tables
- Add metadata table at top from Notion properties

### 8. Create scaffolding commit

```bash
git add docs/
git commit -m "docs: import PPT-{id} specs from Notion"
```

### 9. Open draft PR

```bash
gh pr create --draft \
  --title "PPT-{id}: {task name}" \
  --body "$(cat <<'EOF'
## Summary
{Task Context section from the imported spec}

## Acceptance Criteria
{AC checklist from the Task, as markdown checkboxes}

## Linked PRD
- [{PRD title}](relative path to imported PRD in docs/prds/)

## Notion
- [Task](Notion Task URL)
- [PRD](Notion PRD URL)

EOF
)"
```

## Doc Type Templates

When creating docs that don't yet exist in Notion but need to be scaffolded, use these content structures:

### PRD
```markdown
## Goal
## Background & Context
## Scope
### In scope
### Out of scope
## High-level Requirements
## Architecture & Key Decisions
## Cross-cutting Concerns
## Open Questions
```

### ADR
```markdown
## Status
Proposed | Accepted | Deprecated | Superseded by [ADR-xxx]
## Context
## Options Considered
### Option A: [Name]
### Option B: [Name]
## Decision
## Consequences
```

### Architecture
```markdown
## Overview
## System Design
## Key Components
## Constraints & Principles
## References
```

### Task
```markdown
## Context
## Requirements
## Affected Packages & Files
## Acceptance Criteria
## Dependencies
## Technical Notes
```

## Error Handling

- If the Task has no Docs relation, skip PRD/ADR import and note it in the PR body
- If a doc file already exists in the repo, skip it (don't overwrite) and note "already imported"
- If the Task status is "Done" or "Archived", warn the user before proceeding
- If `git checkout -b` fails (branch exists), ask the user for a branch name override
