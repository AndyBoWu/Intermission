var FALLBACK_SETTINGS = {
  shortBreakSeconds: 20,
  longBreakSeconds: 180
}

var ROUTINES = [
  {
    key: "eyes",
    short: { title: "A moment for your eyes", instruction: "Look across the room and let your focus soften." },
    long: { title: "Rest your eyes", instruction: "Step away from the screen and focus on something distant." }
  },
  {
    key: "stand",
    short: { title: "Change your posture", instruction: "Stand up and settle your weight evenly for a few breaths." },
    long: { title: "Time to stand", instruction: "Stand up and walk a few slow laps away from the screen." }
  },
  {
    key: "stretch",
    short: { title: "Loosen up", instruction: "Roll your shoulders and gently loosen your wrists." },
    long: { title: "Time to stretch", instruction: "Open your chest, stretch your shoulders, and loosen your wrists." }
  },
  {
    key: "hydrate",
    short: { title: "Take a sip", instruction: "Take a sip of water and relax your jaw." },
    long: { title: "Time to hydrate", instruction: "Refill your water and take a few unhurried sips." }
  }
]

function kindOf(value) {
  return value === "long" ? "long" : "short"
}

function safeSeconds(value) {
  var numeric = Number(value)
  return isFinite(numeric) && numeric > 0 ? Math.ceil(numeric) : 0
}

function formatRemaining(seconds) {
  var total = safeSeconds(seconds)
  var minutes = Math.floor(total / 60)
  var remainder = total % 60
  return String(minutes) + ":" + (remainder < 10 ? "0" : "") + String(remainder)
}

function totalSeconds(kind, settings) {
  var source = settings && typeof settings === "object" ? settings : {}
  var field = kindOf(kind) === "long" ? "longBreakSeconds" : "shortBreakSeconds"
  var fallback = FALLBACK_SETTINGS[field]
  var value = Number(source[field])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function remainingFraction(remaining, total) {
  var duration = safeSeconds(total)
  if (duration === 0) return 0
  return Math.max(0, Math.min(1, safeSeconds(remaining) / duration))
}

function routineIndex(cycleIndex) {
  var value = Number(cycleIndex)
  return Number.isInteger(value) && value >= 0 ? value % ROUTINES.length : 0
}

function customRoutineMap(configuration) {
  var source = configuration && typeof configuration === "object" ? configuration : {}
  var values = Array.isArray(source.customBreakItems) ? source.customBreakItems : []
  var result = {}
  for (var i = 0; i < values.length && i < 8; i++) {
    var item = values[i] && typeof values[i] === "object" ? values[i] : {}
    var id = String(item.id || "").trim().toLowerCase()
    var label = String(item.label || "").replace(/\s+/g, " ").trim()
    var instruction = String(item.instruction || "").replace(/\s+/g, " ").trim()
    if (/^custom-[a-z0-9-]{1,40}$/.test(id) && label.length > 0 && label.length <= 32 &&
        instruction.length > 0 && instruction.length <= 80 && !result[id]) {
      result[id] = { key: id, title: label, instruction: instruction }
    }
  }
  return result
}

function routineSequence(configuration) {
  var source = configuration && typeof configuration === "object" ? configuration : {}
  var values = Array.isArray(source.routineOrder) ? source.routineOrder : []
  var custom = customRoutineMap(source)
  var result = []
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i] || "").trim().toLowerCase()
    var builtin = null
    for (var r = 0; r < ROUTINES.length; r++) if (ROUTINES[r].key === key) builtin = ROUTINES[r]
    if ((builtin || custom[key]) && result.indexOf(key) === -1) result.push(key)
  }
  if (result.length === 0) for (var d = 0; d < ROUTINES.length; d++) result.push(ROUTINES[d].key)
  return { keys: result, custom: custom }
}

function presentation(kind, cycleIndex, configuration) {
  var breakKind = kindOf(kind)
  var sequence = routineSequence(configuration)
  var value = Number(cycleIndex)
  var index = Number.isInteger(value) && value >= 0 ? value % sequence.keys.length : 0
  var key = sequence.keys[index]
  var custom = sequence.custom[key]
  if (custom) {
    return {
      key: custom.key,
      eyebrow: breakKind === "long" ? "Long intermission" : "Short intermission",
      title: custom.title,
      instruction: custom.instruction
    }
  }
  var routine = ROUTINES[0]
  for (var i = 0; i < ROUTINES.length; i++) if (ROUTINES[i].key === key) routine = ROUTINES[i]
  var copy = routine[breakKind]
  return {
    key: routine.key,
    eyebrow: breakKind === "long" ? "Long intermission" : "Short intermission",
    title: copy.title,
    instruction: copy.instruction
  }
}

function focusScreenName(screenNames, currentName, focusedName, preferFocused) {
  var names = Array.isArray(screenNames) ? screenNames.map(String) : []
  var current = String(currentName || "")
  var focused = String(focusedName || "")
  var currentAvailable = names.indexOf(current) !== -1
  var focusedAvailable = names.indexOf(focused) !== -1

  if (focusedAvailable && (preferFocused === true || !currentAvailable)) return focused
  if (currentAvailable) return current
  if (focusedAvailable) return focused
  return names.length > 0 ? names[0] : ""
}

if (typeof module !== "undefined") {
  module.exports = {
    FALLBACK_SETTINGS: FALLBACK_SETTINGS,
    ROUTINES: ROUTINES,
    routineSequence: routineSequence,
    kindOf: kindOf,
    formatRemaining: formatRemaining,
    totalSeconds: totalSeconds,
    remainingFraction: remainingFraction,
    routineIndex: routineIndex,
    presentation: presentation,
    focusScreenName: focusScreenName
  }
}
