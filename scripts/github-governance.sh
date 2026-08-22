#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
REPOSITORY='AndyBoWu/Intermission'
RULESET_NAME='Protect main'
RULESET_PATH="$PROJECT_ROOT/.github/rulesets/main.json"
API_VERSION='2026-03-10'

fail() {
  echo "github-governance: $*" >&2
  exit 1
}

for command_name in gh jq; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

gh auth status --hostname github.com >/dev/null 2>&1 \
  || fail "authenticate gh for github.com before managing repository settings"

api() {
  gh api \
    --hostname github.com \
    --header 'Accept: application/vnd.github+json' \
    --header "X-GitHub-Api-Version: $API_VERSION" \
    "$@"
}

find_ruleset_id() {
  local rulesets
  rulesets=$(api "repos/$REPOSITORY/rulesets?includes_parents=false")
  jq -er --arg name "$RULESET_NAME" \
    '[.[] | select(.name == $name and .source_type == "Repository")][0].id' \
    <<< "$rulesets"
}

apply_settings() {
  local ruleset_id

  jq -n '{
    enabled: true,
    allowed_actions: "selected",
    sha_pinning_required: true
  }' | api --method PUT "repos/$REPOSITORY/actions/permissions" --input - >/dev/null

  jq -n '{
    github_owned_allowed: true,
    verified_allowed: false,
    patterns_allowed: []
  }' | api --method PUT \
    "repos/$REPOSITORY/actions/permissions/selected-actions" --input - >/dev/null

  jq -n '{
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false
  }' | api --method PUT \
    "repos/$REPOSITORY/actions/permissions/workflow" --input - >/dev/null

  jq -n '{
    run_workflows_from_fork_pull_requests: true,
    send_write_tokens_to_workflows: false,
    send_secrets_and_variables: false,
    require_approval_for_fork_pr_workflows: true
  }' | api --method PUT \
    "repos/$REPOSITORY/actions/permissions/fork-pr-workflows-private-repos" \
    --input - >/dev/null

  api --method PATCH "repos/$REPOSITORY" \
    -F allow_auto_merge=false \
    -F allow_merge_commit=false \
    -F allow_rebase_merge=false \
    -F allow_squash_merge=true \
    -F allow_update_branch=true \
    -F delete_branch_on_merge=true >/dev/null

  if ruleset_id=$(find_ruleset_id); then
    api --method PUT "repos/$REPOSITORY/rulesets/$ruleset_id" \
      --input "$RULESET_PATH" >/dev/null
  else
    api --method POST "repos/$REPOSITORY/rulesets" \
      --input "$RULESET_PATH" >/dev/null
  fi
}

verify_settings() {
  local actions_json fork_json merge_json ruleset_id ruleset_json selected_json workflow_json

  merge_json=$(api "repos/$REPOSITORY")
  jq -e '
    .allow_auto_merge == false and
    .allow_merge_commit == false and
    .allow_rebase_merge == false and
    .allow_squash_merge == true and
    .allow_update_branch == true and
    .delete_branch_on_merge == true
  ' <<< "$merge_json" >/dev/null || fail "repository merge policy drifted"
  echo "ok - repository merge policy"

  actions_json=$(api "repos/$REPOSITORY/actions/permissions")
  jq -e '
    .enabled == true and
    .allowed_actions == "selected" and
    .sha_pinning_required == true
  ' <<< "$actions_json" >/dev/null || fail "Actions allowlist or SHA policy drifted"
  echo "ok - Actions allowlist and SHA policy"

  selected_json=$(api "repos/$REPOSITORY/actions/permissions/selected-actions")
  jq -e '
    .github_owned_allowed == true and
    .verified_allowed == false and
    ((.patterns_allowed // []) | length == 0)
  ' <<< "$selected_json" >/dev/null || fail "selected Actions policy drifted"
  echo "ok - GitHub-owned Actions only"

  workflow_json=$(api "repos/$REPOSITORY/actions/permissions/workflow")
  jq -e '
    .default_workflow_permissions == "read" and
    .can_approve_pull_request_reviews == false
  ' <<< "$workflow_json" >/dev/null || fail "default workflow permissions drifted"
  echo "ok - read-only default workflow token"

  fork_json=$(api "repos/$REPOSITORY/actions/permissions/fork-pr-workflows-private-repos")
  jq -e '
    .run_workflows_from_fork_pull_requests == true and
    .send_write_tokens_to_workflows == false and
    .send_secrets_and_variables == false and
    .require_approval_for_fork_pr_workflows == true
  ' <<< "$fork_json" >/dev/null || fail "private fork workflow policy drifted"
  echo "ok - approved read-only private fork workflows"

  ruleset_id=$(find_ruleset_id) || fail "Protect main ruleset is missing"
  ruleset_json=$(api "repos/$REPOSITORY/rulesets/$ruleset_id?includes_parents=false")
  jq -e '
    def rule($type): [.rules[] | select(.type == $type)][0];
    .name == "Protect main" and
    .target == "branch" and
    .enforcement == "active" and
    (.conditions.ref_name.include == ["refs/heads/main"]) and
    (.conditions.ref_name.exclude == []) and
    (.bypass_actors | length == 1) and
    (.bypass_actors[0].actor_id == 5258417) and
    (.bypass_actors[0].actor_type == "User") and
    (.bypass_actors[0].bypass_mode == "pull_request") and
    ([.rules[].type] | sort) == [
      "deletion",
      "non_fast_forward",
      "pull_request",
      "required_linear_history",
      "required_status_checks"
    ] and
    (rule("pull_request").parameters |
      .allowed_merge_methods == ["squash"] and
      .dismiss_stale_reviews_on_push == false and
      .require_code_owner_review == false and
      .require_last_push_approval == false and
      .required_approving_review_count == 0 and
      .required_review_thread_resolution == true
    ) and
    (rule("required_status_checks").parameters |
      ((.do_not_enforce_on_create // false) == false) and
      .strict_required_status_checks_policy == true and
      ([.required_status_checks[].context] | sort) == [
        "CI / Omarchy manifest",
        "CI / Portable quality",
        "Compatibility / Pinned baseline",
        "Security / Workflow policy"
      ]
    )
  ' <<< "$ruleset_json" >/dev/null || fail "Protect main ruleset drifted"
  echo "ok - protected main ruleset"
}

case ${1:-verify} in
  apply)
    [[ -f $RULESET_PATH ]] || fail "missing tracked ruleset payload"
    apply_settings
    verify_settings
    ;;
  verify)
    verify_settings
    ;;
  *)
    fail "usage: $0 [apply|verify]"
    ;;
esac
