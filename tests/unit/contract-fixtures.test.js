const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");

function fixture(name) {
  const contents = fs.readFileSync(path.join(projectRoot, "docs/contracts", name), "utf8");
  return JSON.parse(contents);
}

test("settings fixture exposes the version 1 cadence defaults", () => {
  const settings = fixture("settings.v1.json");
  assertEqual(settings.configVersion, 1);
  assertEqual(settings.workIntervalSeconds, 1200);
  assertEqual(settings.shortWorkIntervalSeconds, 1200);
  assertEqual(settings.longWorkIntervalSeconds, 1200);
  assertEqual(settings.presetId, "balanced");
  assertEqual(settings.shortBreakSeconds, 20);
  assertEqual(settings.longBreakSeconds, 180);
  assertEqual(settings.cyclesBeforeLong, 4);
  assertEqual(settings.contextDeferralEnabled, true);
  assertEqual(settings.busyAppIds, "");
  assertDeepEqual(settings.routineOrder, ["eyes", "stand", "stretch", "hydrate"]);
  assertDeepEqual(settings.customBreakItems, []);
  assertEqual(settings.workdayHoursEnabled, false);
  assertEqual(settings.endOfDayPromptEnabled, false);
});

test("session fixture uses a supported phase and monotonic revision", () => {
  const session = fixture("session.v1.json");
  const phases = ["stopped", "active", "idle", "warning", "deferred", "break", "paused", "outside"];
  assertEqual(session.schemaVersion, 1);
  assert(phases.includes(session.phase), "Session phase must be supported");
  assert(Number.isInteger(session.revision) && session.revision >= 0, "Revision must be non-negative");
  assertEqual(session.breakDebtMs, 0);
  assertEqual(session.contextDeferred, false);
  assertEqual(session.workdayOverrideActive, false);
  assertEqual(session.endOfDayPromptPending, false);
});

test("history fixture contains only versioned event data", () => {
  const history = fixture("history.v1.json");
  assertEqual(history.schemaVersion, 1);
  assert(Array.isArray(history.events), "History events must be an array");
  assertEqual(history.events[0].type, "completed");
  assertEqual(history.events[0].source, "overlay");
});
