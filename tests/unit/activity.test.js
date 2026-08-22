const Engine = require("../../Engine.js");

const SECOND = 1000;
const BASE = 1_000_000;

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

function session(options = settings()) {
  const initial = Engine.createState(BASE, options);
  const started = Engine.transition(initial, { type: "start" }, BASE, options);
  return {
    state: started.state,
    context: Engine.createActivityContext(BASE)
  };
}

test("idle detection removes the monitor timeout from active use", () => {
  const options = settings();
  const current = session(options);
  const result = Engine.activitySignal(
    current.state,
    current.context,
    true,
    BASE + 15 * SECOND,
    5 * SECOND,
    options
  );

  assert(result.ok);
  assertEqual(result.state.phase, "idle");
  assertEqual(result.state.phaseEnteredAtEpochMs, BASE + 10 * SECOND);
  assertEqual(result.state.activeElapsedMs, 10 * SECOND);
  assertEqual(Engine.publicState(result.state, BASE + 60 * SECOND, options).remainingSeconds, 90);
});

test("natural idle satisfies one break and stays idle", () => {
  const options = settings();
  const current = session(options);
  const idle = Engine.activitySignal(
    current.state,
    current.context,
    true,
    BASE + 15 * SECOND,
    5 * SECOND,
    options
  );

  const before = Engine.heartbeat(idle.state, idle.context, BASE + 130 * SECOND - 1, options);
  assertEqual(before.state.phase, "idle");
  assertEqual(before.state.cycleIndex, 0);

  const boundary = Engine.heartbeat(idle.state, idle.context, BASE + 130 * SECOND, options);
  assertEqual(boundary.state.phase, "idle");
  assertEqual(boundary.state.cycleIndex, 1);
  assertEqual(boundary.state.activeElapsedMs, 0);
  assertEqual(boundary.effects[0].type, "break-natural");

  const later = Engine.heartbeat(boundary.state, boundary.context, BASE + 300 * SECOND, options);
  assertEqual(later.state.cycleIndex, 1);
  assertEqual(later.effects.length, 0);
});

test("returning after a natural break starts fresh without a prompt", () => {
  const options = settings();
  const current = session(options);
  const idle = Engine.activitySignal(
    current.state,
    current.context,
    true,
    BASE + 15 * SECOND,
    5 * SECOND,
    options
  );
  const satisfied = Engine.heartbeat(idle.state, idle.context, BASE + 130 * SECOND, options);
  const active = Engine.activitySignal(
    satisfied.state,
    satisfied.context,
    false,
    BASE + 140 * SECOND,
    5 * SECOND,
    options
  );

  assertEqual(active.state.phase, "active");
  assertEqual(active.state.activeElapsedMs, 0);
  assertEqual(active.state.activeStartedAtEpochMs, BASE + 140 * SECOND);
  assertEqual(Engine.publicState(active.state, BASE + 140 * SECOND, options).remainingSeconds, 100);
});

test("idle during warning suppresses the prompt and can satisfy it naturally", () => {
  const options = settings();
  const current = session(options);
  const warningState = Engine.transition(
    current.state,
    { type: "tick" },
    BASE + 90 * SECOND,
    options
  ).state;
  const warningContext = Engine.createActivityContext(BASE + 90 * SECOND);
  assertEqual(warningState.phase, "warning");

  const idle = Engine.activitySignal(
    warningState,
    warningContext,
    true,
    BASE + 95 * SECOND,
    5 * SECOND,
    options
  );
  assertEqual(idle.state.phase, "paused");
  assertEqual(idle.context.pausedForIdle, true);

  const satisfied = Engine.heartbeat(idle.state, idle.context, BASE + 210 * SECOND, options);
  assertEqual(satisfied.state.phase, "idle");
  assertEqual(satisfied.state.cycleIndex, 1);
  assertEqual(satisfied.effects[0].type, "break-natural");

  const active = Engine.activitySignal(
    satisfied.state,
    satisfied.context,
    false,
    BASE + 220 * SECOND,
    5 * SECOND,
    options
  );
  assertEqual(active.state.phase, "active");
  assertEqual(active.state.cycleIndex, 1);
});

test("a short idle-warning interruption resumes the warning deadline", () => {
  const options = settings();
  const current = session(options);
  const warningState = Engine.transition(
    current.state,
    { type: "tick" },
    BASE + 90 * SECOND,
    options
  ).state;
  const warningContext = Engine.createActivityContext(BASE + 90 * SECOND);
  const idle = Engine.activitySignal(
    warningState,
    warningContext,
    true,
    BASE + 95 * SECOND,
    5 * SECOND,
    options
  );
  const active = Engine.activitySignal(
    idle.state,
    idle.context,
    false,
    BASE + 100 * SECOND,
    5 * SECOND,
    options
  );

  assertEqual(active.state.phase, "warning");
  assertEqual(Engine.publicState(active.state, BASE + 100 * SECOND, options).remainingSeconds, 10);
});

test("a short idle interruption preserves a deferred deadline", () => {
  const options = settings();
  const current = session(options);
  const warning = Engine.transition(
    current.state,
    { type: "tick" },
    BASE + 90 * SECOND,
    options
  ).state;
  const deferred = Engine.transition(
    warning,
    { type: "snooze", seconds: 60 },
    BASE + 91 * SECOND,
    options
  ).state;
  const context = Engine.createActivityContext(BASE + 91 * SECOND);
  const idle = Engine.activitySignal(
    deferred,
    context,
    true,
    BASE + 96 * SECOND,
    5 * SECOND,
    options
  );
  const active = Engine.activitySignal(
    idle.state,
    idle.context,
    false,
    BASE + 100 * SECOND,
    5 * SECOND,
    options
  );

  assertEqual(active.state.phase, "deferred");
  assertEqual(Engine.publicState(active.state, BASE + 100 * SECOND, options).remainingSeconds, 60);
});

