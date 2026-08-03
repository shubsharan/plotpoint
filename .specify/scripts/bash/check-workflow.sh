#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
REPO_ROOT=$(get_repo_root)
FEATURES_DIR=$(get_features_dir "$REPO_ROOT")
EPICS_DIR=$(get_epics_dir "$REPO_ROOT")
ADR_DIR=$(get_adr_dir "$REPO_ROOT")
ERRORS=0

fail() { echo "ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }
status_of() { awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^status:[[:space:]]*/{sub(/^status:[[:space:]]*/, ""); print; exit}' "$1"; }

check_frontmatter() {
    local file="$1" allowed="$2" status keys
    keys=$(awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^[A-Za-z0-9_-]+:/{count++} END{print count+0}' "$file")
    [[ "$keys" == 1 ]] || fail "${file#$REPO_ROOT/} frontmatter must contain only status"
    status=$(status_of "$file")
    case " $allowed " in *" $status "*) ;; *) fail "${file#$REPO_ROOT/} has invalid status '$status'" ;; esac
}

adr_refs() {
    grep -oE '\.\./\.\./adrs/[0-9]{4}-[a-z0-9-]+\.md' "$1" 2>/dev/null | sed 's|../../adrs/||' | sort -u || true
}

verify_done_pr() {
    local spec="$1" branch="$2" pr_line url linked_url repo_url pr_info state head pr_url
    pr_line=$(grep -E '^\*\*PR\*\*: \[https://github\.com/.+/pull/[0-9]+\]\(https://github\.com/.+/pull/[0-9]+\)$' "$spec" | head -1 || true)
    [[ -n "$pr_line" ]] || { fail "${spec#$REPO_ROOT/} is Done without a merged PR link"; return; }
    url=$(printf '%s\n' "$pr_line" | sed -n 's/^\*\*PR\*\*: \[\([^]]*\)\](\([^)]*\))$/\1/p')
    linked_url=$(printf '%s\n' "$pr_line" | sed -n 's/^\*\*PR\*\*: \[\([^]]*\)\](\([^)]*\))$/\2/p')
    [[ "$url" == "$linked_url" ]] || { fail "${spec#$REPO_ROOT/} PR label and link must match"; return; }
    command -v gh >/dev/null 2>&1 || { fail "gh is required to validate Done feature ${spec#$REPO_ROOT/}"; return; }

    if ! repo_url=$(gh repo view --json url --jq '.url' 2>/dev/null); then
        fail "could not resolve the GitHub repository for ${spec#$REPO_ROOT/}"
        return
    fi
    repo_url="${repo_url%.git}"
    repo_url="${repo_url%/}"
    [[ "$url" == "$repo_url/pull/"* ]] || { fail "${spec#$REPO_ROOT/} PR does not belong to $repo_url"; return; }

    if ! pr_info=$(gh pr view "$url" --json state,headRefName,url --jq '[.state, .headRefName, .url] | @tsv' 2>/dev/null); then
        fail "could not verify PR for ${spec#$REPO_ROOT/}"
        return
    fi
    IFS=$'\t' read -r state head pr_url <<< "$pr_info"
    [[ "$state" == MERGED ]] || { fail "${spec#$REPO_ROOT/} PR is $state, not MERGED"; return; }
    [[ "$head" == "$branch" ]] || { fail "${spec#$REPO_ROOT/} PR head is $head, expected $branch"; return; }
    [[ "$pr_url" == "$url" ]] || fail "${spec#$REPO_ROOT/} PR URL does not match GitHub"
}

while IFS= read -r epic; do
    check_frontmatter "$epic" 'Pending Active Done'
    [[ "$(basename "$(dirname "$epic")")" =~ ^[0-9]{4}-[a-z0-9][a-z0-9-]*$ ]] || fail "invalid epic path: ${epic#$REPO_ROOT/}"
done < <(find "$EPICS_DIR" -mindepth 2 -maxdepth 2 -name epic.md -type f 2>/dev/null | sort)

while IFS= read -r adr; do
    check_frontmatter "$adr" 'Proposed Accepted Superseded'
    [[ "$(basename "$adr")" =~ ^[0-9]{4}-[a-z0-9][a-z0-9-]*\.md$ ]] || fail "invalid ADR path: ${adr#$REPO_ROOT/}"

    supersedes=$(sed -n 's|^\*\*Supersedes\*\*: \[[^]]*\](\([^)]*\))$|\1|p' "$adr" | head -1)
    superseded_by=$(sed -n 's|^\*\*Superseded by\*\*: \[[^]]*\](\([^)]*\))$|\1|p' "$adr" | head -1)
    if [[ "$(status_of "$adr")" == Superseded && -z "$superseded_by" ]]; then
        fail "${adr#$REPO_ROOT/} is Superseded but has no replacement link"
    fi
    if [[ -n "$supersedes" ]]; then
        old="$(dirname "$adr")/$supersedes"
        if [[ ! -f "$old" ]]; then
            fail "${adr#$REPO_ROOT/} supersedes missing ADR $supersedes"
        else
            old_replacement=$(sed -n 's|^\*\*Superseded by\*\*: \[[^]]*\](\([^)]*\))$|\1|p' "$old" | head -1)
            [[ "$(status_of "$old")" == Superseded && "$old_replacement" == "$(basename "$adr")" ]] || \
                fail "${adr#$REPO_ROOT/} and $supersedes must record both sides of the supersession"
        fi
    fi
    if [[ -n "$superseded_by" ]]; then
        replacement="$(dirname "$adr")/$superseded_by"
        if [[ ! -f "$replacement" ]]; then
            fail "${adr#$REPO_ROOT/} references missing replacement ADR $superseded_by"
        else
            replacement_old=$(sed -n 's|^\*\*Supersedes\*\*: \[[^]]*\](\([^)]*\))$|\1|p' "$replacement" | head -1)
            [[ "$(status_of "$replacement")" == Accepted && "$replacement_old" == "$(basename "$adr")" ]] || \
                fail "${adr#$REPO_ROOT/} replacement must be Accepted and link back"
        fi
    fi
done < <(find "$ADR_DIR" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -type f 2>/dev/null | sort)

while IFS= read -r spec; do
    check_frontmatter "$spec" 'Pending Active Done'
    feature_dir=$(basename "$(dirname "$spec")")
    [[ "$feature_dir" =~ ^[0-9]{4}-([a-z0-9][a-z0-9-]*)$ ]] || { fail "invalid feature path: ${spec#$REPO_ROOT/}"; continue; }
    slug="$feature_dir"
    branch=$(sed -n 's/^\*\*Branch\*\*: `\([^`]*\)`$/\1/p' "$spec" | head -1)
    [[ "$branch" == "feature/$slug" ]] || fail "${spec#$REPO_ROOT/} must reference branch feature/$slug"

    epic_line=$(grep -E '^\*\*Epic\*\*:' "$spec" | head -1 || true)
    if [[ "$epic_line" != '**Epic**: None' ]]; then
        epic_dir=$(printf '%s\n' "$epic_line" | sed -n 's|^\*\*Epic\*\*: \[[^]]*\](../../epics/\([^/]*\)/epic.md)$|\1|p')
        [[ -n "$epic_dir" && -f "$EPICS_DIR/$epic_dir/epic.md" ]] || fail "${spec#$REPO_ROOT/} must reference an existing parent epic or None"
    fi

    state=$(status_of "$spec")
    if [[ "$state" == Done ]]; then
        verify_done_pr "$spec" "$branch"
    fi

    plan="$(dirname "$spec")/plan.md"
    spec_refs=$(adr_refs "$spec")
    if [[ -f "$plan" ]]; then
        plan_refs=$(adr_refs "$plan")
        [[ "$spec_refs" == "$plan_refs" ]] || fail "${spec#$REPO_ROOT/} and plan.md must reference the same ADRs"
        impact=$(sed -n 's/^\*\*Impact\*\*:[[:space:]]*//p' "$plan" | head -1)
        [[ "$impact" == None || "$impact" == Major ]] || fail "${plan#$REPO_ROOT/} Impact must be None or Major"
        if [[ "$impact" == Major && -z "$plan_refs" ]]; then
            fail "${plan#$REPO_ROOT/} declares Major impact without an ADR"
        fi
    fi

    while IFS= read -r ref; do
        [[ -n "$ref" ]] || continue
        adr="$ADR_DIR/$ref"
        [[ -f "$adr" ]] || { fail "${spec#$REPO_ROOT/} references missing ADR $ref"; continue; }
        adr_status=$(status_of "$adr")
        [[ "$adr_status" != Superseded ]] || fail "${spec#$REPO_ROOT/} references superseded ADR $ref"
        if [[ -f "$plan" && "${impact:-None}" == Major && "$adr_status" != Accepted ]]; then
            fail "${plan#$REPO_ROOT/} requires Accepted ADR $ref (currently $adr_status)"
        fi
    done <<< "$spec_refs"
done < <(find "$FEATURES_DIR" -mindepth 2 -maxdepth 2 -name spec.md -type f 2>/dev/null | sort)

if [[ -f "$REPO_ROOT/.specify/feature.json" ]] && git -C "$REPO_ROOT" branch --show-current | grep -q '^feature/'; then
    current=$(git -C "$REPO_ROOT" branch --show-current)
    active=$(read_feature_json_feature_directory "$REPO_ROOT")
    if [[ -n "$active" ]]; then
        active_slug=$(basename "$active")
        [[ "$current" == "feature/$active_slug" ]] || fail ".specify/feature.json does not match current branch $current"
    fi
fi

if ! "$SCRIPT_DIR/sync-docs.sh" --check; then
    ERRORS=$((ERRORS + 1))
fi

if ((ERRORS)); then
    echo "$ERRORS Spec Kit workflow error(s) found." >&2
    exit 1
fi
echo 'Spec Kit workflow is valid.'
