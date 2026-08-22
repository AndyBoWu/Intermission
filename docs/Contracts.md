# Runtime and IPC Contracts

Status: Accepted for M0<br>
Contract version: 1<br>
Plugin ID: `io.github.andybowu.intermission`

This document fixes the boundaries that later tickets implement. Changes to a
versioned field, transition, or command require a compatible migration or an
explicit contract-version change.

## 1. Design rules

- Quattro owns plugin enablement and the inline settings entry.
- Intermission owns only its configuration fields and XDG state files.
- Runtime countdowns are derived from timestamps; they are not written every
  second.
- `Service.qml` is the single runtime owner. Per-monitor widgets and overlays
  never own canonical state.
- Missing or invalid persisted state must never open an overlay.
- IPC arguments and results are JSON strings with bounded, documented fields.
- No schema contains application titles, keystrokes, media content, or user
  text captured from another application.

## 2. Settings contract

Settings live inline beside the plugin `id` in the Quattro bar layout entry.
The plugin ID's presence controls enablement; there is no separate `enabled`
setting.

Example: [`contracts/settings.v1.json`](contracts/settings.v1.json)

| Field | Type | Default | Accepted values |
| --- | --- | ---: | --- |
| `configVersion` | integer | `1` | exactly `1` |
| `autoStart` | boolean | `true` | `true` or `false` |
| `presetId` | string | `balanced` | `balanced`, `frequent`, `spacious`, or `custom` |
| `workIntervalSeconds` | integer | `1200` | Legacy fallback for both work intervals |
| `shortWorkIntervalSeconds` | integer | `1200` | `60`–`14400` |
| `longWorkIntervalSeconds` | integer | `1200` | `60`–`14400` |
| `shortBreakSeconds` | integer | `20` | `10`–`900` |
| `longBreakSeconds` | integer | `180` | `30`–`3600` |
| `cyclesBeforeLong` | integer | `4` | `1`–`12` |
| `warningSeconds` | integer | `30` | `0`–`300` |
| `snoozeSeconds` | integer | `300` | `60`–`1800` |
| `naturalBreakSeconds` | integer | `120` | `30`–`3600` |
| `escapeHoldSeconds` | integer | `3` | `1`–`10` |
| `reducedMotion` | boolean | `false` | `true` or `false` |

### Validation

- Values are type-checked; numeric strings are not coerced.
- A missing or invalid field uses its default independently of other fields.
- A legacy `workIntervalSeconds` value supplies both work intervals when the
  newer fields are absent. Saves retain it as a short-interval compatibility
  value while also writing both explicit fields.
- Named presets update both work intervals, both break durations, and the
  short-cycle count together. Editing any of those fields records `custom`.
- Unknown fields are ignored at runtime and preserved when settings are
  written, so a newer configuration is not silently destroyed.
- Changing cadence settings applies to the next work or break phase. The
  current phase keeps the target captured in its runtime snapshot.
- Invalid values are not written back automatically. A user-initiated settings
  save writes one normalized version 1 entry.

### Migration

- A missing `configVersion` is interpreted as version 1 for the initial
  release.
- Version 1 is normalized field by field using the rules above.
- An unsupported future version runs with safe defaults and does not rewrite
  the user's entry.
- A future contract may add fields without changing the version when version 1
  readers can safely ignore them. Renaming, removing, or changing the meaning
  of a field requires a new version and an explicit migration.

## 3. Runtime snapshot contract

The runtime snapshot lives at:

```text
${XDG_STATE_HOME:-~/.local/state}/intermission/session.json
```

Example: [`contracts/session.v1.json`](contracts/session.v1.json)

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Snapshot schema, currently `1` |
| `revision` | non-negative integer | Increases on every persisted transition |
| `savedAtEpochMs` | integer | Wall-clock time of the atomic save |
| `phase` | string | `stopped`, `active`, `idle`, `warning`, `deferred`, `break`, or `paused` |
| `phaseEnteredAtEpochMs` | integer | Time the current phase began |
| `activeElapsedMs` | non-negative integer | Active time already counted in this work interval |
| `activeStartedAtEpochMs` | integer or null | Start of the current active segment |
| `workTargetMs` | positive integer | Captured work target for the current interval |
| `breakKind` | string or null | `short`, `long`, or null when no break is pending |
| `cycleIndex` | non-negative integer | Completed short cycles before the next long break |
| `warningStartedAtEpochMs` | integer or null | Warning start time |
| `deferredUntilEpochMs` | integer or null | Current deferral deadline |
| `breakStartedAtEpochMs` | integer or null | Active break start time |
| `breakDurationMs` | non-negative integer | Captured duration of the pending or active break |
| `resumePhase` | string or null | Phase restored by `resume` from `paused` |

Only meaningful transitions persist a snapshot:

- start, stop, pause, and resume;
- idle entry and return to activity;
- warning entry, defer, and skip;
- break start, completion, and emergency exit;
- a settings change that alters the next target;
- an orderly service shutdown.

Writes are atomic: create a user-only temporary file in the same state
directory, flush it, then rename it over `session.json`. Implementations must
not follow a symlink at the state-file path.

### Recovery

Recovery always excludes shell downtime from active-use time.
Phase-specific recovery is evaluated before natural-break recovery. Only an
`active` or `idle` snapshot can turn downtime into a natural break; `paused`,
`warning`, `deferred`, and `break` always follow their dedicated rows below.

