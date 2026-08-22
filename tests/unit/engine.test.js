const Engine = require("../../Engine.js");

const SECOND = 1000;

function settings(overrides = {}) {
  return {
    workIntervalSeconds: 100,
    shortBreakSeconds: 20,
    longBreakSeconds: 60,
    cyclesBeforeLong: 4,
    warningSeconds: 10,
    snoozeSeconds: 60,
    naturalBreakSeconds: 120,
    ...overrides
  };
}

function started(now = 0, options = settings()) {
  const initial = Engine.createState(now, options);
  const result = Engine.transition(initial, { type: "start" }, now, options);
  assert(result.ok, "Start should succeed");
  return result.state;
}

function atWarning(options = settings()) {
  const state = started(0, options);
  return Engine.transition(state, { type: "tick" }, 90 * SECOND, options).state;
}

test("engine declares every planned phase", () => {
  assertDeepEqual(Engine.PHASES, ["stopped", "active", "idle", "warning", "deferred", "break", "paused", "outside"]);
});

test("active countdown is derived without mutating persisted elapsed time", () => {
  const state = started();
  const before = JSON.stringify(state);
  const view = Engine.publicState(state, 25 * SECOND, settings());
  assertEqual(view.remainingSeconds, 75);
  assertEqual(state.activeElapsedMs, 0);
  assertEqual(JSON.stringify(state), before);
});

test("warning begins at the exact active-use boundary", () => {
  const options = settings();
  const state = started(0, options);
  const before = Engine.transition(state, { type: "tick" }, 90 * SECOND - 1, options);
  assertEqual(before.state.phase, "active");
  assertEqual(before.changed, false);

  const boundary = Engine.transition(state, { type: "tick" }, 90 * SECOND, options);
  assertEqual(boundary.state.phase, "warning");
  assertEqual(boundary.state.warningStartedAtEpochMs, 90 * SECOND);
});

test("warning automatically starts a break at its exact deadline", () => {
  const options = settings();
  const warning = atWarning(options);
  const before = Engine.transition(warning, { type: "tick" }, 100 * SECOND - 1, options);
  assertEqual(before.state.phase, "warning");

  const boundary = Engine.transition(warning, { type: "tick" }, 100 * SECOND, options);
  assertEqual(boundary.state.phase, "break");
  assertEqual(boundary.state.breakKind, "short");
  assertEqual(boundary.state.breakDurationMs, 20 * SECOND);
});

test("pause and resume exclude paused wall-clock time", () => {
  const options = settings();
  const state = started(0, options);
  const paused = Engine.transition(state, { type: "pause" }, 10 * SECOND, options).state;
  assertEqual(paused.phase, "paused");
  assertEqual(paused.activeElapsedMs, 10 * SECOND);

  const resumed = Engine.transition(paused, { type: "resume" }, 100 * SECOND, options).state;
  const view = Engine.publicState(resumed, 110 * SECOND, options);
  assertEqual(view.remainingSeconds, 80);
});

test("idle entry and return preserve accumulated active use", () => {
  const options = settings();
  const state = started(0, options);
  const idle = Engine.transition(state, { type: "enterIdle" }, 15 * SECOND, options).state;
  assertEqual(idle.phase, "idle");
  assertEqual(idle.activeElapsedMs, 15 * SECOND);

  const active = Engine.transition(idle, { type: "returnActive" }, 75 * SECOND, options).state;
  assertEqual(Engine.publicState(active, 85 * SECOND, options).remainingSeconds, 75);
});

test("resuming a pause from idle preserves the idle phase", () => {
  const options = settings();
  const state = started(0, options);
  const idle = Engine.transition(state, { type: "enterIdle" }, 15 * SECOND, options).state;
  const paused = Engine.transition(idle, { type: "pause" }, 20 * SECOND, options).state;
  const resumed = Engine.transition(paused, { type: "resume" }, 80 * SECOND, options).state;

  assertEqual(resumed.phase, "idle");
  assertEqual(resumed.activeElapsedMs, 15 * SECOND);
  assertEqual(resumed.activeStartedAtEpochMs, null);
});

