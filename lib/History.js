var SCHEMA_VERSION = 1
var RETENTION_DAYS = 30
var MAX_EVENTS = 2000
var MAX_TEXT_LENGTH = 1024 * 1024
var MAX_ACTIVE_WORK_MS = 14400000
var EVENT_TYPES = [
  "completed",
  "natural",
  "deferred",
  "skipped",
  "emergency-exit",
  "work-reset"
]
var SOURCES = ["timer", "overlay", "panel", "ipc", "idle", "recovery", "user", "context", "service"]
var REASONS = [null, "user", "escape-hold", "busy-context", "stop", "stop-for-day"]

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function emptyHistory() {
  return { schemaVersion: SCHEMA_VERSION, events: [] }
}

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  var parts = value.split("-").map(Number)
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2]
}

function dateKeyAt(epochMs) {
  var date = new Date(epochMs)
  function pad(value) { return value < 10 ? "0" + value : String(value) }
  return String(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
}

function dateKeysEnding(todayKey, days) {
  if (!validDateKey(todayKey)) return []
  var count = Number.isInteger(days) && days > 0 ? days : 1
  var parts = todayKey.split("-").map(Number)
  var cursor = Date.UTC(parts[0], parts[1] - 1, parts[2])
  var result = []
  for (var i = 0; i < count; i++) {
    var date = new Date(cursor - i * 86400000)
    var year = date.getUTCFullYear()
    var month = date.getUTCMonth() + 1
    var day = date.getUTCDate()
    result.push(String(year) + "-" + (month < 10 ? "0" : "") + String(month) + "-" +
      (day < 10 ? "0" : "") + String(day))
  }
  return result
}

function boundedInteger(value, maximum) {
  return Number.isInteger(value) && value >= 0 && value <= maximum ? value : null
}

function normalizeEvent(raw, now) {
  if (!isObject(raw)) return null
  var id = String(raw.id || "")
  var atEpochMs = boundedInteger(raw.atEpochMs, Number.MAX_SAFE_INTEGER)
  var localDateKey = String(raw.localDateKey || "")
  var type = String(raw.type || "")
  var breakKind = String(raw.breakKind || "")
  var scheduledDurationMs = boundedInteger(raw.scheduledDurationMs, 86400000)
  var actualDurationMs = boundedInteger(raw.actualDurationMs, 86400000)
  var activeWorkMs = boundedInteger(raw.activeWorkMs, MAX_ACTIVE_WORK_MS)
  var workTargetMs = boundedInteger(raw.workTargetMs, MAX_ACTIVE_WORK_MS)
  var source = String(raw.source || "")
  var reason = raw.reason === null ? null : String(raw.reason || "")

  if (!/^event-r\d+-\d+(?:-\d+)?-[a-z-]+$/.test(id) || atEpochMs === null ||
      (Number.isInteger(now) && atEpochMs > now + 300000) || !validDateKey(localDateKey) ||
      EVENT_TYPES.indexOf(type) === -1 || ["short", "long"].indexOf(breakKind) === -1 ||
      scheduledDurationMs === null || actualDurationMs === null || activeWorkMs === null ||
      workTargetMs === null || SOURCES.indexOf(source) === -1 || REASONS.indexOf(reason) === -1)
    return null

  return {
    id: id,
    atEpochMs: atEpochMs,
    localDateKey: localDateKey,
    type: type,
    breakKind: breakKind,
    scheduledDurationMs: scheduledDurationMs,
    actualDurationMs: actualDurationMs,
    activeWorkMs: activeWorkMs,
    workTargetMs: workTargetMs,
    source: source,
    reason: reason
  }
}

function trimEvents(events, todayKey) {
  var values = Array.isArray(events) ? events.slice() : []
  values.sort(function(a, b) {
    return a.atEpochMs === b.atEpochMs ? a.id.localeCompare(b.id) : a.atEpochMs - b.atEpochMs
  })
  var retainedKeys = dateKeysEnding(todayKey, RETENTION_DAYS)
  var oldestKey = retainedKeys.length > 0 ? retainedKeys[retainedKeys.length - 1] : ""
  if (oldestKey !== "") values = values.filter(function(event) {
    return event.localDateKey >= oldestKey && event.localDateKey <= todayKey
  })
  if (values.length > MAX_EVENTS) values = values.slice(values.length - MAX_EVENTS)
  return values
}

function normalizeDocument(raw, now, todayKey) {
  if (!isObject(raw) || raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.events))
    return { ok: false, reason: "INVALID_SHAPE", document: emptyHistory(), changed: false }

  var events = []
  var seen = {}
  var dropped = 0
  for (var i = 0; i < raw.events.length; i++) {
    var event = normalizeEvent(raw.events[i], now)
    if (!event || seen[event.id]) {
      dropped++
      continue
    }
    seen[event.id] = true
    events.push(event)
  }
  var retained = trimEvents(events, todayKey)
  var document = { schemaVersion: SCHEMA_VERSION, events: retained }
  return {
    ok: true,
    reason: null,
    document: document,
    changed: dropped > 0 || retained.length !== raw.events.length ||
      JSON.stringify(document) !== JSON.stringify(raw)
  }
}

