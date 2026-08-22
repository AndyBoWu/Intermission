const Settings = require("../../Settings.js");

test("settings normalize every field independently", () => {
  const normalized = Settings.normalize({
    configVersion: 1,
    autoStart: false,
    workIntervalSeconds: 600,
    shortBreakSeconds: "40",
    longBreakSeconds: 240,
    cyclesBeforeLong: 0,
    warningSeconds: 45,
    snoozeSeconds: 600,
    naturalBreakSeconds: 180,
    escapeHoldSeconds: 4,
    reducedMotion: true
  });

  assertEqual(normalized.autoStart, false);
  assertEqual(normalized.workIntervalSeconds, 600);
  assertEqual(normalized.shortWorkIntervalSeconds, 600);
  assertEqual(normalized.longWorkIntervalSeconds, 600);
  assertEqual(normalized.shortBreakSeconds, Settings.DEFAULTS.shortBreakSeconds);
  assertEqual(normalized.longBreakSeconds, 240);
  assertEqual(normalized.cyclesBeforeLong, Settings.DEFAULTS.cyclesBeforeLong);
  assertEqual(normalized.warningSeconds, 45);
  assertEqual(normalized.snoozeSeconds, 600);
  assertEqual(normalized.naturalBreakSeconds, 180);
  assertEqual(normalized.escapeHoldSeconds, 4);
  assertEqual(normalized.reducedMotion, true);
  assertEqual(normalized.contextDeferralEnabled, true);
  assertEqual(normalized.busyAppIds, "");
});

test("future settings versions use safe defaults without mutating input", () => {
  const input = { configVersion: 99, workIntervalSeconds: 60, customFutureField: true };
  const before = JSON.stringify(input);
  const normalized = Settings.normalize(input);

  assertDeepEqual(normalized, Settings.DEFAULTS);
  assertEqual(JSON.stringify(input), before);
});

test("explicit saves preserve unknown fields and write normalized version one", () => {
  const existing = {
    id: Settings.PLUGIN_ID,
    configVersion: 1,
    customThemeHint: "calm",
    workIntervalSeconds: 1200
  };
  const form = Settings.formFromSettings(existing);
  form.shortWorkIntervalSeconds = 1500;
  form.longWorkIntervalSeconds = 2100;
  form.autoStart = false;

  const entry = Settings.entryFromForm(existing, form, Settings.PLUGIN_ID);
  assertEqual(entry.id, Settings.PLUGIN_ID);
  assertEqual(entry.configVersion, 1);
  assertEqual(entry.customThemeHint, "calm");
  assertEqual(entry.workIntervalSeconds, 1500);
  assertEqual(entry.shortWorkIntervalSeconds, 1500);
  assertEqual(entry.longWorkIntervalSeconds, 2100);
  assertEqual(entry.presetId, "custom");
  assertEqual(entry.autoStart, false);
  assertEqual(entry.naturalBreakSeconds, Settings.DEFAULTS.naturalBreakSeconds);
});

test("busy-app allowlists keep only bounded exact app ids", () => {
  const normalized = Settings.normalize({
    configVersion: 1,
    contextDeferralEnabled: false,
    busyAppIds: " Firefox, org.gnome.Evince  firefox  bad/id  "
  });

  assertEqual(normalized.contextDeferralEnabled, false);
  assertEqual(normalized.busyAppIds, "firefox, org.gnome.evince");
  assertDeepEqual(Settings.appIdList(normalized.busyAppIds), ["firefox", "org.gnome.evince"]);
  assertEqual(Settings.appIdAllowed("FIREFOX", normalized.busyAppIds), true);
  assertEqual(Settings.appIdAllowed("firefox-nightly", normalized.busyAppIds), false);
  assertEqual(Settings.addAppId(normalized.busyAppIds, "com.example.Slides"),
    "firefox, org.gnome.evince, com.example.slides");
});

