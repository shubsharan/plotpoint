---
name: feature-workflow
description: Shared start and close workflow for Plotpoint FEAT delivery. Use for /start-feature and /close-feature.
---

# feature-workflow

This skill is the single implementation contract for `/start-feature` and `/close-feature`.

## Invocation Contract

- Expected input shape: `<mode> FEAT-XXXX`
- Valid modes: `start`, `close`
- If mode or feature ID is missing, stop and ask for `start FEAT-XXXX` or `close FEAT-XXXX`.

## Workflow Rules

1. Feature branch format is `FEAT-XXXX-<slug>`, which maps to `.git/refs/heads/FEAT-XXXX-<slug>`.
2. Feature lifecycle is `Not Started -> In Progress -> In Review -> Completed`.
3. Only the target feature PRD is mutated by this workflow.
4. Do not mark a feature `Completed` in `close` mode. `Completed` happens post-merge.

## Resolve Target Feature PRD

1. Parse uppercase feature ID (`FEAT-XXXX`) from input.
2. Find exactly one file matching `docs/features/FEAT-XXXX-*.md`.
3. Derive branch name from filename stem (for example, `docs/features/FEAT-0002-spec-driven-delivery-automation.md` -> `FEAT-0002-spec-driven-delivery-automation`).
4. Validate linked epic exists by reading the PRD metadata `Epic` field and checking `docs/epics/EPIC-XXXX-*.md`.
5. Validate the PRD has `## Acceptance Criteria` and `## Test Plan`.

## Start Mode

### Preconditions

- `git status --porcelain` is empty.
- Current branch is `main`.
- Local and remote refs do not already contain the target branch:
  - `git show-ref --verify --quiet refs/heads/<branch>`
  - `git ls-remote --heads origin <branch>`

### Steps

1. Create the branch from `main`:
   - `git checkout -b <branch> main`
2. Update the PRD metadata:
   - `Status` -> `In Progress`
   - `Last synced` -> current date (`YYYY-MM-DD`)
3. Commit only that PRD:
   - `git add docs/features/FEAT-XXXX-*.md`
   - `git commit -m "docs(FEAT-XXXX): start feature workflow"`
4. Push and create a draft PR:
   - `git push -u origin <branch>`
   - `gh pr create --draft ...` with summary, acceptance criteria checklist, and test-plan checklist from the PRD.
5. Stop and print handoff with branch, PR URL, and PRD path.

## Close Mode

### Preconditions

- Current branch equals derived feature branch.
- PRD status is `In Progress`.

### Steps

1. Run required verification commands in this order:
   - `pnpm build`
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm lint`
2. Validate all acceptance criteria checklist items are checked (`[x]`).
3. Update PRD metadata:
   - `Status` -> `In Review`
   - `Last synced` -> current date (`YYYY-MM-DD`)
4. Commit only that PRD:
   - `git add docs/features/FEAT-XXXX-*.md`
   - `git commit -m "docs(FEAT-XXXX): mark in review"`
5. Push branch and update PR description with verification results.
6. Stop and print review-ready handoff. Include that `Completed` is post-merge/manual.

## Error Handling

- Missing PRD: `No PRD found at docs/features/ for FEAT-XXXX.`
- Multiple PRDs for same feature: `Multiple PRDs found for FEAT-XXXX. Resolve duplicates before continuing.`
- Dirty worktree: `Uncommitted changes detected. Commit or stash before running this workflow.`
- Wrong start branch: `Start mode requires current branch main.`
- Branch exists: `Branch FEAT-XXXX-<slug> already exists locally or on origin.`
- Wrong close branch: `Close mode must run from FEAT-XXXX-<slug>.`
- Incomplete acceptance criteria: `Acceptance criteria must be fully checked before close-feature can continue.`
- Missing `gh`: `GitHub CLI (gh) is required for draft PR creation/update.`
