# Repository Governance

Intermission is governed as a solo-maintainer repository without weakening the
validation path. Repository-level Actions, token, fork, and merge settings are
active and verified. The tracked and applied `main` ruleset payload is
`.github/rulesets/main.json`.

Visibility and ruleset behavior are separate owner decisions. The current public
repository keeps this ruleset payload and policy as-is.

## Protected main

The active `Protect main` ruleset targets only `refs/heads/main` and requires:

- changes through a pull request;
- a branch tested against the latest `main`;
- resolved review conversations;
- `CI / Portable quality`;
- `CI / Omarchy manifest`;
- `Compatibility / Pinned baseline`;
- `Security / Workflow policy`;
- squash-only linear history; and
- protection from force pushes and branch deletion.

The planned approval count is zero while AndyBoWu is the sole maintainer.
GitHub does not count self-review as independent approval, so requiring one
would create a permanent merge deadlock. If another regular maintainer joins,
review this decision and enable one approval plus CODEOWNERS review.

## Actions and merge policy

Repository Actions settings keep Actions enabled but allow only GitHub-owned
actions and reusable workflows. Verified third-party creators and arbitrary
patterns are not allowed. Every `uses:` reference must be a full commit SHA.
The default `GITHUB_TOKEN` permission is read-only, and workflows cannot approve
pull requests.

Public fork pull-request workflows use GitHub's public-repository token model.
The workflows run on `pull_request`, keep permissions read-only, and receive no
repository secrets, so the required checks can run without granting forked code
privileged repository context.

The repository enables squash merge and the update-branch button. Merge commits,
rebase merge, and auto-merge are disabled. Merged topic branches are deleted
automatically. The active ruleset enforces the pull-request-only,
no-force-push, and no-deletion policy.

## Bypass and audit

The ruleset's only bypass actor is GitHub user `AndyBoWu` (`5258417`),
with `pull_request` mode. That mode preserves the pull request and its audit
trail; there is no always-on or direct-push bypass.

An emergency bypass must satisfy the recording and follow-up requirements in
[Contributing](../CONTRIBUTING.md). Release publication, repository visibility,
and marketplace submission remain separate owner approvals and cannot use this
bypass as implied consent.

## Apply and verify

The governance helper targets only `AndyBoWu/Intermission` and requires a GitHub
CLI identity with repository Administration permission. Apply the tracked
policy explicitly:

```sh
bash scripts/github-governance.sh apply
```

Read back and verify every available mutable setting without changing it:

```sh
npm run governance:verify
```

The helper also configures and verifies the required-reviewer rule on the
`release` environment. Any missing or drifted setting fails verification.

Run the readback after any workflow/check-name, collaborator, fork-policy,
merge-method, visibility, or plan change, and at least quarterly. Record
successful evidence on the governance issue or release evidence. Any
intentional change must update the tracked payload and this document in the
same pull request.