test("break rotation validates custom items, ordering, and safe fallback", () => {
  const normalized = Settings.normalize({
    configVersion: 1,
    customBreakItems: [
      { id: "custom-breathe", label: "  Breathe  ", instruction: "Slow   down\nand breathe." },
      { id: "custom-breathe", label: "Duplicate", instruction: "Ignored." },
      { id: "bad/id", label: "Bad", instruction: "Ignored." },
      { id: "custom-empty", label: "", instruction: "Ignored." }
    ],
    routineOrder: ["hydrate", "custom-breathe", "hydrate", "unknown"]
  });

  assertDeepEqual(normalized.customBreakItems, [{
    id: "custom-breathe",
    label: "Breathe",
    instruction: "Slow down and breathe."
  }]);
  assertDeepEqual(normalized.routineOrder, ["hydrate", "custom-breathe"]);

  const fallback = Settings.normalize({ configVersion: 1, routineOrder: [] });
  assertDeepEqual(fallback.routineOrder, ["eyes", "stand", "stretch", "hydrate"]);
});

test("weekly reminder windows validate ordinary, disabled, and overnight hours", () => {
  const normalized = Settings.normalize({
    configVersion: 1,
    workdayHoursEnabled: true,
    endOfDayPromptEnabled: true,
    workdayHoursByDay: {
      sun: "off",
      mon: "09:00-17:00",
      tue: "22:00-06:00",
      wed: "invalid"
    }
  });

  assertEqual(normalized.workdayHoursEnabled, true);
  assertEqual(normalized.endOfDayPromptEnabled, true);
  assertEqual(normalized.workdayHoursByDay.sun, "off");
  assertEqual(normalized.workdayHoursByDay.mon, "09:00-17:00");
  assertEqual(normalized.workdayHoursByDay.tue, "22:00-06:00");
  assertEqual(normalized.workdayHoursByDay.wed, "off");

  assertEqual(Settings.reminderAllowedAt(normalized, { dayIndex: 1, minuteOfDay: 10 * 60 }), true);
  assertEqual(Settings.reminderAllowedAt(normalized, { dayIndex: 1, minuteOfDay: 18 * 60 }), false);
  assertEqual(Settings.reminderAllowedAt(normalized, { dayIndex: 2, minuteOfDay: 23 * 60 }), true);
  assertEqual(Settings.reminderAllowedAt(normalized, { dayIndex: 3, minuteOfDay: 5 * 60 }), true);
  assertEqual(Settings.reminderAllowedAt(normalized, { dayIndex: 3, minuteOfDay: 7 * 60 }), false);
});

test("reminder policy reevaluates supplied local time without storing a timezone", () => {
  const options = Settings.normalize({
    configVersion: 1,
    workdayHoursEnabled: true,
    workdayHoursByDay: { mon: "09:00-17:00" }
  });

  assertEqual(Settings.reminderAllowedAt(options, {
    dayIndex: 1,
    minuteOfDay: 16 * 60,
    timezoneOffsetMinutes: 480
  }), true);
  assertEqual(Settings.reminderAllowedAt(options, {
    dayIndex: 1,
    minuteOfDay: 18 * 60,
    timezoneOffsetMinutes: 300
  }), false);
});

test("named cadence presets apply atomically and persist their identity", () => {
  const frequent = Settings.applyPreset({}, "frequent");
  assertEqual(frequent.presetId, "frequent");
  assertEqual(frequent.shortWorkIntervalSeconds, 900);
  assertEqual(frequent.longWorkIntervalSeconds, 900);
  assertEqual(frequent.longBreakSeconds, 120);

  frequent.longWorkIntervalSeconds = 1200;
  assertEqual(Settings.matchingPreset(frequent), "custom");

  const entry = Settings.entryFromForm({}, Settings.applyPreset({}, "spacious"), Settings.PLUGIN_ID);
  assertEqual(entry.presetId, "spacious");
  assertEqual(entry.shortWorkIntervalSeconds, 1800);
  assertEqual(entry.longWorkIntervalSeconds, 2400);
});

test("service startup finds the inline bar entry before plugin fallback", () => {
  const config = {
    bar: {
      layout: {
        left: [],
        center: [],
        right: [{ id: Settings.PLUGIN_ID, autoStart: false }]
      }
    },
    plugins: [{ id: Settings.PLUGIN_ID, autoStart: true }]
  };

  const entry = Settings.findInlineEntry(config, Settings.PLUGIN_ID);
  assertEqual(entry.autoStart, false);
  assertEqual(Settings.normalize(entry).autoStart, false);
});
