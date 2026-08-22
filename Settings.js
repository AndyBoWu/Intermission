var PLUGIN_ID = "io.github.andybowu.intermission"

var DEFAULTS = {
  configVersion: 1,
  autoStart: true,
  workIntervalSeconds: 1200,
  shortBreakSeconds: 20,
  longBreakSeconds: 180,
  cyclesBeforeLong: 4,
  warningSeconds: 30,
  snoozeSeconds: 300,
  naturalBreakSeconds: 120,
  escapeHoldSeconds: 3,
  reducedMotion: false
}

var INTEGER_FIELDS = {
  workIntervalSeconds: { minimum: 60, maximum: 14400 },
  shortBreakSeconds: { minimum: 10, maximum: 900 },
  longBreakSeconds: { minimum: 30, maximum: 3600 },
  cyclesBeforeLong: { minimum: 1, maximum: 12 },
  warningSeconds: { minimum: 0, maximum: 300 },
  snoozeSeconds: { minimum: 60, maximum: 1800 },
  naturalBreakSeconds: { minimum: 30, maximum: 3600 },
  escapeHoldSeconds: { minimum: 1, maximum: 10 }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function validInteger(value, bounds) {
  return Number.isInteger(value) && value >= bounds.minimum && value <= bounds.maximum
}

function normalize(raw) {
  var source = isObject(raw) && (raw.configVersion === undefined || raw.configVersion === 1)
    ? raw : {}
  var result = clone(DEFAULTS)

  if (typeof source.autoStart === "boolean") result.autoStart = source.autoStart
  if (typeof source.reducedMotion === "boolean") result.reducedMotion = source.reducedMotion

  for (var field in INTEGER_FIELDS) {
    if (validInteger(source[field], INTEGER_FIELDS[field])) result[field] = source[field]
  }
  return result
}

function formFromSettings(raw) {
  return normalize(raw)
}

function findInlineEntry(config, pluginId) {
  var source = isObject(config) ? config : {}
  var target = String(pluginId || PLUGIN_ID)
  var layout = isObject(source.bar) && isObject(source.bar.layout) ? source.bar.layout : {}
  var sections = ["left", "center", "right"]

  for (var s = 0; s < sections.length; s++) {
    var entries = Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < entries.length; i++) {
      if (isObject(entries[i]) && String(entries[i].id || "") === target) return entries[i]
    }
  }

  var plugins = Array.isArray(source.plugins) ? source.plugins : []
  for (var p = 0; p < plugins.length; p++) {
    if (isObject(plugins[p]) && String(plugins[p].id || "") === target) return plugins[p]
  }
  return {}
}

function entryFromForm(existing, form, pluginId) {
  var current = isObject(existing) ? existing : {}
  var values = isObject(form) ? form : {}
  var normalized = normalize(values)
  var entry = {}

  for (var key in current) if (key !== "id") entry[key] = current[key]
  entry.id = String(pluginId || PLUGIN_ID)
  entry.configVersion = 1
  entry.autoStart = normalized.autoStart
  for (var field in INTEGER_FIELDS) entry[field] = normalized[field]
  entry.reducedMotion = normalized.reducedMotion
  return entry
}

if (typeof module !== "undefined") {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    DEFAULTS: DEFAULTS,
    INTEGER_FIELDS: INTEGER_FIELDS,
    normalize: normalize,
    formFromSettings: formFromSettings,
    findInlineEntry: findInlineEntry,
    entryFromForm: entryFromForm
  }
}
