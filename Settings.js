var PLUGIN_ID = "io.github.andybowu.intermission"
var BUILTIN_ROUTINE_IDS = ["eyes", "stand", "stretch", "hydrate"]
var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
var DEFAULT_WORKDAY_HOURS = {
  sun: "off",
  mon: "09:00-17:00",
  tue: "09:00-17:00",
  wed: "09:00-17:00",
  thu: "09:00-17:00",
  fri: "09:00-17:00",
  sat: "off"
}

var DEFAULTS = {
  configVersion: 1,
  autoStart: true,
  presetId: "balanced",
  workIntervalSeconds: 1200,
  shortWorkIntervalSeconds: 1200,
  longWorkIntervalSeconds: 1200,
  shortBreakSeconds: 20,
  longBreakSeconds: 180,
  cyclesBeforeLong: 4,
  warningSeconds: 30,
  snoozeSeconds: 300,
  naturalBreakSeconds: 120,
  escapeHoldSeconds: 3,
  reducedMotion: false,
  contextDeferralEnabled: true,
  busyAppIds: "",
  routineOrder: BUILTIN_ROUTINE_IDS,
  customBreakItems: [],
  workdayHoursEnabled: false,
  endOfDayPromptEnabled: false,
  historyEnabled: false,
  historyWindowDays: 7,
  workdayHoursByDay: DEFAULT_WORKDAY_HOURS
}

var INTEGER_FIELDS = {
  workIntervalSeconds: { minimum: 60, maximum: 14400 },
  shortWorkIntervalSeconds: { minimum: 60, maximum: 14400 },
  longWorkIntervalSeconds: { minimum: 60, maximum: 14400 },
  shortBreakSeconds: { minimum: 10, maximum: 900 },
  longBreakSeconds: { minimum: 30, maximum: 3600 },
  cyclesBeforeLong: { minimum: 1, maximum: 12 },
  warningSeconds: { minimum: 0, maximum: 300 },
  snoozeSeconds: { minimum: 60, maximum: 1800 },
  naturalBreakSeconds: { minimum: 30, maximum: 3600 },
  escapeHoldSeconds: { minimum: 1, maximum: 10 }
}

var PRESETS = {
  balanced: {
    shortWorkIntervalSeconds: 1200,
    longWorkIntervalSeconds: 1200,
    shortBreakSeconds: 20,
    longBreakSeconds: 180,
    cyclesBeforeLong: 4
  },
  frequent: {
    shortWorkIntervalSeconds: 900,
    longWorkIntervalSeconds: 900,
    shortBreakSeconds: 20,
    longBreakSeconds: 120,
    cyclesBeforeLong: 4
  },
  spacious: {
    shortWorkIntervalSeconds: 1800,
    longWorkIntervalSeconds: 2400,
    shortBreakSeconds: 30,
    longBreakSeconds: 300,
    cyclesBeforeLong: 3
  }
}

var PRESET_FIELDS = [
  "shortWorkIntervalSeconds",
  "longWorkIntervalSeconds",
  "shortBreakSeconds",
  "longBreakSeconds",
  "cyclesBeforeLong"
]

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function validInteger(value, bounds) {
  return Number.isInteger(value) && value >= bounds.minimum && value <= bounds.maximum
}

function appIdList(raw) {
  var values = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/)
  var result = []
  for (var i = 0; i < values.length && result.length < 20; i++) {
    var value = String(values[i] || "").trim().toLowerCase()
    if (!/^[a-z0-9._-]{1,128}$/.test(value) || result.indexOf(value) !== -1) continue
    result.push(value)
  }
  return result
}

function appIdText(raw) {
  return appIdList(raw).join(", ")
}

function appIdAllowed(appId, rawAllowlist) {
  var candidate = String(appId || "").trim().toLowerCase()
  return candidate !== "" && appIdList(rawAllowlist).indexOf(candidate) !== -1
}

function addAppId(rawAllowlist, appId) {
  var values = appIdList(rawAllowlist)
  var candidate = String(appId || "").trim().toLowerCase()
  if (/^[a-z0-9._-]{1,128}$/.test(candidate) && values.indexOf(candidate) === -1)
    values.push(candidate)
  return appIdText(values)
}

function conciseText(value, maximum) {
  var text = String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ").trim()
  return text !== "" && text.length <= maximum ? text : ""
}