| Input | Safe behavior |
| --- | --- |
| Missing file | Start from `stopped`, or `active` when valid settings request auto-start |
| Invalid JSON or invalid field | Ignore the snapshot and start `stopped`; never open an overlay |
| Unsupported future schema | Leave the file untouched and start `stopped` |
| `savedAtEpochMs` more than 5 minutes in the future | Treat as a clock reversal and start `stopped` |
| Snapshot older than 12 hours | Treat as stale and start `stopped` |
| Active or idle snapshot whose downtime meets `naturalBreakSeconds` | Count it as a natural break and begin a fresh work interval |
| Active or idle snapshot after shorter downtime | Restore counted active time; do not count downtime |
| Overdue warning or deferral | Restore to `warning`; never jump directly into an overlay |
| Active break with time remaining | Restore the break and its overlay |
| Active break whose end passed | Complete it without reopening the overlay and begin a fresh work interval |
| Paused snapshot | Remain paused until an explicit resume |

An `idle` snapshot with `activeElapsedMs` equal to zero represents a natural
break that was already satisfied while the user remained away. Recovery keeps
that state idle without advancing the cadence again; activity must return
before another natural break can be earned.

## 4. History contract

History is reserved now so M3 can add insights without changing the runtime
model. Its file lives at:

```text
${XDG_STATE_HOME:-~/.local/state}/intermission/history.json
```

Example: [`contracts/history.v1.json`](contracts/history.v1.json)

The file contains `schemaVersion` and an append-only `events` array. Each event
has:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Locally unique opaque event ID |
| `atEpochMs` | integer | Event time |
| `type` | string | `completed`, `natural`, `deferred`, `skipped`, or `emergency-exit` |
| `breakKind` | string | `short` or `long` |
| `scheduledDurationMs` | non-negative integer | Planned duration |
| `actualDurationMs` | non-negative integer | Observed duration |
| `source` | string | `overlay`, `idle`, `panel`, or `ipc` |
| `reason` | string or null | A fixed enum value, never arbitrary captured text |

History is not required to restore a session. If it is missing or invalid, the
timer continues and insights remain unavailable until the file is reset or
repaired. Runtime recovery must never overwrite corrupt history.

## 5. IPC contract

The single `IpcHandler` lives in `Service.qml` and uses the permanent plugin ID
as its target. Bar widgets are instantiated per display and must not register
duplicate handlers.

Every method receives one JSON string argument, using `{}` when it has no
options, and returns one compact JSON string.

Successful response:

```json
{
  "ok": true,
  "command": "pause",
  "state": {
    "phase": "paused",
    "breakKind": null,
    "cycleIndex": 0,
    "remainingSeconds": 900,
    "overlayOpen": false
  },
  "error": null
}
```

Failed response:

```json
{
  "ok": false,
  "command": "completeBreak",
  "state": {
    "phase": "active",
    "breakKind": null,
    "cycleIndex": 0,
    "remainingSeconds": 900,
    "overlayOpen": false
  },
  "error": {
    "code": "INVALID_STATE",
    "message": "No break is active"
  }
}
```

Error codes are stable enums: `INVALID_ARGUMENT`, `INVALID_STATE`,
`PERSISTENCE_ERROR`, `UI_UNAVAILABLE`, and `INTERNAL_ERROR`.

### Commands

| Command | Argument | Behavior |
| --- | --- | --- |
| `status` | `{}` | Return the public state without mutation |
| `start` | `{}` | Start a fresh interval or no-op successfully when already active |
| `pause` | `{}` | Freeze the current resumable phase; repeated pause is a successful no-op |
| `resume` | `{}` | Restore `resumePhase`; fail outside `paused` |
| `snooze` | `{"seconds": 300}` | Defer a warning; default to the configured duration |
| `skip` | `{"reason": "user"}` | Skip a warning or deferred break and advance by policy |
| `startBreak` | `{"kind": "short"}` | Start the due break or an explicit short/long break |
| `completeBreak` | `{"source": "overlay"}` | Complete an active break; fail in other phases |
| `openOverlay` | `{}` | Idempotently summon the overlay for the active break |
| `hideOverlay` | `{"reason": "ipc"}` | Idempotently close all overlay surfaces without losing runtime state |
| `showPanel` | `{}` | Ask the live bar to open the Intermission control panel |

`snooze.seconds` must be an integer from 60 to 1800. `kind`, `reason`, and
`source` accept only their documented enum values. Unknown arguments fail with
`INVALID_ARGUMENT`; they are not silently ignored.

Overlay commands are intentionally separate from break-state commands. Hiding
the overlay does not complete or skip a break. `openOverlay` delegates to the
shell overlay loader. `showPanel` delegates directly to the live bar widget,
because a generic shell summon resolves this multi-kind plugin to its overlay.

Every overlay dismissal path, including pointer close, Escape, emergency exit,
and IPC, sends an intent to the service. The service calls
`shell.hide(pluginId)` so Quattro clears its loader-owned open state; an
overlay view must not only set its local `opened` property to false.

`showPanel` follows the bar host's monitor selection: keep the already-open
copy when one exists, otherwise open the eligible widget on the focused
monitor. It returns `UI_UNAVAILABLE` when no live widget exposes the required
panel lifecycle.

## 6. State ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| Quattro shell | Plugin enablement, inline settings entry, component lifecycle | Timer transitions or history |
| `Engine.js` | Pure transitions, cadence calculations, public-state projection | File I/O, QML objects, or clocks |
| `Service.qml` | Current runtime state, timers, idle signals, IPC, atomic file I/O, orchestration | Per-display visual state |
| `StateStore.js` | Pure validation, normalization, serialization, and recovery decisions | File I/O, QML objects, or product transitions |
| `BarWidget.qml` | Read-only status projection and user intents | Canonical timer state or IPC handler |
| `Panel.qml` | Editable form state until save | Runtime countdown or persistence policy |
| `Overlay.qml` | Per-display rendering and focus state | Completion policy or canonical break state |

All mutations flow through `Service.qml` into `Engine.js`. The service persists
data encoded and validated by `StateStore.js`. Views send intents and render
the resulting public state.
