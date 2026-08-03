#!/usr/bin/env bash

set -euo pipefail
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

require_content() {
    local file="$1" expected="$2"
    grep -Fq -- "$expected" "$SOURCE_ROOT/$file" || {
        echo "Missing restored Spec Kit content in $file: $expected" >&2
        exit 1
    }
}

require_content .agents/skills/speckit-specify/SKILL.md 'Specification Quality Validation'
require_content .agents/skills/speckit-plan/SKILL.md 'Phase 0: Generate research.md'
require_content .agents/skills/speckit-tasks/SKILL.md 'Generate dependency graph showing user story completion order'
require_content .agents/skills/speckit-analyze/SKILL.md 'STRICTLY READ-ONLY'
require_content .agents/skills/speckit-implement/SKILL.md 'Check checklists status'
require_content .specify/templates/spec-template.md '## User Scenarios & Testing'
require_content .specify/templates/spec-template.md '## Success Criteria'
require_content .specify/templates/plan-template.md '## Technical Context'
require_content .specify/templates/plan-template.md '## Constitution Check'
require_content .specify/templates/tasks-template.md '## Dependencies & Execution Order'
require_content .specify/templates/spec-template.md '**Epic**: None'
require_content .specify/templates/plan-template.md '**Impact**: None'
require_content .specify/workflows/speckit/workflow.yml 'id: review-spec'
require_content .specify/workflows/speckit/workflow.yml 'id: review-plan'
require_content .specify/workflows/speckit/workflow.yml 'id: analyze'
require_content .specify/workflows/speckit/workflow.yml 'id: review-readiness'

cp -R "$SOURCE_ROOT/.specify" "$TEST_ROOT/.specify"
mkdir -p "$TEST_ROOT/docs/adrs"
cp "$SOURCE_ROOT/docs/adrs/README.md" "$TEST_ROOT/docs/adrs/README.md"
printf '# Roadmap\n\n<!-- speckit:generated:roadmap-epics START -->\n<!-- speckit:generated:roadmap-epics END -->\n' > "$TEST_ROOT/docs/roadmap.md"

git -C "$TEST_ROOT" init -q -b main
git -C "$TEST_ROOT" config user.email test@example.com
git -C "$TEST_ROOT" config user.name Test
git -C "$TEST_ROOT" add .
git -C "$TEST_ROOT" commit -qm baseline

cd "$TEST_ROOT"
field_from() {
    local key="$1"
    sed -n "s/^$key: //p" | head -1
}

.specify/scripts/bash/create-new-epic.sh --short-name policy 'Policy epic' >/dev/null
epic=docs/epics/0001-policy/epic.md
perl -pi -e 's/# Epic: \[EPIC NAME\]/# Epic: Policy epic/' "$epic"
feature_output=$(.specify/scripts/bash/create-new-feature.sh --short-name budget-policy 'Budget policy')
feature_dir=$(printf '%s\n' "$feature_output" | field_from FEATURE_DIR)
spec="$feature_dir/spec.md"
perl -pi -e 's|feature/\[NNNN-short-name\]|feature/0001-budget-policy|' "$spec"
perl -pi -e 's|\*\*Epic\*\*: None|**Epic**: [Policy](../../epics/0001-policy/epic.md)|' "$spec"
printf '{"feature_directory":"docs/features/0001-budget-policy"}\n' > .specify/feature.json

.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null
grep -Fq -- '- [Policy epic](epics/0001-policy/epic.md) — Pending' docs/roadmap.md