test("snooze creates an accountable deadline and returns to warning", () => {
  const options = settings();
  const warning = atWarning(options);
  const deferred = Engine.transition(warning, { type: "snooze", seconds: 60 }, 91 * SECOND, options);
  assert(deferred.ok);
  assertEqual(deferred.state.phase, "deferred");
  assertEqual(deferred.effects[0].type, "break-deferred");

  const before = Engine.transition(deferred.state, { type: "tick" }, 151 * SECOND - 1, options);
  assertEqual(before.state.phase, "deferred");

  const due = Engine.transition(deferred.state, { type: "tick" }, 151 * SECOND, options);
  assertEqual(due.state.phase, "warning");
  assertEqual(due.state.warningStartedAtEpochMs, 151 * SECOND);
});

test("skip records an effect and advances cadence instead of losing the break", () => {
  const options = settings({
    shortWorkIntervalSeconds: 100,
    longWorkIntervalSeconds: 200,
    cyclesBeforeLong: 2
  });
  const warning = atWarning(options);
  const skipped = Engine.transition(warning, { type: "skip", reason: "user" }, 91 * SECOND, options);
  assert(skipped.ok);
  assertEqual(skipped.state.phase, "active");
  assertEqual(skipped.state.cycleIndex, 1);
  assertEqual(skipped.state.breakKind, "long");
  assertEqual(skipped.state.workTargetMs, 200 * SECOND);
  assertEqual(skipped.effects[0].type, "break-skipped");
  assertEqual(skipped.effects[0].breakKind, "short");
});

test("a natural break advances into the correct long-work target", () => {
  const options = settings({
    shortWorkIntervalSeconds: 100,
    longWorkIntervalSeconds: 200,
    cyclesBeforeLong: 2
  });
  const idle = Engine.transition(started(0, options), { type: "enterIdle" }, 10 * SECOND, options).state;
  const natural = Engine.transition(idle, {
    type: "naturalBreak",
    durationMs: 120 * SECOND
  }, 130 * SECOND, options);
  assert(natural.ok);
  assertEqual(natural.state.cycleIndex, 1);
  assertEqual(natural.state.breakKind, "long");
  assertEqual(natural.state.workTargetMs, 200 * SECOND);
});

test("manual break and completion use the same cadence transition", () => {
  const options = settings();
  const state = started(0, options);
  const activeBreak = Engine.transition(state, { type: "startBreak" }, 20 * SECOND, options).state;
  assertEqual(activeBreak.phase, "break");

  const completed = Engine.transition(activeBreak, { type: "completeBreak", source: "overlay" }, 40 * SECOND, options);
  assertEqual(completed.state.phase, "active");
  assertEqual(completed.state.cycleIndex, 1);
  assertEqual(completed.effects[0].type, "break-completed");
  assertEqual(completed.effects[0].actualDurationMs, 20 * SECOND);
});

test("emergency exit completes the break with an explicit safety effect", () => {
  const options = settings();
  const activeBreak = Engine.transition(started(0, options), { type: "startBreak" }, 10 * SECOND, options).state;
  const exited = Engine.transition(activeBreak, { type: "emergencyExit" }, 15 * SECOND, options);
  assert(exited.ok);
  assertEqual(exited.state.phase, "active");
  assertEqual(exited.effects[0].type, "break-emergency-exit");
  assertEqual(exited.effects[0].reason, "escape-hold");
});

test("four work cycles end with a long break", () => {
  const options = settings();
  let state = started(0, options);
  let now = 0;

  for (let cycle = 0; cycle < 3; cycle += 1) {
    now += SECOND;
    state = Engine.transition(state, { type: "startBreak" }, now, options).state;
    now += 20 * SECOND;
    state = Engine.transition(state, { type: "completeBreak" }, now, options).state;
  }

  assertEqual(state.cycleIndex, 3);
  assertEqual(state.breakKind, "long");
  const longBreak = Engine.transition(state, { type: "startBreak" }, now + SECOND, options).state;
  assertEqual(longBreak.breakDurationMs, 60 * SECOND);
});

