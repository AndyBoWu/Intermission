# Automation Security

AndyBoWu owns the automation security policy and reviews changes matched by
`.github/CODEOWNERS`. The repository keeps automation deliberately small: pull
requests use read-only tokens, receive no repository secrets, and run only
from `pull_request` rather than privileged proxy events.

## Enforced gates

| Check | Purpose |
| --- | --- |
| `CI / Portable quality` | Unit/static checks and the independent release audit |
| `CI / Omarchy manifest` | Pinned upstream manifest validation |
| `Compatibility / Pinned baseline` | Frozen Arch, Quickshell, QML, and Omarchy compatibility |
| `Security / Workflow policy` | actionlint syntax validation and offline zizmor security analysis |
| `CodeQL / actions` | Extended CodeQL analysis of workflow files after public launch |
| `CodeQL / javascript-typescript` | Extended CodeQL analysis of JavaScript after public launch |

Every workflow has an explicit timeout and least-privilege token declaration.
Actions use reviewed full commit SHAs with readable version comments. Checkout
credentials are not persisted. The workflow-policy analyzers run from
immutable container digests, read the checkout through a read-only mount, and
run offline without a GitHub token.

The release audit remains inside the portable CI job instead of being folded
into a security scanner. A scanner outage or suppression therefore cannot
bypass release-content, secret-pattern, binary, symlink, or runtime-operation
checks.

## Updates and suppressions

Dependabot checks the `github-actions` ecosystem each Monday, groups compatible
updates into one pull request, and limits the open update backlog to three.
New releases cool down for seven days before becoming eligible for an update.
Before merging an update, review the upstream release notes and commit diff,
retain the immutable SHA and version comment, and require the normal checks.

Do not suppress a finding only to make a check green. A justified suppression
must be the narrowest rule or line-level exception supported by the tool and
must be reviewed through a pull request owned by AndyBoWu. Its adjacent comment
or pull-request description must record:

- the analyzer and rule ID;
- the exact affected path or line;
- why the finding is a false positive or an explicitly accepted risk;
- any compensating control; and
- an owner and review or expiry date.

Repository-wide disables and severity downgrades are not acceptable. Remove a
suppression as soon as the underlying condition or analyzer behavior changes.

Dependency review is intentionally absent while the runtime has no dependency
manifest. Introduce that gate with the first real runtime dependency rather
than maintaining a permanently empty check.

## Repository settings and public-launch runbook

Some controls cannot be expressed in tracked files. The repository owner must
keep the default workflow token permission read-only, require approval before
fork pull-request workflows run, require the checks above in the main-branch
ruleset, and enable the setting that requires actions to be pinned to a
full-length commit SHA. Require a CODEOWNERS review for automation changes when
more than one maintainer can approve pull requests.

The exact protected-main, Actions allowlist, token, merge, and bypass settings
are defined and reviewed in [Repository Governance](Governance.md). Run
`npm run governance:verify` with an authenticated GitHub CLI to detect drift.

The repository is private on an account where CodeQL code scanning is not
currently available. The committed CodeQL job therefore checks repository
visibility and remains skipped while private. It automatically analyzes both
`actions` and `javascript-typescript` with `security-extended` on pull requests,
main, a weekly schedule, and manual runs after the repository is public.

At public launch, as a separate owner decision:

1. Make the intended visibility change and confirm the CodeQL jobs complete.
2. In **Settings → Advanced Security**, enable secret scanning and push
   protection, then verify both controls report enabled.
3. Run `CodeQL` and `Security` manually and review the repository Security tab.
4. Add both CodeQL matrix checks to the main-branch ruleset after their first
   successful run.

Do not change repository visibility merely to exercise these controls. Record
the settings evidence in the launch pull request or release evidence when the
owner deliberately approves public launch.
