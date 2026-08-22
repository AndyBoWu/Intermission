# Release Evidence

Evidence date: 2026-08-21 (America/Los_Angeles)

This report separates checks executed in the current macOS workspace from
checks that still require an actual Omarchy/Wayland session. A pending row is
not represented as a pass.

## Executed locally

| Check | Result | Evidence |
| --- | --- | --- |
| Omarchy manifest validation | Pass | `npm run test:shell` invokes the validator from the sibling Omarchy checkout |
| JavaScript unit suite | Pass | `npm test` (61/61) |
| Static shell contract | Pass | `npm run test:shell` |
| JavaScript syntax | Pass | `node --check` for every runtime and unit JavaScript file |
| Shell syntax and lint | Pass | `bash -n` and `shellcheck` for every test script |
| JSON fixtures | Pass | every tracked JSON file parses with `jq` |
| Whitespace | Pass | `git diff --check` |
| Repository release audit | Pass | `npm run audit:release` |
| Repository visibility gate | Pass | GitHub reports `PRIVATE`; no visibility change was made |

The final command output is attached to issue #10 when the implementation PR
is published.

## Environment-limited validation

| Check | Status | Required environment |
| --- | --- | --- |
| QML lint | Pending | `qmllint` plus matching Quickshell imports; unavailable in this macOS workspace |
| Live loader lifecycle | Pending | running `omarchy-shell` with the plugin installed and enabled |
| Pointer and keyboard flow | Pending | real Omarchy panel and overlay surfaces |
| Idle and suspend/resume | Pending | compositor `IdleMonitor` and a real session |
| Single-display capture | Preview only | real compositor capture still required |
| Multi-display capture and hotplug | Preview only | two real outputs in an Omarchy/Wayland session |
| Theme contrast and reduced motion | Pending | representative light/dark themes in a real shell |

Run these commands from the real target session:

```sh
npm run lint:qml
npm run test:live
```

Then execute every row in the [Acceptance Guide](Acceptance.md), record the
display layout and theme, and replace the pending rows above with dated
results and real captures.

## Original visual previews

- `preview.png` — root marketplace preview for the single-display surface
- `previews/intermission-preview.svg` — editable source for the root preview
- `previews/multi-display-preview.png` — two-display behavior preview
- `previews/multi-display-preview.svg` — editable multi-display source

These are original visual previews built from Intermission's own layout and
copy. They are not compositor screenshots and are labelled as previews here so
they cannot be mistaken for live validation evidence.

## Repository audit scope

The release audit checks:

- root manifest, README, license, and preview presence;
- manifest validity and safe relative entry points;
- absence of symlinks and unexpected executable binaries;
- absence of common committed secret formats;
- absence of runtime network fetches, process execution, service management,
  and elevated operations;
- absence of prohibited reference material;
- preview type and size bounds.

The plugin has no additional runtime dependencies beyond the Omarchy Quattro
shell environment. Marketplace checks remain compatibility and limited static
analysis, not a security audit.

## Release decision

The repository remains private. The implementation may be reviewed and merged,
but M2 live validation and marketplace submission remain owner-gated until the
pending target-session evidence is completed.