function normalizeCustomBreakItems(raw) {
  var values = Array.isArray(raw) ? raw : []
  var result = []
  var seen = {}
  for (var i = 0; i < values.length && result.length < 8; i++) {
    if (!isObject(values[i])) continue
    var id = String(values[i].id || "").trim().toLowerCase()
    var label = conciseText(values[i].label, 32)
    var instruction = conciseText(values[i].instruction, 80)
    if (!/^custom-[a-z0-9-]{1,40}$/.test(id) || seen[id] || label === "" || instruction === "")
      continue
    seen[id] = true
    result.push({ id: id, label: label, instruction: instruction })
  }
  return result
}

function normalizeRoutineOrder(raw, customItems) {
  var values = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/)
  var allowed = BUILTIN_ROUTINE_IDS.slice()
  var custom = normalizeCustomBreakItems(customItems)
  for (var c = 0; c < custom.length; c++) allowed.push(custom[c].id)
  var result = []
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i] || "").trim().toLowerCase()
    if (allowed.indexOf(key) !== -1 && result.indexOf(key) === -1) result.push(key)
  }
  return result.length > 0 ? result : BUILTIN_ROUTINE_IDS.slice()
}

function nextCustomRoutineId(raw) {
  var items = normalizeCustomBreakItems(raw)
  var used = {}
  for (var i = 0; i < items.length; i++) used[items[i].id] = true
  var index = 1
  while (used["custom-" + index]) index++
  return "custom-" + index
}

function parseReminderWindow(raw) {
  var text = String(raw || "").trim().toLowerCase()
  if (text === "off") return { valid: true, enabled: false, text: "off" }
  var match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(text)
  if (!match) return { valid: false, enabled: false, text: "" }
  var startHour = Number(match[1])
  var startMinute = Number(match[2])
  var endHour = Number(match[3])
  var endMinute = Number(match[4])
  if (startHour > 23 || startMinute > 59 || endHour > 24 || endMinute > 59 ||
      (endHour === 24 && endMinute !== 0))
    return { valid: false, enabled: false, text: "" }
  var start = startHour * 60 + startMinute
  var end = endHour * 60 + endMinute
  if (start === end) return { valid: false, enabled: false, text: "" }
  return { valid: true, enabled: true, startMinute: start, endMinute: end, text: text }
}

function normalizeWorkdayHours(raw) {
  var source = isObject(raw) ? raw : {}
  var result = {}
  for (var i = 0; i < DAY_KEYS.length; i++) {
    var key = DAY_KEYS[i]
    if (source[key] === undefined) {
      result[key] = DEFAULT_WORKDAY_HOURS[key]
      continue
    }
    var parsed = parseReminderWindow(source[key])
    result[key] = parsed.valid ? parsed.text : "off"
  }
  return result
}

function reminderAllowedAt(rawSettings, localParts) {
  var settings = normalize(rawSettings)
  if (!settings.workdayHoursEnabled) return true
  var parts = isObject(localParts) ? localParts : {}
  var dayIndex = Number.isInteger(parts.dayIndex) ? parts.dayIndex : -1
  var minute = Number.isInteger(parts.minuteOfDay) ? parts.minuteOfDay : -1
  if (dayIndex < 0 || dayIndex > 6 || minute < 0 || minute >= 1440) return false

  var today = parseReminderWindow(settings.workdayHoursByDay[DAY_KEYS[dayIndex]])
  if (today.enabled) {
    if (today.startMinute < today.endMinute &&
        minute >= today.startMinute && minute < today.endMinute) return true
    if (today.startMinute > today.endMinute && minute >= today.startMinute) return true
  }

  var previousIndex = (dayIndex + 6) % 7
  var previous = parseReminderWindow(settings.workdayHoursByDay[DAY_KEYS[previousIndex]])
  return previous.enabled && previous.startMinute > previous.endMinute && minute < previous.endMinute
}

function localTimeParts(value) {
  var date = value instanceof Date ? value : new Date(value === undefined ? Date.now() : value)
  function pad(number) { return number < 10 ? "0" + number : String(number) }
  return {
    dayIndex: date.getDay(),
    minuteOfDay: date.getHours() * 60 + date.getMinutes(),
    dateKey: String(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()),
    timezoneOffsetMinutes: date.getTimezoneOffset()
  }
}

function matchingPreset(values) {
  for (var presetId in PRESETS) {
    var preset = PRESETS[presetId]
    var matches = true
    for (var i = 0; i < PRESET_FIELDS.length; i++) {
      var field = PRESET_FIELDS[i]
      if (values[field] !== preset[field]) {
        matches = false
        break
      }
    }
    if (matches) return presetId
  }
  return "custom"
}

