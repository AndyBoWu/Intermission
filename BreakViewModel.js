var FALLBACK_SETTINGS = {
  shortBreakSeconds: 20,
  longBreakSeconds: 180
}

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

function presentation(kind) {
  if (kindOf(kind) === "long") {
    return {
      eyebrow: "Long intermission",
      title: "Time to move",
      instruction: "Stand up, stretch gently, and take a sip of water."
    }
  }
  return {
    eyebrow: "Short intermission",
    title: "A moment for your eyes",
    instruction: "Look across the room and let your focus soften."
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
    kindOf: kindOf,
    formatRemaining: formatRemaining,
    totalSeconds: totalSeconds,
    remainingFraction: remainingFraction,
    presentation: presentation,
    focusScreenName: focusScreenName
  }
}
