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
  assertDeepEqual(Engine.PHASES, ["stopped", "active", "idle", "warning", "deferred", "break", "paused"]);
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
  const options = settings();
  const warning = atWarning(options);
  const skipped = Engine.transition(warning, { type: "skip", reason: "user" }, 91 * SECOND, options);
  assert(skipped.ok);
  assertEqual(skipped.state.phase, "active");
  assertEqual(skipped.state.cycleIndex, 1);
  assertEqual(skipped.effects[0].type, "break-skipped");
  assertEqual(skipped.effects[0].breakKind, "short");
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
