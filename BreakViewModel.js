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

function presentation(kind, cycleIndex) {
  var breakKind = kindOf(kind)
  var routine = ROUTINES[routineIndex(cycleIndex)]
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
    kindOf: kindOf,
    formatRemaining: formatRemaining,
    totalSeconds: totalSeconds,
    remainingFraction: remainingFraction,
    routineIndex: routineIndex,
    presentation: presentation,
    focusScreenName: focusScreenName
  }
}