git switch main >/dev/null
core_existing=$(.specify/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' | field_from BRANCH_NAME)
extension_existing=$(.specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' | field_from BRANCH_NAME)
core_next=$(.specify/scripts/bash/create-new-feature.sh --dry-run --short-name next-feature 'Next feature' | field_from BRANCH_NAME)
extension_next=$(.specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name next-feature 'Next feature' | field_from BRANCH_NAME)
[[ "$core_existing" == feature/0001-budget-policy ]]
[[ "$extension_existing" == feature/0001-budget-policy ]]
[[ "$core_next" == feature/0002-next-feature ]]
[[ "$extension_next" == feature/0002-next-feature ]]

mkdir docs/features/0007-budget-policy
if .specify/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' >/dev/null 2>&1; then
    echo 'Core creator unexpectedly accepted duplicate feature artifacts' >&2
    exit 1
fi
if .specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' >/dev/null 2>&1; then
    echo 'Git extension unexpectedly accepted duplicate feature artifacts' >&2
    exit 1
fi
rmdir docs/features/0007-budget-policy
git switch feature/0001-budget-policy >/dev/null

source .specify/scripts/bash/common.sh
check_feature_branch feature/0001-budget-policy true
if check_feature_branch feature/budget-policy true 2>/dev/null; then
    echo 'Unnumbered feature branch unexpectedly passed validation' >&2
    exit 1
fi

cp "$epic" "$TEST_ROOT/epic-valid"
perl -pi -e 's/^status: Pending$/status: Active/; $_ = "" if /speckit:generated:epic-features END/' "$epic"
printf '\nSENTINEL_AFTER_BLOCK\n' >> "$epic"
cp "$epic" "$TEST_ROOT/epic-malformed"
if .specify/scripts/bash/sync-docs.sh >/dev/null 2>&1; then
    echo 'Sync unexpectedly accepted a missing generated END marker' >&2
    exit 1
fi
cmp -s "$epic" "$TEST_ROOT/epic-malformed" || { echo 'Sync changed a malformed generated document' >&2; exit 1; }
grep -q SENTINEL_AFTER_BLOCK "$epic"
cp "$TEST_ROOT/epic-valid" "$epic"

printf '\n<!-- speckit:generated:epic-features START -->\n' >> "$epic"
cp "$epic" "$TEST_ROOT/epic-duplicate"
if .specify/scripts/bash/sync-docs.sh >/dev/null 2>&1; then
    echo 'Sync unexpectedly accepted duplicate generated markers' >&2
    exit 1
fi
cmp -s "$epic" "$TEST_ROOT/epic-duplicate" || { echo 'Sync changed a document with duplicate markers' >&2; exit 1; }
cp "$TEST_ROOT/epic-valid" "$epic"
.specify/scripts/bash/sync-docs.sh

adr_output=$(.specify/scripts/bash/create-new-adr.sh --short-name budget-contract 'Budget contract')
adr_file=$(printf '%s\n' "$adr_output" | field_from ADR_FILE)
cp .specify/templates/plan-template.md "$feature_dir/plan.md"
perl -0pi -e 's/\*\*Impact\*\*: None/**Impact**: Major/; s/\nNone\.\n/\n- [Budget contract](..\/..\/adrs\/0001-budget-contract.md)\n/' "$feature_dir/plan.md"
perl -0pi -e 's/## Architecture Decisions\n\nNone\./## Architecture Decisions\n\n- [Budget contract](..\/..\/adrs\/0001-budget-contract.md)/' "$spec"

.specify/scripts/bash/sync-docs.sh
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Major feature with Proposed ADR unexpectedly passed validation' >&2
    exit 1
fi
perl -pi -e 's/^status: Proposed$/status: Accepted/' "$adr_file"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

replacement_output=$(.specify/scripts/bash/create-new-adr.sh --short-name budget-contract-v2 'Budget contract v2')
replacement=$(printf '%s\n' "$replacement_output" | field_from ADR_FILE)
perl -pi -e 's/^status: Proposed$/status: Accepted/; s|^\*\*Supersedes\*\*: None$|**Supersedes**: [Budget contract](0001-budget-contract.md)|' "$replacement"
perl -pi -e 's/^status: Accepted$/status: Superseded/; s|^\*\*Superseded by\*\*: None$|**Superseded by**: [Budget contract v2](0002-budget-contract-v2.md)|' "$adr_file"
.specify/scripts/bash/sync-docs.sh
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Feature referencing a Superseded ADR unexpectedly passed validation' >&2
    exit 1
fi
perl -pi -e 's/0001-budget-contract\.md/0002-budget-contract-v2.md/g' "$spec" "$feature_dir/plan.md"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

perl -pi -e 's/^status: Pending$/status: Active/' "$spec"
mkdir -p "$TEST_ROOT/bin"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    '[[ "${FAKE_GH_FAIL:-false}" == true ]] && exit 127' \
    'case "${1:-} ${2:-}" in' \
    '  "repo view") printf "%s\\n" "${FAKE_REPO_URL:-https://github.com/example/plotpoint}" ;;' \
    '  "pr list") printf "%s\\t%s\\n" "${FAKE_PR_URL:-https://github.com/example/plotpoint/pull/1}" "${FAKE_PR_STATE:-MERGED}" ;;' \
    '  "pr view") printf "%s\\t%s\\t%s\\n" "${FAKE_PR_STATE:-MERGED}" "${FAKE_PR_HEAD:-feature/0001-budget-policy}" "${FAKE_PR_URL:-https://github.com/example/plotpoint/pull/1}" ;;' \
    '  *) exit 2 ;;' \
    'esac' > "$TEST_ROOT/bin/gh"
chmod +x "$TEST_ROOT/bin/gh"
export PATH="$TEST_ROOT/bin:$PATH"
.specify/scripts/bash/refresh-pr-status.sh
.specify/scripts/bash/sync-docs.sh
grep -q '^status: Done$' "$spec"
grep -q '^status: Done$' docs/epics/0001-policy/epic.md

export FAKE_GH_FAIL=true
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature unexpectedly passed when GitHub verification failed' >&2
    exit 1
fi
export FAKE_GH_FAIL=false
export FAKE_PR_STATE=OPEN
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature unexpectedly accepted an open PR' >&2
    exit 1
fi
export FAKE_PR_STATE=CLOSED
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature unexpectedly accepted a closed, unmerged PR' >&2
    exit 1
fi
export FAKE_PR_STATE=MERGED FAKE_PR_HEAD=feature/9999-wrong-feature
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature unexpectedly accepted a PR from another branch' >&2
    exit 1
fi
export FAKE_PR_HEAD=feature/0001-budget-policy FAKE_REPO_URL=https://github.com/example/other
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature unexpectedly accepted a PR from another repository' >&2
    exit 1
fi
export FAKE_REPO_URL=https://github.com/example/plotpoint
.specify/scripts/bash/check-workflow.sh >/dev/null

echo 'Spec Kit workflow contract tests passed.'