test("short and long cadence rounds capture independent work targets", () => {
  const options = settings({
    shortWorkIntervalSeconds: 100,
    longWorkIntervalSeconds: 200,
    cyclesBeforeLong: 2
  });
  let state = started(0, options);
  assertEqual(state.breakKind, "short");
  assertEqual(state.workTargetMs, 100 * SECOND);

  state = Engine.transition(state, { type: "startBreak" }, SECOND, options).state;
  state = Engine.transition(state, { type: "completeBreak" }, 21 * SECOND, options).state;
  assertEqual(state.breakKind, "long");
  assertEqual(state.workTargetMs, 200 * SECOND);
});

test("deferring keeps cadence pending until the break is consumed", () => {
  const options = settings();
  const warning = atWarning(options);
  const deferred = Engine.transition(warning, { type: "snooze", seconds: 60 }, 91 * SECOND, options);
  assertEqual(deferred.state.cycleIndex, 0);
  assertEqual(deferred.state.breakKind, "short");

  const due = Engine.transition(deferred.state, { type: "tick" }, 151 * SECOND, options).state;
  const activeBreak = Engine.transition(due, { type: "startBreak" }, 152 * SECOND, options).state;
  const completed = Engine.transition(activeBreak, { type: "completeBreak" }, 172 * SECOND, options);
  assertEqual(completed.state.cycleIndex, 1);
  assertEqual(completed.effects[0].type, "break-completed");
});

test("a busy context defers one due break without repeatedly adding debt", () => {
  const options = settings();
  const warning = atWarning(options);
  const deferred = Engine.transition(
    warning,
    { type: "tick", busyContext: true },
    100 * SECOND,
    options
  );

  assert(deferred.ok);
  assertEqual(deferred.state.phase, "warning");
  assertEqual(deferred.state.contextDeferred, true);
  assertEqual(deferred.state.breakDebtMs, 20 * SECOND);
  assertEqual(deferred.state.pendingDebtRecorded, true);
  assertEqual(deferred.effects[0].type, "break-context-deferred");

  const repeated = Engine.transition(
    deferred.state,
    { type: "tick", busyContext: true },
    200 * SECOND,
    options
  );
  assertEqual(repeated.changed, false);
  assertEqual(repeated.state.breakDebtMs, 20 * SECOND);
});

test("a context-deferred break gets a bounded recovery warning at the next eligible moment", () => {
  const options = settings({ warningSeconds: 30 });
  const state = started(0, options);
  const warning = Engine.transition(state, { type: "tick" }, 70 * SECOND, options).state;
  const deferred = Engine.transition(
    warning,
    { type: "tick", busyContext: true },
    100 * SECOND,
    options
  ).state;

  const eligible = Engine.transition(
    deferred,
    { type: "tick", busyContext: false },
    200 * SECOND,
    options
  );
  assertEqual(eligible.state.phase, "warning");
  assertEqual(eligible.state.contextDeferred, false);
  assertEqual(Engine.publicState(eligible.state, 200 * SECOND, options).remainingSeconds, 10);
  assertEqual(eligible.effects[0].type, "break-context-available");

  const due = Engine.transition(
    eligible.state,
    { type: "tick", busyContext: false },
    210 * SECOND,
    options
  );
  assertEqual(due.state.phase, "break");
});

test("manual defer and skip record bounded owed rest only once per pending break", () => {
  const options = settings({ shortBreakSeconds: 20, longBreakSeconds: 60 });
  const warning = atWarning(options);
  const first = Engine.transition(warning, { type: "snooze" }, 91 * SECOND, options).state;
  assertEqual(first.breakDebtMs, 20 * SECOND);
  assertEqual(first.pendingDebtRecorded, true);

  const dueAgain = Engine.transition(first, { type: "tick" }, 151 * SECOND, options).state;
  const second = Engine.transition(dueAgain, { type: "snooze" }, 152 * SECOND, options).state;
  assertEqual(second.breakDebtMs, 20 * SECOND);

  const skipped = Engine.transition(second, { type: "skip" }, 153 * SECOND, options).state;
  assertEqual(skipped.breakDebtMs, 20 * SECOND);
  assertEqual(skipped.pendingDebtRecorded, false);

  let current = skipped;
  for (let index = 0; index < 5; index += 1) {
    current = Engine.transition(current, { type: "startBreak" }, (160 + index * 30) * SECOND, options).state;
    current = Engine.transition(current, { type: "emergencyExit" }, (161 + index * 30) * SECOND, options).state;
  }
  assertEqual(current.breakDebtMs, 60 * SECOND);
});

