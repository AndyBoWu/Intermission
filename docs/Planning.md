# Intermission Planning Document

Status: Planning<br>
Target: Omarchy Quattro<br>
Repository visibility: Private

## 1. Product decision

Intermission is an idle-aware break coach, not a Pomodoro timer and not a
screen-time dashboard.

Its job is to notice sustained active work, choose a humane moment to
interrupt, and make the break tangible. The smallest useful experience has
three surfaces:

1. a quiet bar chip that shows the current rhythm;
2. a warning that lets the user start now, briefly defer, or skip; and
3. a calm full-screen break surface across every connected display.

The product should feel firm enough to change behavior without ever trapping
the user. Every enforced surface must have a documented, keyboard-accessible
emergency exit.

### One-line promise

Work with focus. Stop before your body has to ask.

### Primary user

A developer, designer, writer, or other desk worker using Omarchy for long,
absorbing sessions who:

- loses track of time while working;
- ignores ordinary notifications;
- wants eye, movement, and posture breaks without adopting a task system;
- needs reminders to respect genuine idle time and unavoidable busy moments;
- prefers a local, private tool that feels native to the desktop.

## 2. Product principles

### Count effort, not elapsed time

Only active computer use should move the work timer forward. A walk, lunch, or
other sufficiently long idle period is already a break and should reset or
advance the rhythm according to explicit rules.

### Interrupt in layers

Start with a warning, then use a full-screen surface when the break begins.
Brief deferral is allowed, but it creates a visible obligation instead of
silently deleting the break.

### Firm, never unsafe

The overlay may capture ordinary keyboard and pointer input, but Intermission
will not claim to be an unbreakable OS lock. Escape, disable, display changes,
and shell restarts must all fail safe.

### Local by default

No account, telemetry, camera, microphone, cloud sync, remote API, downloaded
binary, elevated privilege, or second Quickshell process is required.

### Small surface, strong moment

Most of the day Intermission should occupy only one restrained bar chip. The
visual experience becomes prominent only for a warning or an active break.

### Original visual identity

The full-screen surface should use Omarchy theme tokens, generous whitespace,
large readable type, and restrained motion. It must not recreate another
product's copy, illustrations, layout, sounds, or brand assets.

## 3. Research synthesis

The strongest recurring needs in this product category are not more timer
controls. They are better judgment, stronger follow-through, and fewer false
interruptions.

### Behaviors worth building

| Need | Intermission response | Delivery |
| --- | --- | --- |
| Eye strain during long sessions | Short distance-looking break | M2 |
| Body fatigue | Longer stand, stretch, or hydrate break | M2 |
| Notifications are easy to ignore | Multi-monitor full-screen break surface | M2 |
| Meetings and focused work make timing awkward | Warning, deferral, and later context-aware timing | M2 / M3 |
| Natural breaks should count | Idle-aware active-use timer and reset rules | M1 |
| People need autonomy | Pause, resume, snooze, skip, and emergency exit | M1 / M2 |
| Motivation without guilt | Local adherence summary with forgiving continuity | M3 |
| Different routines fit different days | Configurable cadence and custom break rotation | M2 / M3 |
| Work should have boundaries | Optional workday reminder policy | M3 |
| Restart and monitor changes happen | Snapshot recovery and fail-safe overlay cleanup | M2 |

### Marketplace gap

The existing ecosystem already has many Pomodoro timers, fixed-interval
notifications, screen-time reports, breathing tools, and idle/power controls.
Intermission should not compete by adding another version of those.

Its differentiated space is the policy layer between activity and
interruption:

- count active work and recognize a real natural break;
- decide whether to warn, defer, or start the break;
- rotate a small set of useful break types;
- cover all screens when a stronger interruption is appropriate;
- keep deferred breaks accountable instead of forgetting them;
- remain nearly invisible between interventions.

### Explicit non-goals

- task, habit, or calendar management;
- website or application blocking;
- a standalone Pomodoro workflow;
- per-application surveillance or long-range screen-time dashboards;
- camera-based posture recognition;
- meditation, audio, or wellness content libraries;
- screensaver, lock, suspend, or hibernate configuration;
- OS-level lockout that cannot be safely dismissed;
- accounts, social features, or cloud data.

