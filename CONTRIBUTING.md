# Contributing

Intermission uses a protected, pull-request-only `main` branch. Work on a topic
branch and keep each pull request focused enough to review and revert safely.

## Before opening a pull request

Run the portable checks:

```sh
npm run check:portable
npm run lint:workflows
```

Run `npm run test:compatibility` when Omarchy, QML, the manifest, or the
compatibility harness changes. The complete live-session matrix remains in the
[Acceptance Guide](docs/Acceptance.md).

## Merge path

Every change to `main`, including a maintainer change, must use a pull request.
The branch must be current with `main`, every review conversation must be
resolved, and these stable checks must pass:

- `CI / Portable quality`
- `CI / Omarchy manifest`
- `Compatibility / Pinned baseline`
- `Security / Workflow policy`

For a private-repository fork, a maintainer must approve the workflow run.
Approved fork runs receive a read-only token and no repository secrets or
variables, so the same stable checks can complete without elevating the fork.

No approval count is required while the repository has one maintainer; a
self-approval would not provide independent review and would make the project
impossible to maintain. CODEOWNERS still identifies security-sensitive files
and becomes an enforceable reviewer boundary if another maintainer is added.

Use squash merge. Merge commits and rebase merges are disabled so `main` stays
linear and every merged commit points back to its pull request. Force pushes
and branch deletion are blocked.

## Emergency bypass

Only AndyBoWu has bypass access, and only through a pull request. There is no
direct-push bypass. Use it solely when a required check is unavailable or a
time-critical safety/security correction cannot wait for the normal gate.

Before bypassing, record the failed or unavailable control and the reason in
the pull request. Afterward, rerun every skipped check, link the results, and
open a follow-up issue for any unresolved failure. Never use bypass to avoid a
failing test, an unresolved conversation, or release/marketplace approval.

See [Repository Governance](docs/Governance.md) for the exact settings and
quarterly drift-review procedure.