function normalize(raw) {
  var source = isObject(raw) && (raw.configVersion === undefined || raw.configVersion === 1)
    ? raw : {}
  var result = clone(DEFAULTS)

  if (typeof source.autoStart === "boolean") result.autoStart = source.autoStart
  if (typeof source.reducedMotion === "boolean") result.reducedMotion = source.reducedMotion
  if (typeof source.contextDeferralEnabled === "boolean")
    result.contextDeferralEnabled = source.contextDeferralEnabled
  if (typeof source.workdayHoursEnabled === "boolean")
    result.workdayHoursEnabled = source.workdayHoursEnabled
  if (typeof source.endOfDayPromptEnabled === "boolean")
    result.endOfDayPromptEnabled = source.endOfDayPromptEnabled
  if (typeof source.historyEnabled === "boolean") result.historyEnabled = source.historyEnabled
  if (source.historyWindowDays === 7 || source.historyWindowDays === 14)
    result.historyWindowDays = source.historyWindowDays
  result.busyAppIds = appIdText(source.busyAppIds)
  result.customBreakItems = normalizeCustomBreakItems(source.customBreakItems)
  result.routineOrder = normalizeRoutineOrder(source.routineOrder, result.customBreakItems)
  result.workdayHoursByDay = normalizeWorkdayHours(source.workdayHoursByDay)

  for (var field in INTEGER_FIELDS) {
    if (field === "workIntervalSeconds" || field === "shortWorkIntervalSeconds" ||
        field === "longWorkIntervalSeconds") continue
    if (validInteger(source[field], INTEGER_FIELDS[field])) result[field] = source[field]
  }
  var legacyWork = validInteger(source.workIntervalSeconds, INTEGER_FIELDS.workIntervalSeconds)
    ? source.workIntervalSeconds : DEFAULTS.workIntervalSeconds
  result.shortWorkIntervalSeconds = validInteger(
    source.shortWorkIntervalSeconds,
    INTEGER_FIELDS.shortWorkIntervalSeconds
  ) ? source.shortWorkIntervalSeconds : legacyWork
  result.longWorkIntervalSeconds = validInteger(
    source.longWorkIntervalSeconds,
    INTEGER_FIELDS.longWorkIntervalSeconds
  ) ? source.longWorkIntervalSeconds : legacyWork
  result.workIntervalSeconds = result.shortWorkIntervalSeconds
  result.presetId = matchingPreset(result)
  return result
}

function applyPreset(raw, presetId) {
  var result = normalize(raw)
  var preset = PRESETS[String(presetId || "")]
  if (!preset) return result
  for (var i = 0; i < PRESET_FIELDS.length; i++) {
    var field = PRESET_FIELDS[i]
    result[field] = preset[field]
  }
  result.workIntervalSeconds = result.shortWorkIntervalSeconds
  result.presetId = String(presetId)
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
  entry.workIntervalSeconds = normalized.shortWorkIntervalSeconds
  entry.presetId = normalized.presetId
  entry.reducedMotion = normalized.reducedMotion
  entry.contextDeferralEnabled = normalized.contextDeferralEnabled
  entry.busyAppIds = normalized.busyAppIds
  entry.routineOrder = clone(normalized.routineOrder)
  entry.customBreakItems = clone(normalized.customBreakItems)
  entry.workdayHoursEnabled = normalized.workdayHoursEnabled
  entry.endOfDayPromptEnabled = normalized.endOfDayPromptEnabled
  entry.historyEnabled = normalized.historyEnabled
  entry.historyWindowDays = normalized.historyWindowDays
  entry.workdayHoursByDay = clone(normalized.workdayHoursByDay)
  return entry
}

if (typeof module !== "undefined") {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    DEFAULTS: DEFAULTS,
    INTEGER_FIELDS: INTEGER_FIELDS,
    PRESETS: PRESETS,
    PRESET_FIELDS: PRESET_FIELDS,
    BUILTIN_ROUTINE_IDS: BUILTIN_ROUTINE_IDS,
    DAY_KEYS: DAY_KEYS,
    appIdList: appIdList,
    appIdText: appIdText,
    appIdAllowed: appIdAllowed,
    addAppId: addAppId,
    normalizeCustomBreakItems: normalizeCustomBreakItems,
    normalizeRoutineOrder: normalizeRoutineOrder,
    nextCustomRoutineId: nextCustomRoutineId,
    parseReminderWindow: parseReminderWindow,
    normalizeWorkdayHours: normalizeWorkdayHours,
    reminderAllowedAt: reminderAllowedAt,
    localTimeParts: localTimeParts,
    normalize: normalize,
    matchingPreset: matchingPreset,
    applyPreset: applyPreset,
    formFromSettings: formFromSettings,
    findInlineEntry: findInlineEntry,
    entryFromForm: entryFromForm
  }
}
