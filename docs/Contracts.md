# Runtime and IPC Contracts

Status: Implemented through M3<br>
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
| `contextDeferralEnabled` | boolean | `true` | `true` or `false` |
| `busyAppIds` | string | empty | Up to 20 comma-separated exact app IDs |
| `routineOrder` | string array | four built-in IDs | Ordered, de-duplicated built-in or valid custom IDs |
| `customBreakItems` | object array | empty | Up to 8 local `{id, label, instruction}` items |
| `workdayHoursEnabled` | boolean | `false` | `true` or `false` |
| `endOfDayPromptEnabled` | boolean | `false` | `true` or `false` |
| `historyEnabled` | boolean | `false` | `true` or `false` |
| `historyWindowDays` | integer | `7` | `7` or `14` |
| `workdayHoursByDay` | object | weekdays `09:00-17:00`; weekends `off` | One `HH:MM-HH:MM` or `off` value for each day |

### Validation

- Values are type-checked; numeric strings are not coerced.
- A missing or invalid field uses its default independently of other fields.
- A legacy `workIntervalSeconds` value supplies both work intervals when the
  newer fields are absent. Saves retain it as a short-interval compatibility
  value while also writing both explicit fields.
- Named presets update both work intervals, both break durations, and the
  short-cycle count together. Editing any of those fields records `custom`.
- Busy-app IDs are lower-cased, de-duplicated, and matched exactly. Entries
  containing anything other than letters, numbers, `.`, `_`, or `-` are
  rejected. Window titles are never an input.
- Built-in routine IDs are `eyes`, `stand`, `stretch`, and `hydrate`. Custom
  IDs use `custom-` followed by lower-case letters, numbers, or hyphens. A
  custom label is 1–32 characters and its plain-text instruction is 1–80
  characters after whitespace normalization; control characters, incomplete
  items, unknown IDs, and duplicates are discarded. At most eight custom
  items are retained. An empty resulting rotation uses all four built-ins.
- Reminder windows use local wall-clock time and are re-evaluated after clock
  or timezone changes. Start is inclusive and end is exclusive. A start later
  than the end crosses midnight; `00:00-24:00` covers the full day. Invalid
  daily values safely disable that day; missing values use that day's default.
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
| `phase` | string | `stopped`, `active`, `idle`, `warning`, `deferred`, `break`, `paused`, or `outside` |
| `phaseEnteredAtEpochMs` | integer | Time the current phase began |
| `activeElapsedMs` | non-negative integer | Active time already counted in this work interval |
| `historyBaselineActiveWorkMs` | non-negative integer | Current-interval work accumulated before an opt-in; excluded from future history and zero otherwise |
| `activeStartedAtEpochMs` | integer or null | Start of the current active segment |
| `workTargetMs` | positive integer | Captured work target for the current interval |
| `breakKind` | string or null | `short`, `long`, or null when no break is pending |
| `cycleIndex` | non-negative integer | Completed short cycles before the next long break |
| `warningStartedAtEpochMs` | integer or null | Warning start time |
| `deferredUntilEpochMs` | integer or null | Current deferral deadline |
| `breakStartedAtEpochMs` | integer or null | Active break start time |
| `breakDurationMs` | non-negative integer | Captured duration of the pending or active break |
| `resumePhase` | string or null | Phase restored from `paused` or `outside` |
| `breakDebtMs` | non-negative integer | One bounded total of postponed or skipped rest |
| `pendingDebtRecorded` | boolean | Prevents counting the current pending break twice |
| `contextDeferred` | boolean | A due break is waiting for the current busy context to end |
| `manualHoldUntilEpochMs` | integer or null | Expiration of an explicit, bounded reminder hold |
| `workdayOverrideActive` | boolean | Current cycle may continue beyond configured hours |
| `endOfDayPromptPending` | boolean | The non-blocking boundary choice is visible |
| `lastEndOfDayPromptDateKey` | string or null | Local `YYYY-MM-DD` key used to de-duplicate a prompt |
| `resetAtNextWorkday` | boolean | Frozen progress resets when the next allowed window opens |

Only meaningful transitions persist a snapshot:

- start, stop, pause, and resume;
- idle entry and return to activity;
- warning entry, defer, and skip;
- break start, completion, and emergency exit;
- context deferral or release, owed-rest changes, and manual hold changes;
- workday close, open, boundary choice, or temporary override;
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
| Snapshot older than 12 hours | Treat as stale and start `stopped`, except a valid `outside` snapshot remains frozen |
| Active or idle snapshot whose downtime meets `naturalBreakSeconds` | Count it as a natural break and begin a fresh work interval |
| Active or idle snapshot after shorter downtime | Restore counted active time; do not count downtime |
| Overdue warning or deferral | Restore to `warning`; never jump directly into an overlay |
| Active break with time remaining | Restore the break and its overlay |
| Active break whose end passed | Complete it without reopening the overlay and begin a fresh work interval |
| Paused snapshot | Remain paused until an explicit resume |
| Outside-hours snapshot | Remain frozen without accruing active time or owed rest until an allowed window or explicit override |

An `idle` snapshot with `activeElapsedMs` equal to zero represents a natural
break that was already satisfied while the user remained away. Recovery keeps
that state idle without advancing the cadence again; activity must return
before another natural break can be earned.

### Busy context and owed rest

The service derives one ephemeral busy decision from a bounded manual hold,
Omarchy stay-awake mode, focused fullscreen state, or an exact current app-id
match. Only the decision and fixed reason enum reach the engine. The current
app ID is never written to the runtime snapshot, and no window title, media
content, meeting content, or observation history is collected.