## 4. Experience specification

### Default rhythm

Defaults are opinionated but editable:

| Setting | Default | Rationale |
| --- | ---: | --- |
| Active work before a short break | 20 minutes | Frequent eye relief without a productivity method |
| Short break duration | 20 seconds | Enough time to look away and reset focus |
| Short cycles before a long break | 4 | Creates a longer movement break roughly every 80 minutes |
| Long break duration | 3 minutes | Enough time to stand, stretch, or get water |
| Advance warning | 30 seconds | Prevents a surprising screen takeover |
| Quick defer | 5 minutes | Short enough that the obligation remains meaningful |
| Natural break threshold | 2 minutes idle | Distinguishes a real step-away from a brief pause |
| Emergency exit | Hold Escape for 3 seconds | Deliberate but always available |

The defaults are hypotheses. They become final only after M2 live-session
testing.

### User flow

#### Normal cycle

1. Intermission starts or resumes active-use counting.
2. Idle time pauses active-use counting.
3. A qualifying natural break satisfies the pending break and starts a fresh
   work interval.
4. Thirty seconds before a scheduled break, a warning appears.
5. The user starts now, defers once, or skips.
6. At break start, every connected display shows the break surface.
7. The surface shows the remaining time and one concise action.
8. Completion returns to work and advances the short/long cadence.

#### Safe exit

The active break can always be ended through a visible keyboard-accessible
control and a deliberate Escape hold. Disabling the plugin or hiding its
overlay over shell IPC must also close every surface immediately.

#### Natural break

If the user leaves before a scheduled break, Intermission pauses counting. If
the idle duration meets the relevant threshold, that absence counts as a
completed break. Returning should never trigger an already-satisfied break.

### Core states

| State | Meaning | Allowed actions |
| --- | --- | --- |
| `stopped` | No rhythm is running | Start |
| `active` | Active-use time is accumulating | Pause, start a break |
| `idle` | User inactivity has paused accumulation | Resume automatically, stop |
| `warning` | A break is imminent | Start now, defer, skip |
| `deferred` | A pending break has a new deadline | Start now, pause |
| `break` | Full-screen break is active | Complete, emergency exit |
| `paused` | User intentionally paused the rhythm | Resume, stop |
| `outside` | Automatic timing is frozen outside allowed hours | Wait, stop for today, continue this cycle, take a break now |

State transitions and timestamps belong in a pure JavaScript model so they
can be tested without a compositor.

### Break surface

The M2 surface must:

- appear on every current display and adapt when a display connects or leaves;
- show the break type, one short instruction, and remaining time;
- use the active Omarchy theme where practical;
- support pointer, Tab, Enter, and Escape-hold interaction;
- avoid flashing, aggressive animation, or audio by default;
- prevent duplicate windows after repeated open, close, reload, or resume;
- close all surfaces within one second of any safe-exit path.

## 5. Functional scope

### Competition release scope (M0-M2)

- valid root-level Quattro plugin manifest;
- active-use rhythm state machine;
- idle-aware pausing and natural-break recognition;
- short and long break cadence;
- advance warning with start, defer, and skip;
- bar status and control panel;
- multi-monitor full-screen break surface;
- pause, resume, snooze, skip, complete, and emergency exit;
- local settings and crash/restart snapshot recovery;
- keyboard accessibility and reduced-motion behavior;
- install, removal, privacy, testing, and safety documentation;
- original screenshots or short preview capture.

### Post-release scope (M3)

- context-aware deferral for fullscreen media, presentation, or selected apps;
- tracked break debt when a break is deferred or skipped;
- custom break instructions and rotation policies;
- optional allowed reminder hours and end-of-day boundary;
- local daily/weekly adherence summaries and forgiving continuity;
- optional visual and sound customization that remains theme-compatible.

## 6. Technical plan

### Plugin shape

Intermission will be one root-level Omarchy Quattro plugin with a permanent
namespaced ID. The intended manifest declares:

- `service`: the single source of runtime truth;
- `bar-widget`: status, controls, and an embedded settings panel;
- `overlay`: the multi-monitor break experience;
- `allowMultiple: false` for the bar widget.

