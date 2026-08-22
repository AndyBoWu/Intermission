# Acceptance Guide

This guide separates checks that work in any development checkout from checks
that require a real Omarchy and Wayland session.

## 1. Checkout checks

Requirements: Node.js, npm, Bash, jq, and an Omarchy source checkout exposed
through `OMARCHY_PATH`. In the shared development workspace, the shell check
also discovers a sibling `omarchy-core` checkout.

```sh
npm test
npm run test:shell
```

The unit command runs dependency-free JavaScript tests. The shell command
validates the root manifest, required files, entry points, single-instance bar
metadata, required lifecycle declarations, symlink policy, and prohibited
runtime dependencies. Behavioral lifecycle coverage belongs to the live test.

## 2. QML lint

Run this in an Omarchy development environment that includes `qmllint`:

```sh
OMARCHY_PATH=/path/to/omarchy npm run lint:qml
```

The command checks every root QML entry point against the real Omarchy shell
imports. A missing `qmllint` or shell checkout is a failure with an actionable
message, not a silent skip.

## 3. Live setup

Use a disposable user session or back up the current shell configuration.
Install and enable the current checkout through the ordinary plugin workflow,
then verify it appears in the shell:

```sh
omarchy plugin add git@github.com:AndyBoWu/Intermission.git --enable --yes
omarchy-shell shell listPlugins
npm run test:live
```

`test:live` is intentionally non-installing. It requires the plugin to be
present and enabled, starts an accelerated break through the service, verifies
the automatic overlay, exercises idempotent hide and reopen IPC, completes the
break, and always attempts cleanup if the command fails. Close checks use a
one-second bound. It verifies shell lifecycle and IPC routing, not visible
pixels or compositor focus behavior.

Runtime recovery uses
`${XDG_STATE_HOME:-~/.local/state}/intermission/session.json`. For recovery
checks, preserve a disposable copy of that file, restart the shell in each
phase listed below, verify the expected state, then restore or remove the copy.
Never run destructive snapshot tests against a session you need to keep.

## 4. Scenario matrix

Record the commit SHA, Omarchy version, monitor layout, and result for each
scenario. Tickets add automation where practical; compositor-only behavior
remains a live acceptance check.