test("completed and natural breaks pay down one bounded owed-rest value", () => {
  const options = settings({ shortBreakSeconds: 20, longBreakSeconds: 60 });
  const warning = atWarning(options);
  const skipped = Engine.transition(warning, { type: "skip" }, 91 * SECOND, options).state;
  assertEqual(skipped.breakDebtMs, 20 * SECOND);

  const activeBreak = Engine.transition(skipped, { type: "startBreak" }, 92 * SECOND, options).state;
  const completed = Engine.transition(activeBreak, { type: "completeBreak" }, 112 * SECOND, options).state;
  assertEqual(completed.breakDebtMs, 0);

  const skippedAgain = Engine.transition(atWarning(options), { type: "skip" }, 91 * SECOND, options).state;
  const idle = Engine.transition(skippedAgain, { type: "enterIdle" }, 100 * SECOND, options).state;
  const natural = Engine.transition(idle, {
    type: "naturalBreak",
    durationMs: 120 * SECOND
  }, 220 * SECOND, options).state;
  assertEqual(natural.breakDebtMs, 0);
});

test("a bounded manual hold is persisted and can be cleared", () => {
  const options = settings();
  const state = started(0, options);
  const held = Engine.transition(state, { type: "holdContext", seconds: 1800 }, SECOND, options);
  assert(held.ok);
  assertEqual(held.state.manualHoldUntilEpochMs, 1801 * SECOND);
  assertEqual(Engine.publicState(held.state, 301 * SECOND, options).manualHoldRemainingSeconds, 1500);

  const cleared = Engine.transition(held.state, { type: "clearContextHold" }, 2 * SECOND, options);
  assert(cleared.ok);
  assertEqual(cleared.state.manualHoldUntilEpochMs, null);
});

test("workday close freezes active progress without creating owed rest", () => {
  const options = settings();
  const state = started(0, options);
  const closed = Engine.transition(state, {
    type: "closeWorkday",
    prompt: false,
    dateKey: "2026-08-21"
  }, 50 * SECOND, options);

  assert(closed.ok);
  assertEqual(closed.state.phase, "outside");
  assertEqual(closed.state.resumePhase, "active");
  assertEqual(closed.state.activeElapsedMs, 50 * SECOND);
  assertEqual(closed.state.breakDebtMs, 0);

  const later = Engine.transition(closed.state, { type: "tick" }, 500 * SECOND, options);
  assertEqual(later.changed, false);
  const opened = Engine.transition(later.state, { type: "openWorkday", idle: false }, 600 * SECOND, options);
  assertEqual(opened.state.phase, "active");
  assertEqual(Engine.publicState(opened.state, 610 * SECOND, options).remainingSeconds, 40);
  assertEqual(opened.state.breakDebtMs, 0);
});

test("workday close preserves a pending warning and resumes with a short warning", () => {
  const options = settings({ warningSeconds: 30 });
  const state = started(0, options);
  const warning = Engine.transition(state, { type: "tick" }, 70 * SECOND, options).state;
  const closed = Engine.transition(warning, {
    type: "closeWorkday",
    prompt: true,
    dateKey: "2026-08-21"
  }, 80 * SECOND, options);

  assertEqual(closed.state.phase, "outside");
  assertEqual(closed.state.resumePhase, "warning");
  assertEqual(Engine.publicState(closed.state, 80 * SECOND, options).outsideResumePhase, "warning");
  assertEqual(closed.state.endOfDayPromptPending, true);
  assertEqual(closed.state.breakDebtMs, 0);

  const opened = Engine.transition(closed.state, { type: "openWorkday", idle: false }, 200 * SECOND, options);
  assertEqual(opened.state.phase, "warning");
  assertEqual(Engine.publicState(opened.state, 200 * SECOND, options).remainingSeconds, 10);
  assertEqual(opened.state.endOfDayPromptPending, false);
});