M0 must prove that all three entry points load and coordinate correctly before
the rest of the implementation depends on this shape.

### Proposed files

```text
manifest.json
Service.qml
BarWidget.qml
Panel.qml
Overlay.qml
Engine.js
History.js
StateStore.js
tests/
  engine.test.js
  shell-test.sh
```

This is a planning boundary, not a commitment to abstraction. Files should
only be split when the running implementation needs the separation.

### Ownership of state

- `Engine.js` owns deterministic transitions and cadence calculations.
- `Service.qml` owns clocks, idle signals, IPC, persistence, and presentation
  coordination.
- `BarWidget.qml` and `Panel.qml` render state and send commands.
- `Overlay.qml` renders active-break state and sends completion or safe-exit
  commands.

### Persistence

User settings use the Quattro inline plugin configuration. Runtime snapshots
live separately under the XDG state directory, for example:

```text
~/.local/state/intermission/session.json
~/.local/state/intermission/history.json
```

Seconds must not be written continuously. Store only meaningful transitions
and timestamps, then derive the current countdown. Corrupt, future, or expired
snapshots must fail closed to `stopped` without opening an overlay.

The versioned schemas, validation rules, recovery behavior, and ownership
boundaries are defined in [Runtime and IPC Contracts](Contracts.md).

### IPC contract

The first stable contract should cover:

```text
status
start
pause
resume
snooze
skip
startBreak
completeBreak
openOverlay
hideOverlay
showPanel
exportHistory
```

The panel is opened through the bar widget or `showPanel`; a generic plugin
summon may be reserved for the overlay lifecycle.

### Safety and privacy constraints

- no `sudo`, install hook, user systemd unit, bundled executable, or remote
  runtime dependency;
- no camera, microphone, active-window title history, or keystroke content;
- no telemetry or network calls;
- no secrets in settings, snapshots, logs, screenshots, or test fixtures;
- overlay-only enforcement with multiple independent exit routes;
- explicit cleanup when disabled, removed, reloaded, suspended, or when a
  monitor disappears.

## 7. Verification strategy

### Static and unit checks

- validate the root folder with `omarchy plugin validate .`;
- lint QML against the Omarchy shell imports;
- test the pure JavaScript engine with Node;
- validate JSON and Markdown formatting;
- scan the tracked tree for symlinks, unexpected binaries, secrets, and
  forbidden privileges.

### Live acceptance checks

The repeatable setup, scenario matrix, and evidence template live in the
[Acceptance Guide](Acceptance.md).

- install from a local checkout and confirm discovery/enabling;
- verify start, warning, defer, skip, short break, and long break;
- verify active-use time stops during idle and a natural break clears the due
  break;
- test bar click, keyboard navigation, IPC open/close, disable, re-enable, and
  shell restart;
- test one display, multiple displays, display disconnect during a break, and
  reconnect;
- test suspend/resume and stale snapshot recovery;
- confirm every safe-exit path closes all overlays within one second;
- capture release screenshots only after all visual checks pass.

## 8. Milestones and ticket plan

Implementation proceeds one ticket at a time in the order below unless a
dependency is explicitly changed in this document.