function parseHistoryText(raw, now, todayKey) {
  var text = String(raw === undefined || raw === null ? "" : raw).trim()
  if (text === "")
    return { ok: false, reason: "EMPTY", document: emptyHistory(), changed: false }
  if (text.length > MAX_TEXT_LENGTH)
    return { ok: false, reason: "TOO_LARGE", document: emptyHistory(), changed: false }
  try {
    var value = JSON.parse(text)
    if (isObject(value) && Number.isInteger(value.schemaVersion) && value.schemaVersion > SCHEMA_VERSION)
      return { ok: false, reason: "UNSUPPORTED_VERSION", document: emptyHistory(), changed: false }
    return normalizeDocument(value, now, todayKey)
  } catch (error) {
    return { ok: false, reason: "INVALID_JSON", document: emptyHistory(), changed: false }
  }
}

function serializeHistory(document) {
  if (!isObject(document) || document.schemaVersion !== SCHEMA_VERSION ||
      !Array.isArray(document.events))
    return { ok: false, text: "", message: "History must be a versioned document" }
  try {
    var text = JSON.stringify(clone(document), null, 2) + "\n"
    if (text.length > MAX_TEXT_LENGTH)
      return { ok: false, text: "", message: "History exceeds the size limit" }
    return { ok: true, text: text, message: "" }
  } catch (error) {
    return { ok: false, text: "", message: "History cannot be serialized" }
  }
}

function eventType(effectType) {
  if (effectType === "break-completed") return "completed"
  if (effectType === "break-natural") return "natural"
  if (effectType === "break-deferred" || effectType === "break-context-deferred") return "deferred"
  if (effectType === "break-skipped") return "skipped"
  if (effectType === "break-emergency-exit") return "emergency-exit"
  if (effectType === "work-reset") return "work-reset"
  return ""
}

function sourceForEffect(effect, type) {
  var source = String(effect.source || "")
  if (effect.type === "break-context-deferred") return "context"
  if (type === "deferred" || type === "skipped") return "user"
  if (type === "work-reset") return "service"
  return SOURCES.indexOf(source) !== -1 ? source : "timer"
}

function reasonForEffect(effect, type) {
  if (effect.type === "break-context-deferred") return "busy-context"
  if (type === "deferred" || type === "skipped") return "user"
  if (type === "work-reset") return effect.reason === "stop-for-day" ? "stop-for-day" : "stop"
  if (type === "emergency-exit") return "escape-hold"
  return null
}

function eventFromEffect(effect, revision, index, now) {
  if (!isObject(effect)) return null
  var type = eventType(String(effect.type || ""))
  if (type === "") return null
  var atEpochMs = Number.isInteger(effect.atEpochMs) ? effect.atEpochMs : now
  var activeWorkMs = type === "deferred" ? 0 : Number(effect.activeWorkMs) || 0
  var raw = {
    id: "event-r" + String(revision) + "-" + String(index) + "-" +
      String(atEpochMs) + "-" + type,
    atEpochMs: atEpochMs,
    localDateKey: dateKeyAt(atEpochMs),
    type: type,
    breakKind: effect.breakKind,
    scheduledDurationMs: Number(effect.scheduledDurationMs) || 0,
    actualDurationMs: Number(effect.actualDurationMs) || 0,
    activeWorkMs: Math.max(0, Math.min(MAX_ACTIVE_WORK_MS, Math.floor(activeWorkMs))),
    workTargetMs: Math.max(0, Math.min(MAX_ACTIVE_WORK_MS, Math.floor(Number(effect.workTargetMs) || 0))),
    source: sourceForEffect(effect, type),
    reason: reasonForEffect(effect, type)
  }
  return normalizeEvent(raw, now)
}

function applyActiveWorkBaseline(effects, rawBaselineMs) {
  var baselineMs = boundedInteger(rawBaselineMs, MAX_ACTIVE_WORK_MS)
  var remaining = baselineMs === null ? 0 : baselineMs
  var values = Array.isArray(effects) ? effects : []
  var result = []
  var consumed = false
  var settledTypes = [
    "break-completed",
    "break-natural",
    "break-skipped",
    "break-emergency-exit",
    "work-reset"
  ]
  for (var i = 0; i < values.length; i++) {
    var effect = isObject(values[i]) ? clone(values[i]) : values[i]
    if (!consumed && isObject(effect) && settledTypes.indexOf(effect.type) !== -1) {
      var effectBaseline = boundedInteger(effect.historyBaselineActiveWorkMs, MAX_ACTIVE_WORK_MS)
      var subtraction = effectBaseline === null ? remaining : effectBaseline
      effect.activeWorkMs = Math.max(0, (Number(effect.activeWorkMs) || 0) - subtraction)
      delete effect.historyBaselineActiveWorkMs
      remaining = 0
      consumed = true
    }
    result.push(effect)
  }
  return { effects: result, remainingBaselineMs: remaining, consumed: consumed }
}