test("end-of-day prompt is once per local date and supports reversible choices", () => {
  const options = settings();
  const first = Engine.transition(started(0, options), {
    type: "closeWorkday",
    prompt: true,
    dateKey: "2026-08-21"
  }, 10 * SECOND, options).state;
  assertEqual(first.endOfDayPromptPending, true);
  assertEqual(first.lastEndOfDayPromptDateKey, "2026-08-21");

  const kept = Engine.transition(first, { type: "dismissEndOfDay" }, 11 * SECOND, options).state;
  assertEqual(kept.endOfDayPromptPending, false);
  const override = Engine.transition(kept, { type: "continueWorkday", idle: false }, 12 * SECOND, options).state;
  assertEqual(override.phase, "active");
  assertEqual(override.workdayOverrideActive, true);

  const cycle = Engine.transition(override, { type: "startBreak" }, 13 * SECOND, options).state;
  const completed = Engine.transition(cycle, { type: "completeBreak" }, 33 * SECOND, options).state;
  assertEqual(completed.workdayOverrideActive, false);

  const second = Engine.transition(completed, {
    type: "closeWorkday",
    prompt: true,
    dateKey: "2026-08-21"
  }, 34 * SECOND, options).state;
  assertEqual(second.endOfDayPromptPending, false);

  const stopped = Engine.transition(second, { type: "stopForDay" }, 35 * SECOND, options).state;
  assertEqual(stopped.phase, "outside");
  assertEqual(stopped.activeElapsedMs, 0);
  assertEqual(stopped.resumePhase, "active");
  assertEqual(stopped.resetAtNextWorkday, true);
});

test("outside-hours state survives snapshot recovery", () => {
  const options = settings();
  const closed = Engine.transition(started(0, options), {
    type: "closeWorkday",
    prompt: false,
    dateKey: "2026-08-21"
  }, 20 * SECOND, options).state;
  const snapshot = Engine.snapshotState(closed, 30 * SECOND);
  const restored = Engine.restoreState(snapshot, 40 * SECOND, options);

  assert(restored.ok);
  assertEqual(restored.state.phase, "outside");
  assertEqual(restored.state.activeElapsedMs, 20 * SECOND);
  assertEqual(restored.state.resumePhase, "active");
});

test("outside-hours recovery remains frozen across a weekend", () => {
  const options = settings();
  const closed = Engine.transition(started(0, options), {
    type: "closeWorkday",
    prompt: false,
    dateKey: "2026-08-21"
  }, 20 * SECOND, options).state;
  const snapshot = Engine.snapshotState(closed, 30 * SECOND);
  const restored = Engine.restoreState(snapshot, 72 * 60 * 60 * SECOND, options);

  assert(restored.ok);
  assertEqual(restored.state.phase, "outside");
  assertEqual(restored.state.activeElapsedMs, 20 * SECOND);
  assertEqual(restored.state.breakDebtMs, 0);
});

test("stop for today resets once at the next allowed window", () => {
  const options = settings();
  const closed = Engine.transition(started(0, options), {
    type: "closeWorkday",
    prompt: true,
    dateKey: "2026-08-21"
  }, 20 * SECOND, options).state;
  const stopped = Engine.transition(closed, { type: "stopForDay" }, 21 * SECOND, options).state;
  const opened = Engine.transition(stopped, {
    type: "openWorkday",
    idle: false
  }, 22 * SECOND, options);

  assert(opened.ok);
  assertEqual(opened.state.phase, "active");
  assertEqual(opened.state.activeElapsedMs, 0);
  assertEqual(opened.state.revision, stopped.revision + 1);
  assertEqual(opened.state.resetAtNextWorkday, false);
});