Tracking Epic: [#14 — Build Intermission](https://github.com/AndyBoWu/Intermission/issues/14)

### M0 · Foundation

Goal: prove the plugin contract and make every later change testable.

- [x] [#1 — Scaffold Intermission as a Quattro root plugin](https://github.com/AndyBoWu/Intermission/issues/1)
- [x] [#2 — Define config, runtime snapshot, and IPC contracts](https://github.com/AndyBoWu/Intermission/issues/2)
- [x] [#3 — Establish test and visual verification harness](https://github.com/AndyBoWu/Intermission/issues/3)

Exit criteria: the empty vertical slice is discoverable, validates, exposes
the planned lifecycle, and has repeatable unit/shell/live test entry points.

### M1 · Core rhythm

Goal: deliver a usable idle-aware rhythm through the bar without relying on
the full-screen experience.

- [x] [#4 — Implement the active-use rhythm engine](https://github.com/AndyBoWu/Intermission/issues/4)
- [x] [#5 — Integrate idle-aware natural break detection](https://github.com/AndyBoWu/Intermission/issues/5)
- [x] [#6 — Build the bar chip and control panel](https://github.com/AndyBoWu/Intermission/issues/6)

Exit criteria: a user can start, pause, resume, defer, skip, and observe a
deterministic short-break schedule; idle time is handled correctly.

### M2 · Competition release

Goal: add the behavior-changing break experience and reach a safe,
demonstrable release candidate.

- [x] [#7 — Build the multi-monitor break overlay](https://github.com/AndyBoWu/Intermission/issues/7)
- [x] [#8 — Add safe enforcement and lifecycle recovery](https://github.com/AndyBoWu/Intermission/issues/8)
- [x] [#9 — Add dual-cadence break routines](https://github.com/AndyBoWu/Intermission/issues/9)
- [ ] [#10 — Finalize accessibility, documentation, and release evidence](https://github.com/AndyBoWu/Intermission/issues/10)

Exit criteria: M0-M2 acceptance checks pass on a real Omarchy session, the
repository contains all files required for marketplace validation, and the
release is ready for an owner visibility decision.

### M3 · Smart refinement

Goal: improve timing and long-term usefulness without expanding into a task or
surveillance product.

- [x] [#11 — Add context-aware deferral and break debt](https://github.com/AndyBoWu/Intermission/issues/11)
- [x] [#12 — Add custom break rotation and workday policy](https://github.com/AndyBoWu/Intermission/issues/12)
- [x] [#13 — Add private local history and humane adherence insights](https://github.com/AndyBoWu/Intermission/issues/13)

Exit criteria: interruptions adapt to supported local context, postponed
breaks remain accountable, routines can be personalized, and insights remain
small, private, and non-punitive.

### Dependency chain

```text
M0 scaffold -> contracts + harness -> M1 engine -> idle integration
M0 contracts + M1 engine -> bar and panel
M1 engine -> M2 overlay -> safe lifecycle + recovery
M1 engine + M2 overlay -> dual cadence -> release evidence
M2 recovery -> M3 context, customization, and insights
```

## 9. Release gates

### M2 definition of done

- all M0-M2 issue acceptance criteria are checked with evidence;
- manifest validation, QML lint, unit tests, and shell tests pass;
- the complete live acceptance matrix has been exercised;
- no P0/P1 safety, input-capture, state-recovery, or multi-monitor defects are
  open;
- README includes install, use, configuration, removal, privacy, and recovery;
- license and original preview assets are present;
- repository history and tracked files contain no copied brand material;
- the marketplace submission checklist can be completed truthfully.

### Visibility gate

The repository remains private throughout the currently authorized work.
Marketplace distribution requires a public repository, so changing visibility
is a separate owner decision after the M2 release gate. No implementation
ticket may change repository visibility or submit the plugin without explicit
approval.

## 10. Key risks

| Risk | Mitigation |
| --- | --- |
| Overlay captures focus and traps the user | Safe-exit is its own M2 ticket; test multiple close routes first |
| Wall-clock and idle events race | Pure transition model with monotonic timestamps and boundary tests |
| Shell reload duplicates timers or windows | One service owner, idempotent open/close, snapshot recovery tests |
| Monitor changes leave an orphaned surface | Dynamic screen variants and disconnect acceptance tests |
| Persisting every tick creates churn | Persist only transitions and timestamps outside `shell.json` |
| Context detection becomes invasive | M3 allowlist, local ephemeral signals, no content capture |
| Product becomes another timer/dashboard | Preserve the non-goals and prioritize timing policy + break experience |
| Private repository blocks submission | Keep private now; surface an explicit owner visibility gate at M2 |

## 11. Working agreement

For each ticket:

1. confirm there is no open pull request or branch already implementing it;
2. restate the ticket acceptance criteria before changing code;
3. implement only that ticket and its necessary tests/docs;
4. run every locally available validation and a representative live flow;
5. attach evidence, update this plan if a decision changed, and only then mark
   the ticket complete;
6. start the next ticket only after the current one is merged or explicitly
   deferred.

This document is the product and delivery source of truth. GitHub milestones
and the Epic mirror its checklists; if they disagree, update both in the same
change.
