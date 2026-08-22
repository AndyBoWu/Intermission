var MAX_SNAPSHOT_LENGTH = 1024 * 1024

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function parseSnapshotText(raw) {
  var text = String(raw === undefined || raw === null ? "" : raw).trim()
  if (text === "") return { ok: false, reason: "EMPTY", message: "Snapshot is empty" }
  if (text.length > MAX_SNAPSHOT_LENGTH)
    return { ok: false, reason: "TOO_LARGE", message: "Snapshot exceeds the size limit" }

  try {
    var value = JSON.parse(text)
    if (!isObject(value))
      return { ok: false, reason: "INVALID_SHAPE", message: "Snapshot must be a JSON object" }
    if (Number.isInteger(value.schemaVersion) && value.schemaVersion > 1)
      return { ok: false, reason: "UNSUPPORTED_VERSION", message: "Snapshot version is newer than supported" }
    return { ok: true, reason: null, value: clone(value), message: "" }
  } catch (error) {
    return { ok: false, reason: "INVALID_JSON", message: "Snapshot contains invalid JSON" }
  }
}

function serializeSnapshot(snapshot) {
  if (!isObject(snapshot))
    return { ok: false, text: "", message: "Snapshot must be a JSON object" }
  try {
    return { ok: true, text: JSON.stringify(clone(snapshot), null, 2) + "\n", message: "" }
  } catch (error) {
    return { ok: false, text: "", message: "Snapshot cannot be serialized" }
  }
}

function stateHome(xdgStateHome, home) {
  var configured = String(xdgStateHome || "").replace(/\/+$/, "")
  if (configured !== "") return configured
  var fallbackHome = String(home || "").replace(/\/+$/, "")
  return fallbackHome === "" ? "" : fallbackHome + "/.local/state"
}

function sessionPath(xdgStateHome, home) {
  var base = stateHome(xdgStateHome, home)
  return base === "" ? "" : base + "/intermission/session.json"
}

if (typeof module !== "undefined") {
  module.exports = {
    MAX_SNAPSHOT_LENGTH: MAX_SNAPSHOT_LENGTH,
    parseSnapshotText: parseSnapshotText,
    serializeSnapshot: serializeSnapshot,
    stateHome: stateHome,
    sessionPath: sessionPath
  }
}