test("stop for today preserves the upcoming cadence slot", () => {
  const options = settings({
    shortWorkIntervalSeconds: 100,
    longWorkIntervalSeconds: 200,
    cyclesBeforeLong: 2
  });
  let state = started(0, options);
  state = Engine.transition(state, { type: "startBreak" }, SECOND, options).state;
  state = Engine.transition(state, { type: "completeBreak" }, 21 * SECOND, options).state;
  assertEqual(state.breakKind, "long");

  const warning = Engine.transition(state, { type: "tick" }, 211 * SECOND, options).state;
  const closed = Engine.transition(warning, {
    type: "closeWorkday",
    prompt: true,
    dateKey: "2026-08-21"
  }, 212 * SECOND, options).state;
  const stopped = Engine.transition(closed, { type: "stopForDay" }, 213 * SECOND, options).state;
  const opened = Engine.transition(stopped, {
    type: "openWorkday",
    idle: false
  }, 214 * SECOND, options).state;

  assertEqual(opened.activeElapsedMs, 0);
  assertEqual(opened.cycleIndex, 1);
  assertEqual(opened.breakKind, "long");
  assertEqual(opened.workTargetMs, 200 * SECOND);
});

test("repeated idempotent actions do not create new revisions", () => {
  const options = settings();
  const state = started(0, options);
  const startedAgain = Engine.transition(state, { type: "start" }, SECOND, options);
  assert(startedAgain.ok);
  assertEqual(startedAgain.changed, false);
  assertEqual(startedAgain.state.revision, state.revision);

  const paused = Engine.transition(state, { type: "pause" }, SECOND, options).state;
  const pausedAgain = Engine.transition(paused, { type: "pause" }, 2 * SECOND, options);
  assertEqual(pausedAgain.changed, false);

  const stopped = Engine.transition(paused, { type: "stop" }, 3 * SECOND, options).state;
  const stoppedAgain = Engine.transition(stopped, { type: "stop" }, 4 * SECOND, options);
  assertEqual(stoppedAgain.changed, false);
});

test("invalid transitions preserve the input state", () => {
  const options = settings();
  const state = started(0, options);
  const before = JSON.stringify(state);
  const result = Engine.transition(state, { type: "completeBreak" }, SECOND, options);
  assertEqual(result.ok, false);
  assertEqual(result.error.code, "INVALID_STATE");
  assertEqual(JSON.stringify(state), before);
  assertEqual(JSON.stringify(result.state), before);
});

test("stale events are rejected without mutation", () => {
  const options = settings();
  const state = started(10 * SECOND, options);
  const result = Engine.transition(state, { type: "tick" }, 9 * SECOND, options);
  assertEqual(result.ok, false);
  assertEqual(result.error.code, "STALE_EVENT");
  assertEqual(result.state.phase, "active");
});

test("invalid, future, and stale snapshots fail closed", () => {
  const options = settings();
  const invalid = Engine.restoreState({ schemaVersion: 2 }, 100 * SECOND, options);
  assertEqual(invalid.ok, false);
  assertEqual(invalid.state.phase, "stopped");

  const futureState = started(1000 * SECOND, options);
  const future = Engine.restoreState(futureState, 100 * SECOND, options);
  assertEqual(future.error.code, "FUTURE_SNAPSHOT");
  assertEqual(future.state.phase, "stopped");

  const staleState = started(0, options);
  const stale = Engine.restoreState(staleState, 13 * 60 * 60 * SECOND, options);
  assertEqual(stale.error.code, "STALE_SNAPSHOT");
  assertEqual(stale.state.phase, "stopped");

  const invalidWarning = atWarning(options);
  invalidWarning.warningStartedAtEpochMs = null;
  assertEqual(Engine.restoreState(invalidWarning, 95 * SECOND, options).error.code, "INVALID_SNAPSHOT");

  const invalidDeferred = Engine.transition(atWarning(options), { type: "snooze" }, 91 * SECOND, options).state;
  invalidDeferred.deferredUntilEpochMs = null;
  assertEqual(Engine.restoreState(invalidDeferred, 95 * SECOND, options).error.code, "INVALID_SNAPSHOT");

  const invalidPaused = Engine.transition(started(0, options), { type: "pause" }, SECOND, options).state;
  invalidPaused.resumePhase = "break";
  assertEqual(Engine.restoreState(invalidPaused, 2 * SECOND, options).error.code, "INVALID_SNAPSHOT");

  const fractionalTimestamp = started(0, options);
  fractionalTimestamp.savedAtEpochMs = 1.5;
  assertEqual(Engine.restoreState(fractionalTimestamp, 2 * SECOND, options).error.code, "INVALID_SNAPSHOT");
});