test("a qualifying idle period satisfies a deferred break", () => {
  const options = settings();
  const current = session(options);
  const warning = Engine.transition(
    current.state,
    { type: "tick" },
    BASE + 90 * SECOND,
    options
  ).state;
  const deferred = Engine.transition(
    warning,
    { type: "snooze", seconds: 60 },
    BASE + 91 * SECOND,
    options
  ).state;
  const context = Engine.createActivityContext(BASE + 91 * SECOND);
  const idle = Engine.activitySignal(
    deferred,
    context,
    true,
    BASE + 96 * SECOND,
    5 * SECOND,
    options
  );
  const satisfied = Engine.heartbeat(idle.state, idle.context, BASE + 211 * SECOND, options);

  assertEqual(satisfied.state.phase, "idle");
  assertEqual(satisfied.state.cycleIndex, 1);
  assertEqual(satisfied.effects[0].type, "break-natural");
});

test("rapid idle-active signals are idempotent and preserve active time", () => {
  const options = settings();
  const current = session(options);
  const idle = Engine.activitySignal(
    current.state,
    current.context,
    true,
    BASE + 6 * SECOND,
    SECOND,
    options
  );
  const duplicate = Engine.activitySignal(
    idle.state,
    idle.context,
    true,
    BASE + 6 * SECOND,
    SECOND,
    options
  );
  const active = Engine.activitySignal(
    duplicate.state,
    duplicate.context,
    false,
    BASE + 7 * SECOND,
    SECOND,
    options
  );

  assertEqual(duplicate.changed, false);
  assertEqual(active.state.phase, "active");
  assertEqual(active.state.activeElapsedMs, 5 * SECOND);
  assertEqual(active.state.cycleIndex, 0);
});

test("a qualifying heartbeat gap behaves as a natural break", () => {
  const options = settings();
  const current = session(options);
  const first = Engine.heartbeat(current.state, current.context, BASE + 10 * SECOND, options);
  const resumed = Engine.heartbeat(first.state, first.context, BASE + 140 * SECOND, options, {
    expectedIntervalMs: SECOND,
    suspensionThresholdMs: 5 * SECOND
  });

  assert(resumed.ok);
  assertEqual(resumed.state.phase, "active");
  assertEqual(resumed.state.cycleIndex, 1);
  assertEqual(resumed.state.activeElapsedMs, 0);
  assertEqual(resumed.effects[0].type, "activity-gap");
  assertEqual(resumed.effects[1].type, "break-natural");
});

test("a nonqualifying heartbeat gap is excluded from active-use time", () => {
  const options = settings();
  const current = session(options);
  const first = Engine.heartbeat(current.state, current.context, BASE + 10 * SECOND, options);
  const resumed = Engine.heartbeat(first.state, first.context, BASE + 20 * SECOND, options, {
    expectedIntervalMs: SECOND,
    suspensionThresholdMs: 5 * SECOND
  });

  assertEqual(resumed.state.phase, "active");
  assertEqual(resumed.state.activeElapsedMs, 2 * SECOND);
  assertEqual(Engine.publicState(resumed.state, BASE + 20 * SECOND, options).remainingSeconds, 98);
});

test("backward clock changes rebase timestamps without changing elapsed use", () => {
  const options = settings();
  const current = session(options);
  const first = Engine.heartbeat(current.state, current.context, BASE + 10 * SECOND, options, {
    expectedIntervalMs: SECOND,
    suspensionThresholdMs: 20 * SECOND
  });
  const rebased = Engine.heartbeat(first.state, first.context, BASE - 10 * SECOND, options);

  assert(rebased.ok);
  assertEqual(rebased.effects[0].type, "clock-rebased");
  assertEqual(rebased.state.activeStartedAtEpochMs, BASE - 20 * SECOND);
  assertEqual(Engine.publicState(rebased.state, BASE - 10 * SECOND, options).remainingSeconds, 90);
});

test("suspend during an active break completes without reopening it", () => {
  const options = settings();
  const current = session(options);
  const activeBreak = Engine.transition(
    current.state,
    { type: "startBreak" },
    BASE + 10 * SECOND,
    options
  ).state;
  const context = Engine.createActivityContext(BASE + 10 * SECOND);
  const resumed = Engine.heartbeat(activeBreak, context, BASE + 40 * SECOND, options, {
    expectedIntervalMs: SECOND,
    suspensionThresholdMs: 5 * SECOND
  });

  assertEqual(resumed.state.phase, "active");
  assertEqual(resumed.effects[0].type, "activity-gap");
  assertEqual(resumed.effects[1].type, "break-completed");
});

test("a real idle signal does not freeze an active break", () => {
  const options = settings();
  const current = session(options);
  const activeBreak = Engine.transition(
    current.state,
    { type: "startBreak" },
    BASE + 10 * SECOND,
    options
  ).state;
  const context = Engine.createActivityContext(BASE + 10 * SECOND);
  const idle = Engine.activitySignal(
    activeBreak,
    context,
    true,
    BASE + 11 * SECOND,
    SECOND,
    options
  );
  const completed = Engine.heartbeat(idle.state, idle.context, BASE + 30 * SECOND, options);

  assertEqual(completed.state.phase, "idle");
  assertEqual(completed.state.cycleIndex, 1);
  assertEqual(completed.effects[0].type, "break-completed");
  assertEqual(completed.state.activeElapsedMs, 0);
});
