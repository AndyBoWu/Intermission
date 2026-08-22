const BreakView = require("../../BreakViewModel.js");

test("break view formats a stable minute and second countdown", () => {
  assertEqual(BreakView.formatRemaining(0), "0:00");
  assertEqual(BreakView.formatRemaining(9.1), "0:10");
  assertEqual(BreakView.formatRemaining(125), "2:05");
  assertEqual(BreakView.formatRemaining(-20), "0:00");
});

test("break view uses configured duration for each break kind", () => {
  const settings = { shortBreakSeconds: 40, longBreakSeconds: 240 };
  assertEqual(BreakView.totalSeconds("short", settings), 40);
  assertEqual(BreakView.totalSeconds("long", settings), 240);
  assertEqual(BreakView.totalSeconds("unknown", {}), 20);
});

test("break view clamps remaining progress to a safe fraction", () => {
  assertEqual(BreakView.remainingFraction(30, 60), 0.5);
  assertEqual(BreakView.remainingFraction(90, 60), 1);
  assertEqual(BreakView.remainingFraction(-1, 60), 0);
  assertEqual(BreakView.remainingFraction(10, 0), 0);
});

test("break view exposes one concise instruction for each break kind", () => {
  const shortBreak = BreakView.presentation("short", 0);
  const longBreak = BreakView.presentation("long", 0);
  assert(shortBreak.title !== longBreak.title);
  assert(shortBreak.instruction.length > 0 && shortBreak.instruction.length < 80);
  assert(longBreak.instruction.length > 0 && longBreak.instruction.length < 80);
});

test("the default cadence rotates guidance across three short breaks and one long break", () => {
  const keys = [
    BreakView.presentation("short", 0).key,
    BreakView.presentation("short", 1).key,
    BreakView.presentation("short", 2).key,
    BreakView.presentation("long", 3).key
  ];
  assertDeepEqual(keys, ["eyes", "stand", "stretch", "hydrate"]);
  assertEqual(BreakView.presentation("short", 4).key, "eyes");
  assert(BreakView.presentation("long", 2).instruction.length < 80);
});

test("break overlay follows the focused screen on every open", () => {
  const screens = ["DP-1", "HDMI-A-1"];
  assertEqual(BreakView.focusScreenName(screens, "DP-1", "HDMI-A-1", true), "HDMI-A-1");
  assertEqual(BreakView.focusScreenName(screens, "HDMI-A-1", "DP-1", true), "DP-1");
});

test("break overlay preserves a live focus screen during display reconciliation", () => {
  assertEqual(BreakView.focusScreenName(["DP-1", "DP-2"], "DP-1", "DP-2", false), "DP-1");
  assertEqual(BreakView.focusScreenName(["DP-2"], "DP-1", "DP-2", false), "DP-2");
  assertEqual(BreakView.focusScreenName([], "DP-1", "DP-1", false), "");
});