test("stopped snapshots use the contract null break and round-trip", () => {
  const options = settings();
  const stopped = Engine.createState(10 * SECOND, options);
  assertEqual(stopped.breakKind, null);
  assertEqual(stopped.breakDurationMs, 0);

  const restored = Engine.restoreState(stopped, 20 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "stopped");
});

test("older version-one snapshots receive additive context defaults", () => {
  const options = settings();
  const legacy = started(0, options);
  delete legacy.breakDebtMs;
  delete legacy.pendingDebtRecorded;
  delete legacy.contextDeferred;
  delete legacy.manualHoldUntilEpochMs;
  delete legacy.workdayOverrideActive;
  delete legacy.endOfDayPromptPending;
  delete legacy.lastEndOfDayPromptDateKey;
  delete legacy.resetAtNextWorkday;
  legacy.savedAtEpochMs = 10 * SECOND;

  const restored = Engine.restoreState(legacy, 20 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.breakDebtMs, 0);
  assertEqual(restored.state.pendingDebtRecorded, false);
  assertEqual(restored.state.contextDeferred, false);
  assertEqual(restored.state.manualHoldUntilEpochMs, null);
  assertEqual(restored.state.workdayOverrideActive, false);
  assertEqual(restored.state.endOfDayPromptPending, false);
  assertEqual(restored.state.lastEndOfDayPromptDateKey, null);
  assertEqual(restored.state.resetAtNextWorkday, false);
});

test("context deferral and owed rest survive snapshot recovery", () => {
  const options = settings();
  const deferred = Engine.transition(
    atWarning(options),
    { type: "tick", busyContext: true },
    100 * SECOND,
    options
  ).state;
  const snapshot = Engine.snapshotState(deferred, 101 * SECOND);
  const restored = Engine.restoreState(snapshot, 110 * SECOND, options);

  assert(restored.ok);
  assertEqual(restored.state.phase, "warning");
  assertEqual(restored.state.contextDeferred, true);
  assertEqual(restored.state.breakDebtMs, 20 * SECOND);
});

test("restore excludes shell downtime from active use", () => {
  const options = settings({ naturalBreakSeconds: 120 });
  const state = started(0, options);
  state.savedAtEpochMs = 10 * SECOND;
  const restored = Engine.restoreState(state, 20 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "active");
  assertEqual(restored.state.activeElapsedMs, 10 * SECOND);
  assertEqual(Engine.publicState(restored.state, 30 * SECOND, options).remainingSeconds, 80);
});

test("snapshot captures active use without mutating live state", () => {
  const options = settings({ naturalBreakSeconds: 120 });
  const state = started(0, options);
  const before = JSON.stringify(state);
  const snapshot = Engine.snapshotState(state, 25 * SECOND);
  assertEqual(snapshot.savedAtEpochMs, 25 * SECOND);
  assertEqual(snapshot.activeElapsedMs, 25 * SECOND);
  assertEqual(snapshot.activeStartedAtEpochMs, 25 * SECOND);
  assertEqual(JSON.stringify(state), before);

  const restored = Engine.restoreState(snapshot, 35 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.activeElapsedMs, 25 * SECOND);
});

test("idle reload stays idle and excludes shell downtime", () => {
  const options = settings({ naturalBreakSeconds: 120 });
  const idle = Engine.transition(started(0, options), { type: "enterIdle" }, 10 * SECOND, options).state;
  idle.savedAtEpochMs = 20 * SECOND;

  const restored = Engine.restoreState(idle, 30 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "idle");
  assertEqual(restored.state.activeElapsedMs, 10 * SECOND);
  assertEqual(restored.state.activeStartedAtEpochMs, null);
});

