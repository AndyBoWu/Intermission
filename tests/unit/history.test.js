const History = require("../../lib/History.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 21, 12);
const TODAY = "2026-08-21";

function event(overrides = {}) {
  return {
    id: "event-r1-0-completed",
    atEpochMs: NOW,
    localDateKey: TODAY,
    type: "completed",
    breakKind: "short",
    scheduledDurationMs: 20000,
    actualDurationMs: 20000,
    activeWorkMs: 1200000,
    workTargetMs: 1200000,
    source: "overlay",
    reason: null,
    ...overrides
  };
}

test("history parses a normalized version-one document", () => {
  const raw = JSON.stringify({ schemaVersion: 1, events: [event()] });
  const parsed = History.parseHistoryText(raw, NOW, TODAY);

  assert(parsed.ok);
  assertEqual(parsed.document.events.length, 1);
  assertEqual(parsed.document.events[0].localDateKey, TODAY);
  assertEqual(parsed.document.events[0].activeWorkMs, 1200000);
});

test("history corruption fails closed without inventing events", () => {
  for (const raw of ["", "not-json", "[]", '{"schemaVersion":2,"events":[]}']) {
    const parsed = History.parseHistoryText(raw, NOW, TODAY);
    assertEqual(parsed.ok, false);
    assertDeepEqual(parsed.document, History.emptyHistory());
  }
});

test("history drops invalid events and duplicate ids from a valid document", () => {
  const valid = event();
  const parsed = History.parseHistoryText(JSON.stringify({
    schemaVersion: 1,
    events: [valid, valid, event({ id: "bad-id" })]
  }), NOW, TODAY);

  assert(parsed.ok);
  assertEqual(parsed.changed, true);
  assertEqual(parsed.document.events.length, 1);
});

test("history maps supported engine effects and deduplicates a retried revision", () => {
  const effects = [{
    type: "break-completed",
    atEpochMs: NOW,
    breakKind: "short",
    scheduledDurationMs: 20000,
    actualDurationMs: 20000,
    activeWorkMs: 1200000,
    workTargetMs: 1200000,
    source: "overlay"
  }];
  const first = History.appendEffects(History.emptyHistory(), effects, 7, NOW, TODAY);
  const retried = History.appendEffects(first.document, effects, 7, NOW, TODAY);

  assertEqual(first.added, 1);
  assertEqual(first.document.events[0].id, "event-r7-0-1787313600000-completed");
  assertEqual(retried.added, 0);
  assertEqual(retried.document.events.length, 1);

  const reusedRevision = History.appendEffects(first.document, [{
    ...effects[0],
    atEpochMs: NOW + 1
  }], 7, NOW + 1, TODAY);
  assertEqual(reusedRevision.added, 1);
  assertEqual(reusedRevision.document.events.length, 2);
});

test("history maps every retained outcome to the exact bounded field set", () => {
  const base = {
    atEpochMs: NOW,
    breakKind: "short",
    scheduledDurationMs: 20000,
    actualDurationMs: 0,
    activeWorkMs: 1200000,
    workTargetMs: 1200000
  };
  const effects = [
    { ...base, type: "break-completed", actualDurationMs: 20000, source: "panel" },
    { ...base, type: "break-natural", actualDurationMs: 120000, source: "idle" },
    { ...base, type: "break-deferred" },
    { ...base, type: "break-skipped" },
    { ...base, type: "break-emergency-exit", source: "overlay" },
    { ...base, type: "work-reset", reason: "stop-for-day" }
  ];
  const appended = History.appendEffects(History.emptyHistory(), effects, 8, NOW, TODAY);

  assertDeepEqual(appended.document.events.map((item) => item.type), [
    "completed", "natural", "deferred", "skipped", "emergency-exit", "work-reset"
  ]);
  assertDeepEqual(Object.keys(appended.document.events[0]), [
    "id", "atEpochMs", "localDateKey", "type", "breakKind", "scheduledDurationMs",
    "actualDurationMs", "activeWorkMs", "workTargetMs", "source", "reason"
  ]);
  assertEqual(appended.document.events[2].activeWorkMs, 0);
  assertEqual(appended.document.events[5].reason, "stop-for-day");
});

test("history opt-in baseline excludes earlier work until one interval settles", () => {
  const effects = [{
    type: "break-deferred",
    activeWorkMs: 900000
  }, {
    type: "break-completed",
    activeWorkMs: 1200000,
    historyBaselineActiveWorkMs: 900000
  }];
  const before = JSON.stringify(effects);
  const prepared = History.applyActiveWorkBaseline(effects, 0);

  assertEqual(prepared.consumed, true);
  assertEqual(prepared.remainingBaselineMs, 0);
  assertEqual(prepared.effects[0].activeWorkMs, 900000);
  assertEqual(prepared.effects[1].activeWorkMs, 300000);
  assertEqual("historyBaselineActiveWorkMs" in prepared.effects[1], false);
  assertEqual(JSON.stringify(effects), before);

  const pending = History.applyActiveWorkBaseline([effects[0]], 900000);
  assertEqual(pending.consumed, false);
  assertEqual(pending.remainingBaselineMs, 900000);
});

test("history retention removes old local days and caps event growth", () => {
  const events = [];
  for (let index = 0; index < History.MAX_EVENTS + 10; index += 1) {
    events.push(event({
      id: `event-r${index + 1}-0-completed`,
      atEpochMs: NOW - (index % 29) * DAY + index,
      localDateKey: History.dateKeysEnding(TODAY, 30)[index % 29]
    }));
  }
  events.push(event({
    id: "event-r9999-0-completed",
    atEpochMs: NOW - 31 * DAY,
    localDateKey: "2026-07-21"
  }));
  const parsed = History.parseHistoryText(JSON.stringify({ schemaVersion: 1, events }), NOW, TODAY);

  assert(parsed.ok);
  assertEqual(parsed.document.events.length, History.MAX_EVENTS);
  assertEqual(parsed.document.events.some((item) => item.localDateKey === "2026-07-21"), false);
});

test("today summary merges live work and keeps neutral outcomes out of adherence", () => {
  const document = {
    schemaVersion: 1,
    events: [
      event(),
      event({ id: "event-r2-0-deferred", type: "deferred", activeWorkMs: 0, actualDurationMs: 0, source: "user", reason: "user" }),
      event({ id: "event-r3-0-emergency-exit", type: "emergency-exit", actualDurationMs: 1000, source: "overlay", reason: "escape-hold" })
    ]
  };
  const summary = History.summarize(document, TODAY, 1, 600000);

  assertEqual(summary.activeMinutes, 50);
  assertEqual(summary.supportiveBreaks, 1);
  assertEqual(summary.deferred, 1);
  assertEqual(summary.emergencyExit, 1);
  assertEqual(summary.adherencePercent, 100);
});

test("adherence is empty without settled supportive or skipped outcomes", () => {
  const summary = History.summarize(History.emptyHistory(), TODAY, 7, 0);

  assertEqual(summary.adherencePercent, null);
  assertEqual(summary.activeMinutes, 0);
  assertEqual(summary.continuityDays, 0);
});

test("continuity forgives one skip beside a supportive break but not a skip-only day", () => {
  const keys = History.dateKeysEnding(TODAY, 7);
  const supportive = event({ id: "event-r1-0-completed", localDateKey: keys[2], atEpochMs: NOW - 2 * DAY });
  const balanced = [
    event({ id: "event-r2-0-completed", localDateKey: keys[1], atEpochMs: NOW - DAY }),
    event({ id: "event-r3-0-skipped", localDateKey: keys[1], atEpochMs: NOW - DAY + 1, type: "skipped", actualDurationMs: 0, source: "user", reason: "user" })
  ];
  const today = event({ id: "event-r4-0-completed" });
  const continued = History.summarize({ schemaVersion: 1, events: [supportive, ...balanced, today] }, TODAY, 7, 0);
  assertEqual(continued.continuityDays, 3);

  const broken = History.summarize({
    schemaVersion: 1,
    events: [supportive, event({
      id: "event-r5-0-skipped",
      localDateKey: keys[1],
      atEpochMs: NOW - DAY,
      type: "skipped",
      actualDurationMs: 0,
      source: "user",
      reason: "user"
    }), today]
  }, TODAY, 7, 0);
  assertEqual(broken.continuityDays, 1);
});

test("history reset and export remain machine-readable", () => {
  const serialized = History.serializeHistory(History.emptyHistory());
  assert(serialized.ok);
  assertDeepEqual(JSON.parse(serialized.text), { schemaVersion: 1, events: [] });
});