When a break becomes due in a busy context, it remains pending and
`contextDeferred` becomes true. Repeated observations do not add more owed
rest. The first eligible observation starts a recovery warning of at most ten
seconds before the break. The visible **Start now** action always bypasses the
wait.

Manual defer, automatic context defer, skip, and emergency exit add the
current scheduled duration to the one `breakDebtMs` value unless that pending
break was already counted. The value is capped at the larger configured break
duration. Completed and natural rest subtract observed rest time until the
value reaches zero. There is no debt event queue or application history.

### Break rotation and workday policy

The overlay derives its one instruction from `routineOrder`, the current cycle
index, and the normalized custom items. This changes presentation only; it
does not add task completion, content libraries, or network access.

When an enabled workday window closes, `active`, `idle`, `warning`, or
`deferred` moves to `outside` with its progress frozen. An active break is
allowed to finish before the close is applied. Activity outside the window
does not advance the work target and does not create owed rest. Reopening the
window restores active or idle progress; a pending warning receives at most a
ten-second recovery warning.

The optional end-of-day prompt is non-blocking and is shown at most once per
local date. **Wait for next window** keeps frozen progress, **Stop for today**
resets work progress when the next allowed window opens while preserving the
upcoming short/long cadence slot, and **Continue this cycle**
temporarily bypasses the window until the current break cycle completes. The
policy stores no timezone, calendar event, task, website, or application
history and never locks the session.

## 4. History contract

Private history is optional and off by default. When enabled, its separate
file lives at:

```text
${XDG_STATE_HOME:-~/.local/state}/intermission/history.json
```

Example: [`contracts/history.v1.json`](contracts/history.v1.json)

The file contains `schemaVersion` and a bounded `events` array. A settled
runtime transition is appended only after its session snapshot is accepted
for persistence. Event IDs derive from the runtime revision and effect index,
so retrying the same transition does not duplicate it. Each event has exactly:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Deterministic local `event-r{revision}-{index}-{event-time}-{type}` ID |
| `atEpochMs` | integer | Event time |
| `localDateKey` | string | Local `YYYY-MM-DD` aggregation key at event time |
| `type` | string | `completed`, `natural`, `deferred`, `skipped`, `emergency-exit`, or `work-reset` |
| `breakKind` | string | `short` or `long` |
| `scheduledDurationMs` | non-negative integer | Planned duration |
| `actualDurationMs` | non-negative integer | Observed duration |
| `activeWorkMs` | non-negative integer | Settled active use for the work interval; deferred events store zero |
| `workTargetMs` | non-negative integer | Captured target for that work interval |
| `source` | string | `timer`, `overlay`, `panel`, `ipc`, `idle`, `recovery`, `user`, `context`, or `service` |
| `reason` | string or null | A fixed enum value, never arbitrary captured text |

No event contains an app ID, window title, process, keystroke, content sample,
or raw activity timeline. The file keeps at most 30 local calendar days, 2,000
events, and 1 MiB of encoded JSON. Oldest entries are pruned first.

Enabling history during a running interval stores one bounded baseline in the
runtime snapshot. The first settled outcome subtracts it, so work accumulated
before consent is never copied into history, including after a shell restart.

The panel shows today plus a selected 7- or 14-day window. Active minutes are
the sum of settled active work plus the current unsettled interval. Adherence
is `(completed + natural) / (completed + natural + skipped)`; deferrals and
emergency exits are neutral. A day supports continuity when it has at least
one completed or natural break and those outcomes are not outnumbered by
skips. Empty days are neutral, so one isolated skip beside a supportive break
does not create a punitive broken streak.

Live unsettled work appears under the current local date; its eventual event
uses the local date on which the interval settles. The summary does not
reconstruct a raw minute-by-minute timeline across midnight.

History is never required to restore or advance the timer. Missing history
starts empty. Unreadable JSON, an invalid root shape, an oversized file, or an
unsupported schema remains untouched and recording stays unavailable until
the user explicitly resets it. Inside an otherwise supported document,
unknown fields are removed and invalid or duplicate events are dropped before
the bounded document is saved. Disabling history and
saving overwrites the file with an empty schema document, removing all event
data while leaving cadence state unchanged. The same reset is available from
the panel; it also moves the active-work baseline to the reset moment so the
unsettled interval does not repopulate cleared work. The panel exposes the
retained document as selectable JSON, and
`exportHistory` wraps that document with enabled state and retention bounds
for machine-readable IPC use.

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
    "overlayOpen": false,
    "breakDebtSeconds": 0,
    "contextDeferred": false,
    "busyContext": false,
    "busyContextReason": "",
    "manualHoldRemainingSeconds": 0
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
    "overlayOpen": false,
    "breakDebtSeconds": 0,
    "contextDeferred": false,
    "busyContext": false,
    "busyContextReason": "",
    "manualHoldRemainingSeconds": 0
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
| `exportHistory` | `{}` | Return enabled state, retention bounds, and the versioned local history document |

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
| `History.js` | Pure event validation, retention, export, and humane aggregation | File I/O, app observation, or runtime transitions |
| `BarWidget.qml` | Read-only status projection and user intents | Canonical timer state or IPC handler |
| `Panel.qml` | Editable form state until save | Runtime countdown or persistence policy |
| `Overlay.qml` | Per-display rendering and focus state | Completion policy or canonical break state |

All mutations flow through `Service.qml` into `Engine.js`. The service persists
data encoded and validated by `StateStore.js`. Views send intents and render
the resulting public state.