test("qualifying restore downtime becomes a natural break", () => {
  const options = settings({ naturalBreakSeconds: 120 });
  const state = started(0, options);
  state.savedAtEpochMs = 10 * SECOND;
  const restored = Engine.restoreState(state, 130 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "active");
  assertEqual(restored.state.cycleIndex, 1);
  assertEqual(restored.effects[0].type, "break-natural");
});

test("qualifying idle restore remains idle until activity returns", () => {
  const options = settings({ naturalBreakSeconds: 120 });
  const idle = Engine.transition(started(0, options), { type: "enterIdle" }, 10 * SECOND, options).state;
  idle.savedAtEpochMs = 20 * SECOND;

  const restored = Engine.restoreState(idle, 140 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "idle");
  assertEqual(restored.state.activeElapsedMs, 0);
  assertEqual(restored.state.cycleIndex, 1);
  assertEqual(restored.effects[0].type, "break-natural");

  const restartedAgain = Engine.restoreState(restored.state, 270 * SECOND, options);
  assert(restartedAgain.ok);
  assertEqual(restartedAgain.state.phase, "idle");
  assertEqual(restartedAgain.state.cycleIndex, 1);
  assertEqual(restartedAgain.effects.length, 0);
});

test("overdue warning restores as a warning instead of opening a break", () => {
  const options = settings();
  const warning = atWarning(options);
  warning.savedAtEpochMs = 91 * SECOND;
  const restored = Engine.restoreState(warning, 105 * SECOND, options);
  assert(restored.ok);
  assertEqual(restored.state.phase, "warning");
  assertEqual(restored.state.warningStartedAtEpochMs, 105 * SECOND);
});

test("active break restores while an expired break completes", () => {
  const options = settings();
  const activeBreak = Engine.transition(started(0, options), { type: "startBreak" }, 10 * SECOND, options).state;
  activeBreak.savedAtEpochMs = 11 * SECOND;

  const restored = Engine.restoreState(activeBreak, 15 * SECOND, options);
  assertEqual(restored.state.phase, "break");
  assertEqual(restored.effects[0].type, "restore-overlay");

  const expired = Engine.restoreState(activeBreak, 31 * SECOND, options);
  assertEqual(expired.state.phase, "active");
  assertEqual(expired.effects[0].type, "break-completed");
});

test("recovery preserves a captured long-work target across settings changes", () => {
  const options = settings({
    shortWorkIntervalSeconds: 100,
    longWorkIntervalSeconds: 200,
    cyclesBeforeLong: 2
  });
  let state = started(0, options);
  state = Engine.transition(state, { type: "startBreak" }, SECOND, options).state;
  state = Engine.transition(state, { type: "completeBreak" }, 21 * SECOND, options).state;
  const snapshot = Engine.snapshotState(state, 31 * SECOND);

  const restored = Engine.restoreState(snapshot, 41 * SECOND, settings({
    shortWorkIntervalSeconds: 60,
    longWorkIntervalSeconds: 60,
    cyclesBeforeLong: 2
  }));
  assert(restored.ok);
  assertEqual(restored.state.breakKind, "long");
  assertEqual(restored.state.workTargetMs, 200 * SECOND);
  assertEqual(Engine.publicState(restored.state, 51 * SECOND, options).remainingSeconds, 180);
});

test("completing a long break resets the cadence", () => {
  const options = settings();
  let state = started(0, options);
  let now = 0;

  for (let cycle = 0; cycle < 3; cycle += 1) {
    now += SECOND;
    state = Engine.transition(state, { type: "startBreak" }, now, options).state;
    now += 20 * SECOND;
    state = Engine.transition(state, { type: "completeBreak" }, now, options).state;
  }

  now += SECOND;
  state = Engine.transition(state, { type: "startBreak" }, now, options).state;
  now += 60 * SECOND;
  const completed = Engine.transition(state, { type: "completeBreak" }, now, options).state;
  assertEqual(completed.cycleIndex, 0);
  assertEqual(completed.breakKind, "short");
});