function appendEffects(document, effects, revision, now, todayKey) {
  var current = normalizeDocument(document, now, todayKey)
  var base = current.ok ? current.document : emptyHistory()
  var values = Array.isArray(effects) ? effects : []
  var existing = {}
  for (var e = 0; e < base.events.length; e++) existing[base.events[e].id] = true
  var nextEvents = base.events.slice()
  var added = 0
  for (var i = 0; i < values.length; i++) {
    var event = eventFromEffect(values[i], revision, i, now)
    if (!event || existing[event.id]) continue
    existing[event.id] = true
    nextEvents.push(event)
    added++
  }
  var retained = trimEvents(nextEvents, todayKey)
  return {
    document: { schemaVersion: SCHEMA_VERSION, events: retained },
    added: added,
    changed: added > 0 || retained.length !== base.events.length
  }
}

function emptyBucket(dateKey) {
  return {
    dateKey: dateKey,
    activeWorkMs: 0,
    completed: 0,
    natural: 0,
    deferred: 0,
    skipped: 0,
    emergencyExit: 0,
    workReset: 0
  }
}

function summarize(document, todayKey, days, liveActiveWorkMs) {
  var requestedDays = days === 14 ? 14 : days === 7 ? 7 : 1
  var keys = dateKeysEnding(todayKey, requestedDays)
  var buckets = {}
  for (var k = 0; k < keys.length; k++) buckets[keys[k]] = emptyBucket(keys[k])
  var events = isObject(document) && Array.isArray(document.events) ? document.events : []
  for (var i = 0; i < events.length; i++) {
    var event = events[i]
    var bucket = buckets[event.localDateKey]
    if (!bucket) continue
    if (event.type !== "deferred") bucket.activeWorkMs += event.activeWorkMs
    if (event.type === "completed") bucket.completed++
    else if (event.type === "natural") bucket.natural++
    else if (event.type === "deferred") bucket.deferred++
    else if (event.type === "skipped") bucket.skipped++
    else if (event.type === "emergency-exit") bucket.emergencyExit++
    else if (event.type === "work-reset") bucket.workReset++
  }
  var live = Number.isInteger(liveActiveWorkMs) && liveActiveWorkMs > 0 ? liveActiveWorkMs : 0
  if (buckets[todayKey]) buckets[todayKey].activeWorkMs += live

  var totals = emptyBucket(todayKey)
  var activeDays = 0
  for (var d = 0; d < keys.length; d++) {
    var row = buckets[keys[d]]
    totals.activeWorkMs += row.activeWorkMs
    totals.completed += row.completed
    totals.natural += row.natural
    totals.deferred += row.deferred
    totals.skipped += row.skipped
    totals.emergencyExit += row.emergencyExit
    totals.workReset += row.workReset
    if (row.activeWorkMs > 0) activeDays++
  }
  var supportive = totals.completed + totals.natural
  var adherenceDenominator = supportive + totals.skipped
  var continuityDays = 0
  for (var c = 0; c < keys.length; c++) {
    var day = buckets[keys[c]]
    var positive = day.completed + day.natural
    var settled = positive + day.skipped
    if (settled === 0) continue
    if (positive > 0 && positive >= day.skipped) continuityDays++
    else break
  }
  return {
    days: requestedDays,
    activeWorkMs: totals.activeWorkMs,
    activeMinutes: Math.floor(totals.activeWorkMs / 60000),
    supportiveBreaks: supportive,
    deferred: totals.deferred,
    skipped: totals.skipped,
    emergencyExit: totals.emergencyExit,
    adherencePercent: adherenceDenominator > 0
      ? Math.round(supportive * 100 / adherenceDenominator) : null,
    continuityDays: continuityDays,
    activeDays: activeDays,
    daily: keys.map(function(key) { return buckets[key] })
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    RETENTION_DAYS: RETENTION_DAYS,
    MAX_EVENTS: MAX_EVENTS,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
    EVENT_TYPES: EVENT_TYPES,
    emptyHistory: emptyHistory,
    validDateKey: validDateKey,
    dateKeyAt: dateKeyAt,
    dateKeysEnding: dateKeysEnding,
    normalizeEvent: normalizeEvent,
    normalizeDocument: normalizeDocument,
    parseHistoryText: parseHistoryText,
    serializeHistory: serializeHistory,
    eventFromEffect: eventFromEffect,
    applyActiveWorkBaseline: applyActiveWorkBaseline,
    appendEffects: appendEffects,
    summarize: summarize
  }
}