| Scenario | Procedure | Expected result | Owner ticket |
| --- | --- | --- | --- |
| Discovery | Rescan, list, enable, disable, and re-enable | One namespaced plugin; no duplicate widget or shell error | #1 / #3 |
| Bar lifecycle | Click, summon panel when available, press Escape, use shell hide | One responsive widget per bar; close paths agree | #6 |
| Idle boundary | Cross just below and just above the configured idle threshold | Active time pauses; only qualifying idle becomes a natural break | #5 |
| Warning | Accelerate the work target and enter warning | Start, defer, and skip are keyboard and pointer accessible | #4 / #6 |
| Focused fullscreen | Keep a supported fullscreen window focused until the break is due, then exit fullscreen | The break waits once, owed rest is visible, and a warning of at most 10 seconds begins after exit | #11 |
| Stay-awake mode | Enable Omarchy stay-awake mode across a due boundary, then disable it | The pending break is retained and resumes at the next eligible observation | #11 |
| Selected app | Add the current app ID, cross a due boundary in that app, then focus another app | Matching is exact; the due break waits only while the selected app is current | #11 |
| Manual hold | Start and end a 30-minute hold from the panel | Remaining hold time is visible; ending it releases a pending break without clearing debt | #11 |
| Owed-rest cap | Repeatedly defer or skip beyond the longest configured break | One value remains capped; repeated observations of the same pending break never add twice | #11 |
| Context privacy | Inspect config, snapshot, logs, and IPC status after all context scenarios | No window title, content, observed app history, or media/call data is stored | #11 |
| Custom rotation | Reorder built-ins, exclude one, add a custom item, and complete enough accelerated cycles to wrap | Overlay follows the exact safe order and wraps without missing or duplicate items | #12 |
| Invalid or empty rotation | Save unknown, duplicate, incomplete, and then empty rotation input | Invalid entries are removed and an empty result falls back to the four built-ins | #12 |
| Daily boundary | Cross an enabled window end during active work, then its next start | Progress freezes and resumes without new owed rest or a stale overlay | #12 |
| Overnight window | Configure `22:00-06:00` and observe both sides of midnight | The originating day's window remains allowed until 06:00 | #12 |
| End-of-day choice | Enable the prompt and exercise wait, stop, and continue on separate local dates | Prompt is non-blocking and once per date; each reversible choice follows its documented scope | #12 |
| Timezone change | Change the session timezone across an allowed boundary and restore it | Policy re-evaluates local time without retaining the old zone or advancing frozen time | #12 |
| Outside-hours restart | Close during an outside-hours phase and restore after more than 12 hours | The frozen phase and progress survive without accruing active time or owed rest | #12 |
| History opt-in | Enable local history, complete, naturally satisfy, defer, skip, exit, stop, and stop for today across separate accelerated cycles | Only the six documented fixed event types and exact retained fields appear | #13 |
| Insight boundaries | Exercise empty, today, skipped-day, 7-day, and 14-day samples around a local date boundary | Active minutes, neutral outcomes, adherence, and forgiving continuity match the contract | #13 |
| History retention | Load more than 30 local days and more than 2,000 valid events | Only the newest allowed days and events remain; timer operation is unchanged | #13 |
| History privacy | Inspect settings, session, history, panel export, and IPC export | No app, window, process, content, or raw activity timeline is retained | #13 |
| History reset and opt-out | Reset once, then disable and save after recording new events | Event data is removed without resetting cadence; the panel reports history off and IPC exports an empty versioned document | #13 |
| History corruption | Start with malformed, oversized, or unsupported history, then reset explicitly | Timer continues; corrupt data is not automatically replaced; explicit reset resumes safe recording | #13 |
| Short break | Start a short break with accelerated settings | Rotating instruction and countdown are correct; completion advances cadence | #7 / #9 |
| Dual cadence | Apply a named preset, accelerate a short-to-long sequence, then reload | Each work target and break duration matches its type; the preset persists | #9 |
| Long break | Complete the configured short-cycle count | Long routine and duration replace the short routine | #9 |
| Emergency exit | Hold Escape for the configured duration | Every overlay closes within one second and state remains recoverable | #8 |
| Shell restart | Restart during active, warning, deferred, break, and paused phases | Recovery follows the version 1 contract with no surprise overlay | #8 |
| Suspend and resume | Suspend in active and break phases | Downtime is never counted as active; stale UI is removed | #5 / #8 |
| Display connect | Add a display before and during a break | Exactly one synchronized surface appears on each display | #7 / #8 |
| Display disconnect | Remove a display during a break | Removed surface disappears; remaining surfaces keep working | #7 / #8 |
| Theme and scale | Change theme and test common scale factors | Content stays readable and unclipped | #7 / #10 |
| Plugin disable | Disable while the panel or overlay is open | All UI and exclusive focus disappear immediately | #8 / #10 |

## 5. Visual evidence

Capture evidence only after the scenario passes.

1. Use a clean desktop with no private notifications, filenames, or terminal
   output visible.
2. Capture the bar's normal, warning, and paused states at native scale.
3. Capture short and long break surfaces on one display.
4. Capture one multi-display break showing synchronized content.
5. Repeat the break capture with reduced motion and a second Omarchy theme.
6. Save stills with `omarchy capture screenshot fullscreen save`, or start and
   stop the standard recorder with `Alt + Print Screen`.
7. Review every asset for clipping, unreadable contrast, private data, and
   copied brand material before adding it to the repository.

Use this evidence record in the implementing issue or PR:

```text
Commit:
Omarchy version:
Monitor layout and scale:
Scenario:
Expected:
Observed:
Evidence file:
Result: PASS / FAIL
```

## 6. Release check

The release candidate is not complete until these commands pass in an Omarchy
development environment and every applicable M0–M2 scenario has recorded
evidence:

```sh
npm run check
npm run test:live
```
