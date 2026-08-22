const StateStore = require("../../StateStore.js");

test("state store resolves the XDG session path with a home fallback", () => {
  assertEqual(StateStore.sessionPath("/tmp/state/", "/home/user"), "/tmp/state/intermission/session.json");
  assertEqual(StateStore.sessionPath("", "/home/user"), "/home/user/.local/state/intermission/session.json");
  assertEqual(StateStore.sessionPath("", ""), "");
  assertEqual(StateStore.historyPath("/tmp/state/", "/home/user"), "/tmp/state/intermission/history.json");
  assertEqual(StateStore.historyPath("", "/home/user"), "/home/user/.local/state/intermission/history.json");
  assertEqual(StateStore.historyPath("", ""), "");
});

test("state store parses valid snapshots without mutating the source", () => {
  const source = { schemaVersion: 1, phase: "stopped" };
  const parsed = StateStore.parseSnapshotText(JSON.stringify(source));
  assert(parsed.ok);
  parsed.value.phase = "active";
  assertEqual(source.phase, "stopped");
});

test("state store distinguishes invalid and unsupported snapshots", () => {
  assertEqual(StateStore.parseSnapshotText("").reason, "EMPTY");
  assertEqual(StateStore.parseSnapshotText("{").reason, "INVALID_JSON");
  assertEqual(StateStore.parseSnapshotText("[]").reason, "INVALID_SHAPE");
  assertEqual(StateStore.parseSnapshotText('{"schemaVersion":2}').reason, "UNSUPPORTED_VERSION");
});

test("state store serializes a stable newline-terminated snapshot", () => {
  const encoded = StateStore.serializeSnapshot({ schemaVersion: 1, phase: "stopped" });
  assert(encoded.ok);
  assert(encoded.text.endsWith("\n"));
  assertDeepEqual(JSON.parse(encoded.text), { schemaVersion: 1, phase: "stopped" });
});
