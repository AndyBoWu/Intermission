var PHASES = ["stopped", "active", "idle", "warning", "deferred", "break", "paused", "outside"]
var BREAK_KINDS = ["short", "long"]

var DEFAULT_SETTINGS = {
  workIntervalSeconds: 1200,
  shortWorkIntervalSeconds: 1200,
  longWorkIntervalSeconds: 1200,
  shortBreakSeconds: 20,
  longBreakSeconds: 180,
  cyclesBeforeLong: 4,
  warningSeconds: 30,
  snoozeSeconds: 300,
  naturalBreakSeconds: 120
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === "number" && isFinite(value)
}

function integerSetting(value, fallback, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback
  return value
}

function normalizeSettings(raw) {
  var value = isObject(raw) ? raw : {}
  var legacyWork = integerSetting(
    value.workIntervalSeconds,
    DEFAULT_SETTINGS.workIntervalSeconds,
    60,
    14400
  )
  return {
    workIntervalSeconds: integerSetting(value.shortWorkIntervalSeconds, legacyWork, 60, 14400),
    shortWorkIntervalSeconds: integerSetting(value.shortWorkIntervalSeconds, legacyWork, 60, 14400),
    longWorkIntervalSeconds: integerSetting(value.longWorkIntervalSeconds, legacyWork, 60, 14400),
    shortBreakSeconds: integerSetting(value.shortBreakSeconds, DEFAULT_SETTINGS.shortBreakSeconds, 10, 900),
    longBreakSeconds: integerSetting(value.longBreakSeconds, DEFAULT_SETTINGS.longBreakSeconds, 30, 3600),
    cyclesBeforeLong: integerSetting(value.cyclesBeforeLong, DEFAULT_SETTINGS.cyclesBeforeLong, 1, 12),
    warningSeconds: integerSetting(value.warningSeconds, DEFAULT_SETTINGS.warningSeconds, 0, 300),
    snoozeSeconds: integerSetting(value.snoozeSeconds, DEFAULT_SETTINGS.snoozeSeconds, 60, 1800),
    naturalBreakSeconds: integerSetting(value.naturalBreakSeconds, DEFAULT_SETTINGS.naturalBreakSeconds, 30, 3600)
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function breakKindForCycle(cycleIndex, settings) {
  return cycleIndex >= settings.cyclesBeforeLong - 1 ? "long" : "short"
}

function breakDurationMs(kind, settings) {
  return (kind === "long" ? settings.longBreakSeconds : settings.shortBreakSeconds) * 1000
}

function workTargetMs(kind, settings) {
  return (kind === "long"
    ? settings.longWorkIntervalSeconds
    : settings.shortWorkIntervalSeconds) * 1000
}

function debtCapMs(settings) {
  return Math.max(settings.shortBreakSeconds, settings.longBreakSeconds) * 1000
}

function boundedDebtMs(value, settings) {
  var numeric = Number.isInteger(value) ? value : 0
  return Math.max(0, Math.min(debtCapMs(settings), numeric))
}

function recordPendingDebt(state, settings) {
  if (state.pendingDebtRecorded === true) return boundedDebtMs(state.breakDebtMs, settings)
  return boundedDebtMs((state.breakDebtMs || 0) + state.breakDurationMs, settings)
}

function createState(now, rawSettings) {
  var settings = normalizeSettings(rawSettings)
  var timestamp = isFiniteNumber(now) && now >= 0 ? Math.floor(now) : 0
  return {
    schemaVersion: 1,
    revision: 0,
    savedAtEpochMs: timestamp,
    phase: "stopped",
    phaseEnteredAtEpochMs: timestamp,
    activeElapsedMs: 0,
    activeStartedAtEpochMs: null,
    workTargetMs: workTargetMs("short", settings),
    breakKind: null,
    cycleIndex: 0,
    warningStartedAtEpochMs: null,
    deferredUntilEpochMs: null,
    breakStartedAtEpochMs: null,
    breakDurationMs: 0,
    resumePhase: null,
    breakDebtMs: 0,
    pendingDebtRecorded: false,
    contextDeferred: false,
    manualHoldUntilEpochMs: null,
    workdayOverrideActive: false,
    endOfDayPromptPending: false,
    lastEndOfDayPromptDateKey: null,
    resetAtNextWorkday: false
  }
}

function success(state, changed, effects) {
  return {
    ok: true,
    changed: changed === true,
    state: state,
    effects: effects || [],
    error: null
  }
}

function failure(state, code, message) {
  return {
    ok: false,
    changed: false,
    state: clone(state),
    effects: [],
    error: { code: code, message: message }
  }
}

function changedState(state, now, phase, patch) {
  var next = clone(state)
  var previousPhase = next.phase
  var values = patch || {}

  for (var key in values) next[key] = values[key]
  next.phase = phase
  next.revision = state.revision + 1
  next.savedAtEpochMs = now
  if (phase !== previousPhase && values.phaseEnteredAtEpochMs === undefined)
    next.phaseEnteredAtEpochMs = now
  return next
}

function activeElapsedMs(state, now) {
  var elapsed = Math.max(0, Number(state.activeElapsedMs) || 0)
  if (state.phase === "active" && isFiniteNumber(state.activeStartedAtEpochMs))
    elapsed += Math.max(0, now - state.activeStartedAtEpochMs)
  return elapsed
}

function publicState(state, now, rawSettings) {
  var settings = normalizeSettings(rawSettings)
  var timestamp = isFiniteNumber(now) ? now : state.savedAtEpochMs
  var remaining = 0

  if (state.phase === "active") {
    remaining = Math.max(0, state.workTargetMs - activeElapsedMs(state, timestamp))
  } else if (state.phase === "idle") {
    remaining = Math.max(0, state.workTargetMs - state.activeElapsedMs)
  } else if (state.phase === "warning") {
    var warningStarted = isFiniteNumber(state.warningStartedAtEpochMs)
      ? state.warningStartedAtEpochMs : timestamp
    remaining = Math.max(0, settings.warningSeconds * 1000 - (timestamp - warningStarted))
  } else if (state.phase === "deferred") {
    remaining = Math.max(0, (state.deferredUntilEpochMs || timestamp) - timestamp)
  } else if (state.phase === "break") {
    remaining = Math.max(0, state.breakStartedAtEpochMs + state.breakDurationMs - timestamp)
  } else if (state.phase === "paused") {
    if (state.resumePhase === "active" || state.resumePhase === "idle")
      remaining = Math.max(0, state.workTargetMs - state.activeElapsedMs)
    else if (state.resumePhase === "warning")
      remaining = Math.max(0, settings.warningSeconds * 1000 - (state.phaseEnteredAtEpochMs - state.warningStartedAtEpochMs))
    else if (state.resumePhase === "deferred")
      remaining = Math.max(0, state.deferredUntilEpochMs - state.phaseEnteredAtEpochMs)
  } else if (state.phase === "outside") {
    if (state.resumePhase === "active" || state.resumePhase === "idle")
      remaining = Math.max(0, state.workTargetMs - state.activeElapsedMs)
  }

  return {
    phase: state.phase,
    breakKind: state.breakKind,
    cycleIndex: state.cycleIndex,
    remainingSeconds: Math.ceil(remaining / 1000),
    paused: state.phase === "paused",
    breakDebtSeconds: Math.ceil(boundedDebtMs(state.breakDebtMs, settings) / 1000),
    contextDeferred: state.contextDeferred === true,
    manualHoldRemainingSeconds: Math.ceil(Math.max(0,
      (state.manualHoldUntilEpochMs || timestamp) - timestamp) / 1000),
    outsideHours: state.phase === "outside",
    outsideResumePhase: state.phase === "outside" ? state.resumePhase : null,
    workdayOverrideActive: state.workdayOverrideActive === true,
    endOfDayPromptPending: state.endOfDayPromptPending === true
  }
}

function freshActive(state, now, settings, cycleIndex, effects, nextDebtMs) {
  var kind = breakKindForCycle(cycleIndex, settings)
  var next = changedState(state, now, "active", {
    activeElapsedMs: 0,
    activeStartedAtEpochMs: now,
    workTargetMs: workTargetMs(kind, settings),
    breakKind: kind,
    cycleIndex: cycleIndex,
    warningStartedAtEpochMs: null,
    deferredUntilEpochMs: null,
    breakStartedAtEpochMs: null,
    breakDurationMs: breakDurationMs(kind, settings),
    resumePhase: null,
    breakDebtMs: boundedDebtMs(
      nextDebtMs === undefined ? state.breakDebtMs : nextDebtMs,
      settings
    ),
    pendingDebtRecorded: false,
    contextDeferred: false,
    workdayOverrideActive: false,
    endOfDayPromptPending: false,
    resetAtNextWorkday: false
  })
  return success(next, true, effects)
}

function freshIdle(state, now, settings, effects, actualDurationMs) {
  var cycleIndex = nextCycle(state, settings)
  var kind = breakKindForCycle(cycleIndex, settings)
  var effect = {
    type: "break-natural",
    atEpochMs: now,
    breakKind: state.breakKind,
    scheduledDurationMs: state.breakDurationMs,
    actualDurationMs: actualDurationMs,
    source: "idle"
  }
  var next = changedState(state, now, "idle", {
    phaseEnteredAtEpochMs: now,
    activeElapsedMs: 0,
    activeStartedAtEpochMs: null,
    workTargetMs: workTargetMs(kind, settings),
    breakKind: kind,
    cycleIndex: cycleIndex,
    warningStartedAtEpochMs: null,
    deferredUntilEpochMs: null,
    breakStartedAtEpochMs: null,
    breakDurationMs: breakDurationMs(kind, settings),
    resumePhase: null,
    breakDebtMs: boundedDebtMs((state.breakDebtMs || 0) - actualDurationMs, settings),
    pendingDebtRecorded: false,
    contextDeferred: false,
    workdayOverrideActive: false,
    endOfDayPromptPending: false,
    resetAtNextWorkday: false
  })
  var allEffects = effects ? effects.slice() : []
  allEffects.push(effect)
  return success(next, true, allEffects)
}

function nextCycle(state, settings) {
  if (state.breakKind === "long") return 0
  return state.cycleIndex + 1
}

function finishBreakCycle(state, now, settings, type, details) {
  var effect = {
    type: type,
    atEpochMs: now,
    breakKind: state.breakKind,
    scheduledDurationMs: state.breakDurationMs
  }
  var values = details || {}
  for (var key in values) effect[key] = values[key]
  var nextDebt = boundedDebtMs(state.breakDebtMs, settings)
  if (type === "break-completed" || type === "break-natural") {
    var credit = Number.isInteger(values.actualDurationMs)
      ? values.actualDurationMs : state.breakDurationMs
    nextDebt = boundedDebtMs(nextDebt - Math.max(0, credit), settings)
  } else if (type === "break-skipped" || type === "break-emergency-exit") {
    nextDebt = recordPendingDebt(state, settings)
  }
  effect.breakDebtMs = nextDebt
  return freshActive(state, now, settings, nextCycle(state, settings), [effect], nextDebt)
}

function beginBreak(state, now, settings, requestedKind) {
  var kind = requestedKind || state.breakKind
  if (BREAK_KINDS.indexOf(kind) === -1)
    return failure(state, "INVALID_ARGUMENT", "Break kind must be short or long")

  if (["active", "warning", "deferred", "outside"].indexOf(state.phase) === -1)
    return failure(state, "INVALID_STATE", "A break cannot start from " + state.phase)

  var elapsed = state.phase === "active" ? activeElapsedMs(state, now) : state.activeElapsedMs
  var duration = breakDurationMs(kind, settings)
  var next = changedState(state, now, "break", {
    activeElapsedMs: Math.min(elapsed, state.workTargetMs),
    activeStartedAtEpochMs: null,
    breakKind: kind,
    warningStartedAtEpochMs: null,
    deferredUntilEpochMs: null,
    breakStartedAtEpochMs: now,
    breakDurationMs: duration,
    resumePhase: null,
    contextDeferred: false,
    endOfDayPromptPending: false,
    resetAtNextWorkday: false
  })
  return success(next, true, [{
    type: "break-started",
    atEpochMs: now,
    breakKind: kind,
    scheduledDurationMs: duration
  }])
}

function deferForContext(state, now, settings) {
  var nextDebt = recordPendingDebt(state, settings)
  var next = changedState(state, now, "warning", {
    activeElapsedMs: Math.min(activeElapsedMs(state, now), state.workTargetMs),
    activeStartedAtEpochMs: null,
    warningStartedAtEpochMs: state.warningStartedAtEpochMs || now,
    deferredUntilEpochMs: null,
    contextDeferred: true,
    pendingDebtRecorded: true,
    breakDebtMs: nextDebt
  })
  return success(next, true, [{
    type: "break-context-deferred",
    atEpochMs: now,
    breakKind: state.breakKind,
    breakDebtMs: nextDebt
  }])
}

function resumeAfterContext(state, now, settings) {
  var warningMs = settings.warningSeconds * 1000
  var recoveryMs = Math.min(warningMs, 10000)
  if (recoveryMs === 0) return beginBreak(state, now, settings)
  var next = changedState(state, now, "warning", {
    warningStartedAtEpochMs: now - (warningMs - recoveryMs),
    contextDeferred: false
  })
  return success(next, true, [{
    type: "break-context-available",
    atEpochMs: now,
    breakKind: state.breakKind,
    warningSeconds: recoveryMs / 1000
  }])
}

function closeWorkday(state, now, event) {
  if (state.phase === "outside") return success(state, false)
  if (["active", "idle", "warning", "deferred"].indexOf(state.phase) === -1)
    return success(state, false)
  var dateKey = typeof event.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey)
    ? event.dateKey : null
  var shouldPrompt = event.prompt === true && dateKey !== null &&
    state.lastEndOfDayPromptDateKey !== dateKey
  var elapsed = state.phase === "active" ? activeElapsedMs(state, now) : state.activeElapsedMs
  var next = changedState(state, now, "outside", {
    activeElapsedMs: elapsed,
    activeStartedAtEpochMs: null,
    resumePhase: state.phase,
    workdayOverrideActive: false,
    endOfDayPromptPending: shouldPrompt,
    lastEndOfDayPromptDateKey: shouldPrompt ? dateKey : state.lastEndOfDayPromptDateKey,
    resetAtNextWorkday: false
  })
  var effects = [{ type: "workday-closed", atEpochMs: now, resumePhase: state.phase }]
  if (shouldPrompt) effects.push({ type: "end-of-day-prompt", atEpochMs: now, dateKey: dateKey })
  return success(next, true, effects)
}

function openWorkday(state, now, settings, idle, override) {
  if (state.phase !== "outside") return success(state, false)
  if (state.resetAtNextWorkday === true) {
    var resetKind = breakKindForCycle(state.cycleIndex, settings)
    var resetPhase = idle === true ? "idle" : "active"
    var reset = changedState(state, now, resetPhase, {
      activeElapsedMs: 0,
      activeStartedAtEpochMs: resetPhase === "active" ? now : null,
      workTargetMs: workTargetMs(resetKind, settings),
      breakKind: resetKind,
      warningStartedAtEpochMs: null,
      deferredUntilEpochMs: null,
      breakStartedAtEpochMs: null,
      breakDurationMs: breakDurationMs(resetKind, settings),
      resumePhase: null,
      pendingDebtRecorded: false,
      contextDeferred: false,
      workdayOverrideActive: override === true,
      endOfDayPromptPending: false,
      resetAtNextWorkday: false
    })
    return success(reset, true, [{
      type: "workday-opened",
      atEpochMs: now,
      reset: true
    }])
  }

  var resume = state.resumePhase || "active"
  if (idle === true && (resume === "warning" || resume === "deferred")) {
    if (state.endOfDayPromptPending !== true) return success(state, false)
    return success(changedState(state, now, "outside", {
      endOfDayPromptPending: false
    }), true, [{ type: "workday-waiting-for-activity", atEpochMs: now }])
  }
  var nextPhase = resume === "active" || resume === "idle"
    ? (idle === true ? "idle" : "active") : resume
  var patch = {
    resumePhase: null,
    workdayOverrideActive: override === true,
    endOfDayPromptPending: false,
    resetAtNextWorkday: false
  }
  if (nextPhase === "active") patch.activeStartedAtEpochMs = now
  else patch.activeStartedAtEpochMs = null

  if (resume === "warning" || resume === "deferred") {
    var warningMs = settings.warningSeconds * 1000
    var recoveryMs = Math.min(warningMs, 10000)
    patch.warningStartedAtEpochMs = now - (warningMs - recoveryMs)
    patch.deferredUntilEpochMs = null
    patch.contextDeferred = false
    if (recoveryMs === 0) {
      var immediate = beginBreak(state, now, settings)
      immediate.state.workdayOverrideActive = override === true
      return immediate
    } else {
      nextPhase = "warning"
    }
  }

  var next = changedState(state, now, nextPhase, patch)
  return success(next, true, [{
    type: "workday-opened",
    atEpochMs: now,
    resumePhase: resume,
    override: override === true
  }])
}

function validateEventTime(state, now) {
  if (!Number.isInteger(now) || now < 0) return "Event time must be a non-negative integer"
  if (now < state.savedAtEpochMs) return "Event time is older than the current state"
  return ""
}

function transition(inputState, event, now, rawSettings) {
  var settings = normalizeSettings(rawSettings)
  var state = clone(inputState)
  var type = isObject(event) ? String(event.type || "") : ""
  var timeError = validateEventTime(state, now)
  if (timeError) return failure(state, "STALE_EVENT", timeError)

  if (type === "start") {
    if (state.phase === "active" || state.phase === "idle") return success(state, false)
    if (state.phase !== "stopped") return failure(state, "INVALID_STATE", "Start requires a stopped state")
    return freshActive(state, now, settings, 0)
  }

  if (type === "stop") {
    if (state.phase === "stopped") return success(state, false)
    var stopped = createState(now, settings)
    stopped.revision = state.revision + 1
    return success(stopped, true)
  }

  if (type === "pause") {
    if (state.phase === "paused") return success(state, false)
    if (["active", "idle", "warning", "deferred"].indexOf(state.phase) === -1)
      return failure(state, "INVALID_STATE", "Pause is unavailable during " + state.phase)
    var pauseElapsed = state.phase === "active" ? activeElapsedMs(state, now) : state.activeElapsedMs
    var paused = changedState(state, now, "paused", {
      activeElapsedMs: pauseElapsed,
      activeStartedAtEpochMs: null,
      resumePhase: state.phase
    })
    return success(paused, true)
  }

  if (type === "resume") {
    if (state.phase !== "paused") return failure(state, "INVALID_STATE", "Resume requires a paused state")
    var resumePhase = state.resumePhase || "active"
    var pausedFor = Math.max(0, now - state.phaseEnteredAtEpochMs)
    var resumePatch = { resumePhase: null }

    if (resumePhase === "active") {
      resumePatch.activeStartedAtEpochMs = now
    } else if (resumePhase === "idle") {
      resumePatch.activeStartedAtEpochMs = null
    } else if (resumePhase === "warning") {
      resumePatch.warningStartedAtEpochMs = (state.warningStartedAtEpochMs || state.phaseEnteredAtEpochMs) + pausedFor
    } else if (resumePhase === "deferred") {
      resumePatch.deferredUntilEpochMs = state.deferredUntilEpochMs + pausedFor
    } else {
      return failure(state, "INVALID_STATE", "Paused state has no resumable phase")
    }

    return success(changedState(state, now, resumePhase, resumePatch), true)
  }

  if (type === "holdContext") {
    if (state.phase === "stopped" || state.phase === "break")
      return failure(state, "INVALID_STATE", "Reminder hold is unavailable during " + state.phase)
    var holdSeconds = event.seconds === undefined ? 1800 : event.seconds
    if (!Number.isInteger(holdSeconds) || holdSeconds < 300 || holdSeconds > 7200)
      return failure(state, "INVALID_ARGUMENT", "Reminder hold must be from 300 to 7200 seconds")
    return success(changedState(state, now, state.phase, {
      manualHoldUntilEpochMs: now + holdSeconds * 1000
    }), true, [{ type: "context-hold-started", atEpochMs: now, seconds: holdSeconds }])
  }

  if (type === "clearContextHold") {
    if (state.manualHoldUntilEpochMs === null) return success(state, false)
    return success(changedState(state, now, state.phase, {
      manualHoldUntilEpochMs: null
    }), true, [{ type: "context-hold-cleared", atEpochMs: now }])
  }

  if (type === "closeWorkday") return closeWorkday(state, now, event)

  if (type === "openWorkday")
    return openWorkday(state, now, settings, event.idle === true, false)

  if (type === "continueWorkday")
    return openWorkday(state, now, settings, event.idle === true, true)

  if (type === "dismissEndOfDay") {
    if (state.phase !== "outside" || state.endOfDayPromptPending !== true)
      return success(state, false)
    return success(changedState(state, now, "outside", {
      endOfDayPromptPending: false
    }), true, [{ type: "end-of-day-dismissed", atEpochMs: now }])
  }

  if (type === "stopForDay") {
    if (state.phase !== "outside")
      return failure(state, "INVALID_STATE", "Stop for today requires outside-hours state")
    return success(changedState(state, now, "outside", {
      activeElapsedMs: 0,
      activeStartedAtEpochMs: null,
      warningStartedAtEpochMs: null,
      deferredUntilEpochMs: null,
      breakStartedAtEpochMs: null,
      resumePhase: "active",
      pendingDebtRecorded: false,
      contextDeferred: false,
      workdayOverrideActive: false,
      endOfDayPromptPending: false,
      resetAtNextWorkday: true
    }), true, [{ type: "workday-stopped", atEpochMs: now }])
  }

  if (type === "enterIdle") {
    if (state.phase === "idle") return success(state, false)
    if (state.phase !== "active") return failure(state, "INVALID_STATE", "Idle entry requires active work")
    var idleStartedAt = event.startedAtEpochMs === undefined ? now : event.startedAtEpochMs
    if (!Number.isInteger(idleStartedAt) || idleStartedAt < state.activeStartedAtEpochMs || idleStartedAt > now)
      return failure(state, "INVALID_ARGUMENT", "Idle start must fall inside the active segment")
    return success(changedState(state, now, "idle", {
      phaseEnteredAtEpochMs: idleStartedAt,
      activeElapsedMs: activeElapsedMs(state, idleStartedAt),
      activeStartedAtEpochMs: null,
      resumePhase: null
    }), true)
  }

  if (type === "returnActive") {
    if (state.phase === "active") return success(state, false)
    if (state.phase !== "idle") return failure(state, "INVALID_STATE", "Activity return requires idle state")
    return success(changedState(state, now, "active", { activeStartedAtEpochMs: now }), true)
  }

  if (type === "snooze") {
    if (state.phase !== "warning") return failure(state, "INVALID_STATE", "Snooze requires a warning")
    var seconds = event.seconds === undefined ? settings.snoozeSeconds : event.seconds
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 1800)
      return failure(state, "INVALID_ARGUMENT", "Snooze seconds must be an integer from 60 to 1800")
    var snoozeDebt = recordPendingDebt(state, settings)
    return success(changedState(state, now, "deferred", {
      warningStartedAtEpochMs: null,
      deferredUntilEpochMs: now + seconds * 1000,
      breakDebtMs: snoozeDebt,
      pendingDebtRecorded: true,
      contextDeferred: false
    }), true, [{
      type: "break-deferred",
      atEpochMs: now,
      breakKind: state.breakKind,
      seconds: seconds,
      breakDebtMs: snoozeDebt
    }])
  }

  if (type === "skip") {
    if (state.phase !== "warning" && state.phase !== "deferred")
      return failure(state, "INVALID_STATE", "Skip requires a warning or deferred break")
    return finishBreakCycle(state, now, settings, "break-skipped", {
      source: "user",
      reason: event.reason || "user"
    })
  }

  if (type === "startBreak") {
    if (state.phase === "break") return success(state, false)
    return beginBreak(state, now, settings, event.kind)
  }

  if (type === "completeBreak") {
    if (state.phase !== "break") return failure(state, "INVALID_STATE", "No break is active")
    return finishBreakCycle(state, now, settings, "break-completed", {
      source: event.source || "timer",
      actualDurationMs: Math.max(0, now - state.breakStartedAtEpochMs)
    })
  }

  if (type === "emergencyExit") {
    if (state.phase !== "break") return failure(state, "INVALID_STATE", "No break is active")
    return finishBreakCycle(state, now, settings, "break-emergency-exit", {
      source: "overlay",
      reason: "escape-hold",
      actualDurationMs: Math.max(0, now - state.breakStartedAtEpochMs)
    })
  }

  if (type === "naturalBreak") {
    var naturalFromIdle = state.phase === "idle"
    var naturalFromIdlePause = state.phase === "paused" &&
      (state.resumePhase === "warning" || state.resumePhase === "deferred") && event.idle === true
    if (!naturalFromIdle && !naturalFromIdlePause)
      return failure(state, "INVALID_STATE", "A natural break requires observed idle time")
    var naturalDuration = event.durationMs === undefined
      ? Math.max(0, now - state.phaseEnteredAtEpochMs) : event.durationMs
    if (!Number.isInteger(naturalDuration) || naturalDuration < settings.naturalBreakSeconds * 1000)
      return failure(state, "INVALID_ARGUMENT", "Natural break duration is below the configured threshold")
    return freshIdle(state, now, settings, [], naturalDuration)
  }

  if (type === "tick") {
    if (state.phase === "outside") return success(state, false)
    if (state.phase === "active") {
      var elapsed = activeElapsedMs(state, now)
      if (elapsed >= state.workTargetMs) {
        if (event.busyContext === true) return deferForContext(state, now, settings)
        return beginBreak(state, now, settings)
      }

      var warningMs = Math.min(settings.warningSeconds * 1000, state.workTargetMs)
      var warningAt = state.workTargetMs - warningMs
      if (warningMs > 0 && elapsed >= warningAt) {
        var warningStartedAt = now - (elapsed - warningAt)
        return success(changedState(state, now, "warning", {
          activeElapsedMs: elapsed,
          activeStartedAtEpochMs: null,
          warningStartedAtEpochMs: warningStartedAt
        }), true)
      }
      return success(state, false)
    }

    if (state.phase === "warning") {
      if (state.contextDeferred === true) {
        if (event.busyContext === true) return success(state, false)
        return resumeAfterContext(state, now, settings)
      }
      if (now - state.warningStartedAtEpochMs >= settings.warningSeconds * 1000) {
        if (event.busyContext === true) return deferForContext(state, now, settings)
        return beginBreak(state, now, settings)
      }
      return success(state, false)
    }

    if (state.phase === "deferred") {
      if (now >= state.deferredUntilEpochMs) {
        return success(changedState(state, now, "warning", {
          deferredUntilEpochMs: null,
          warningStartedAtEpochMs: now
        }), true)
      }
      return success(state, false)
    }

    if (state.phase === "break") {
      if (now >= state.breakStartedAtEpochMs + state.breakDurationMs)
        return finishBreakCycle(state, now, settings, "break-completed", {
          source: "timer",
          actualDurationMs: state.breakDurationMs
        })
      return success(state, false)
    }

    if (state.phase === "idle") {
      var idleDuration = Math.max(0, now - state.phaseEnteredAtEpochMs)
      if (state.activeElapsedMs > 0 && idleDuration >= settings.naturalBreakSeconds * 1000)
        return freshIdle(state, now, settings, [], idleDuration)
      return success(state, false)
    }

    return success(state, false)
  }

  return failure(state, "INVALID_ARGUMENT", "Unknown event type: " + type)
}

function snapshotState(inputState, now) {
  if (!isObject(inputState)) return null
  var state = clone(inputState)
  var savedAt = Number.isInteger(state.savedAtEpochMs) && state.savedAtEpochMs >= 0
    ? state.savedAtEpochMs : 0
  var timestamp = Number.isInteger(now) && now >= savedAt ? now : savedAt

  if (state.phase === "active" && Number.isInteger(state.activeStartedAtEpochMs)) {
    state.activeElapsedMs = activeElapsedMs(state, timestamp)
    state.activeStartedAtEpochMs = timestamp
  }
  state.savedAtEpochMs = timestamp
  return state
}

function stateWithAdditiveDefaults(inputState) {
  var state = clone(inputState)
  if (state.breakDebtMs === undefined) state.breakDebtMs = 0
  if (state.pendingDebtRecorded === undefined) state.pendingDebtRecorded = false
  if (state.contextDeferred === undefined) state.contextDeferred = false
  if (state.manualHoldUntilEpochMs === undefined) state.manualHoldUntilEpochMs = null
  if (state.workdayOverrideActive === undefined) state.workdayOverrideActive = false
  if (state.endOfDayPromptPending === undefined) state.endOfDayPromptPending = false
  if (state.lastEndOfDayPromptDateKey === undefined) state.lastEndOfDayPromptDateKey = null
  if (state.resetAtNextWorkday === undefined) state.resetAtNextWorkday = false
  return state
}

function validSnapshot(snapshot) {
  if (!isObject(snapshot) || snapshot.schemaVersion !== 1) return false
  if (PHASES.indexOf(snapshot.phase) === -1) return false
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) return false
  if (!Number.isInteger(snapshot.savedAtEpochMs) || snapshot.savedAtEpochMs < 0) return false
  if (!Number.isInteger(snapshot.phaseEnteredAtEpochMs) || snapshot.phaseEnteredAtEpochMs < 0 ||
      snapshot.phaseEnteredAtEpochMs > snapshot.savedAtEpochMs) return false
  if (!Number.isInteger(snapshot.activeElapsedMs) || snapshot.activeElapsedMs < 0) return false
  if (!Number.isInteger(snapshot.workTargetMs) || snapshot.workTargetMs <= 0) return false
  if (snapshot.breakKind !== null && BREAK_KINDS.indexOf(snapshot.breakKind) === -1) return false
  if (!Number.isInteger(snapshot.cycleIndex) || snapshot.cycleIndex < 0) return false
  if (!Number.isInteger(snapshot.breakDurationMs) || snapshot.breakDurationMs < 0) return false
  if (!Number.isInteger(snapshot.breakDebtMs) || snapshot.breakDebtMs < 0 ||
      snapshot.breakDebtMs > 3600000) return false
  if (typeof snapshot.pendingDebtRecorded !== "boolean") return false
  if (typeof snapshot.contextDeferred !== "boolean") return false
  if (snapshot.contextDeferred && !snapshot.pendingDebtRecorded) return false
  if (snapshot.manualHoldUntilEpochMs !== null &&
      (!Number.isInteger(snapshot.manualHoldUntilEpochMs) || snapshot.manualHoldUntilEpochMs < 0)) return false
  if (typeof snapshot.workdayOverrideActive !== "boolean") return false
  if (typeof snapshot.endOfDayPromptPending !== "boolean") return false
  if (snapshot.lastEndOfDayPromptDateKey !== null &&
      (typeof snapshot.lastEndOfDayPromptDateKey !== "string" ||
       !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.lastEndOfDayPromptDateKey))) return false
  if (typeof snapshot.resetAtNextWorkday !== "boolean") return false
  if (snapshot.endOfDayPromptPending && snapshot.phase !== "outside") return false
  if (snapshot.resetAtNextWorkday && snapshot.phase !== "outside") return false
  if (snapshot.workdayOverrideActive && snapshot.phase === "outside") return false
  if (snapshot.activeStartedAtEpochMs !== null &&
      (!Number.isInteger(snapshot.activeStartedAtEpochMs) || snapshot.activeStartedAtEpochMs < 0 ||
       snapshot.activeStartedAtEpochMs > snapshot.savedAtEpochMs)) return false
  if (snapshot.warningStartedAtEpochMs !== null &&
      (!Number.isInteger(snapshot.warningStartedAtEpochMs) || snapshot.warningStartedAtEpochMs < 0 ||
       snapshot.warningStartedAtEpochMs > snapshot.savedAtEpochMs)) return false
  if (snapshot.deferredUntilEpochMs !== null &&
      (!Number.isInteger(snapshot.deferredUntilEpochMs) || snapshot.deferredUntilEpochMs < 0)) return false
  if (snapshot.breakStartedAtEpochMs !== null &&
      (!Number.isInteger(snapshot.breakStartedAtEpochMs) || snapshot.breakStartedAtEpochMs < 0 ||
       snapshot.breakStartedAtEpochMs > snapshot.savedAtEpochMs)) return false
  if (snapshot.resumePhase !== null && typeof snapshot.resumePhase !== "string") return false

  if (snapshot.phase === "stopped") {
    return snapshot.breakKind === null && snapshot.activeElapsedMs === 0 && snapshot.cycleIndex === 0 &&
      snapshot.activeStartedAtEpochMs === null &&
      snapshot.warningStartedAtEpochMs === null && snapshot.deferredUntilEpochMs === null &&
      snapshot.breakStartedAtEpochMs === null && snapshot.breakDurationMs === 0 &&
      snapshot.resumePhase === null && snapshot.breakDebtMs === 0 &&
      snapshot.pendingDebtRecorded === false && snapshot.contextDeferred === false &&
      snapshot.manualHoldUntilEpochMs === null && snapshot.workdayOverrideActive === false &&
      snapshot.endOfDayPromptPending === false && snapshot.lastEndOfDayPromptDateKey === null &&
      snapshot.resetAtNextWorkday === false
  }

  if (BREAK_KINDS.indexOf(snapshot.breakKind) === -1 || snapshot.breakDurationMs <= 0) return false
  if (snapshot.phase === "active")
    return Number.isInteger(snapshot.activeStartedAtEpochMs) &&
      snapshot.warningStartedAtEpochMs === null && snapshot.deferredUntilEpochMs === null &&
      snapshot.breakStartedAtEpochMs === null && snapshot.resumePhase === null &&
      snapshot.contextDeferred === false
  if (snapshot.phase === "idle")
    return snapshot.activeStartedAtEpochMs === null && snapshot.warningStartedAtEpochMs === null &&
      snapshot.deferredUntilEpochMs === null && snapshot.breakStartedAtEpochMs === null &&
      snapshot.resumePhase === null && snapshot.contextDeferred === false
  if (snapshot.phase === "warning")
    return snapshot.activeStartedAtEpochMs === null &&
      Number.isInteger(snapshot.warningStartedAtEpochMs) && snapshot.deferredUntilEpochMs === null &&
      snapshot.breakStartedAtEpochMs === null && snapshot.resumePhase === null
  if (snapshot.phase === "deferred")
    return snapshot.activeStartedAtEpochMs === null && snapshot.warningStartedAtEpochMs === null &&
      Number.isInteger(snapshot.deferredUntilEpochMs) && snapshot.breakStartedAtEpochMs === null &&
      snapshot.resumePhase === null && snapshot.contextDeferred === false
  if (snapshot.phase === "break")
    return snapshot.activeStartedAtEpochMs === null && snapshot.warningStartedAtEpochMs === null &&
      snapshot.deferredUntilEpochMs === null && Number.isInteger(snapshot.breakStartedAtEpochMs) &&
      snapshot.resumePhase === null && snapshot.contextDeferred === false
  if (snapshot.phase === "paused")
    return snapshot.activeStartedAtEpochMs === null && snapshot.breakStartedAtEpochMs === null &&
      ["active", "idle", "warning", "deferred"].indexOf(snapshot.resumePhase) !== -1 &&
      (snapshot.resumePhase === "warning" ? Number.isInteger(snapshot.warningStartedAtEpochMs) :
        snapshot.warningStartedAtEpochMs === null) &&
      (snapshot.resumePhase === "deferred" ? Number.isInteger(snapshot.deferredUntilEpochMs) :
        snapshot.deferredUntilEpochMs === null)
  if (snapshot.phase === "outside")
    return snapshot.activeStartedAtEpochMs === null && snapshot.breakStartedAtEpochMs === null &&
      ["active", "idle", "warning", "deferred"].indexOf(snapshot.resumePhase) !== -1 &&
      (snapshot.resumePhase === "warning" ? Number.isInteger(snapshot.warningStartedAtEpochMs) :
        snapshot.warningStartedAtEpochMs === null) &&
      (snapshot.resumePhase === "deferred" ? Number.isInteger(snapshot.deferredUntilEpochMs) :
        snapshot.deferredUntilEpochMs === null) &&
      (snapshot.contextDeferred === false || snapshot.resumePhase === "warning")
  return false
}

function recoveryFailure(now, settings, code, message) {
  return {
    ok: false,
    changed: true,
    state: createState(now, settings),
    effects: [],
    error: { code: code, message: message }
  }
}

function restoreState(snapshot, now, rawSettings) {
  var settings = normalizeSettings(rawSettings)
  if (!Number.isInteger(now) || now < 0)
    return recoveryFailure(0, settings, "INVALID_SNAPSHOT", "Restore time is invalid")
  var normalizedSnapshot = isObject(snapshot) ? stateWithAdditiveDefaults(snapshot) : snapshot
  if (!validSnapshot(normalizedSnapshot))
    return recoveryFailure(now, settings, "INVALID_SNAPSHOT", "Snapshot shape is invalid")
  if (normalizedSnapshot.savedAtEpochMs > now + 300000)
    return recoveryFailure(now, settings, "FUTURE_SNAPSHOT", "Snapshot is from the future")
  if (normalizedSnapshot.phase !== "outside" &&
      now - normalizedSnapshot.savedAtEpochMs > 43200000)
    return recoveryFailure(now, settings, "STALE_SNAPSHOT", "Snapshot is older than 12 hours")

  var state = clone(normalizedSnapshot)
  var downtime = Math.max(0, now - state.savedAtEpochMs)

  if (state.phase === "paused" || state.phase === "stopped" || state.phase === "outside")
    return success(state, false)

  if (state.phase === "break") {
    if (!isFiniteNumber(state.breakStartedAtEpochMs))
      return recoveryFailure(now, settings, "INVALID_SNAPSHOT", "Break start is invalid")
    if (now >= state.breakStartedAtEpochMs + state.breakDurationMs)
      return finishBreakCycle(state, now, settings, "break-completed", {
        source: "recovery",
        actualDurationMs: state.breakDurationMs
      })
    return success(state, false, [{ type: "restore-overlay", atEpochMs: now, breakKind: state.breakKind }])
  }

  if (state.phase === "warning") {
    if (state.contextDeferred === true) return success(state, false)
    var warningStart = state.warningStartedAtEpochMs
    if (!isFiniteNumber(warningStart) || now - warningStart >= settings.warningSeconds * 1000) {
      return success(changedState(state, now, "warning", { warningStartedAtEpochMs: now }), true)
    }
    return success(state, false)
  }

  if (state.phase === "deferred") {
    if (!isFiniteNumber(state.deferredUntilEpochMs) || now >= state.deferredUntilEpochMs) {
      return success(changedState(state, now, "warning", {
        deferredUntilEpochMs: null,
        warningStartedAtEpochMs: now
      }), true)
    }
    return success(state, false)
  }

  if (state.phase === "active" || state.phase === "idle") {
    if (downtime >= settings.naturalBreakSeconds * 1000 && state.phase === "active")
      return finishBreakCycle(state, now, settings, "break-natural", {
        source: "recovery",
        actualDurationMs: downtime
      })

    if (downtime >= settings.naturalBreakSeconds * 1000 && state.phase === "idle" &&
        state.activeElapsedMs > 0)
      return freshIdle(state, now, settings, [], downtime)

    var restoredPhase = state.phase
    var elapsed = state.activeElapsedMs
    if (restoredPhase === "active" && isFiniteNumber(state.activeStartedAtEpochMs))
      elapsed += Math.max(0, state.savedAtEpochMs - state.activeStartedAtEpochMs)
    return success(changedState(state, now, restoredPhase, {
      activeElapsedMs: elapsed,
      activeStartedAtEpochMs: restoredPhase === "active" ? now : null
    }), true)
  }

  return recoveryFailure(now, settings, "INVALID_SNAPSHOT", "Snapshot phase cannot be restored")
}

function createActivityContext(now) {
  var timestamp = Number.isInteger(now) && now >= 0 ? now : 0
  return {
    isIdle: false,
    idleSinceEpochMs: null,
    pausedForIdle: false,
    lastObservedAtEpochMs: timestamp
  }
}

function activitySuccess(state, context, changed, effects) {
  return {
    ok: true,
    changed: changed === true,
    state: state,
    context: context,
    effects: effects || [],
    error: null
  }
}

function shiftTimestamp(value, delta) {
  return value === null ? null : value + delta
}

function rebaseClock(state, context, now) {
  var previous = context.lastObservedAtEpochMs
  var delta = now - previous
  var nextState = clone(state)
  var nextContext = clone(context)

  nextState.phaseEnteredAtEpochMs = shiftTimestamp(nextState.phaseEnteredAtEpochMs, delta)
  nextState.activeStartedAtEpochMs = shiftTimestamp(nextState.activeStartedAtEpochMs, delta)
  nextState.warningStartedAtEpochMs = shiftTimestamp(nextState.warningStartedAtEpochMs, delta)
  nextState.deferredUntilEpochMs = shiftTimestamp(nextState.deferredUntilEpochMs, delta)
  nextState.breakStartedAtEpochMs = shiftTimestamp(nextState.breakStartedAtEpochMs, delta)
  nextState.manualHoldUntilEpochMs = shiftTimestamp(nextState.manualHoldUntilEpochMs, delta)
  nextState.savedAtEpochMs = now
  nextState.revision = state.revision + 1

  nextContext.idleSinceEpochMs = shiftTimestamp(nextContext.idleSinceEpochMs, delta)
  nextContext.lastObservedAtEpochMs = now
  return activitySuccess(nextState, nextContext, true, [{
    type: "clock-rebased",
    atEpochMs: now,
    deltaMs: delta
  }])
}

function prepareActivityObservation(state, context, now) {
  if (!Number.isInteger(now) || now < 0) {
    return {
      ok: false,
      changed: false,
      state: clone(state),
      context: clone(context),
      effects: [],
      error: { code: "INVALID_ARGUMENT", message: "Observation time must be a non-negative integer" }
    }
  }

  if (now < context.lastObservedAtEpochMs) return rebaseClock(state, context, now)
  return activitySuccess(clone(state), clone(context), false)
}

function appendTransition(result, transitionResult) {
  if (!transitionResult.ok) {
    result.ok = false
    result.error = transitionResult.error
    return result
  }
  result.state = transitionResult.state
  result.changed = result.changed || transitionResult.changed
  result.effects = result.effects.concat(transitionResult.effects)
  return result
}

function satisfyNaturalBreak(result, now, settings) {
  var idleSince = result.context.idleSinceEpochMs
  if (!Number.isInteger(idleSince)) return result
  var duration = Math.max(0, now - idleSince)
  if (duration < settings.naturalBreakSeconds * 1000) return result

  if (result.state.phase === "idle" && result.state.activeElapsedMs > 0) {
    return appendTransition(result, transition(result.state, {
      type: "naturalBreak",
      durationMs: duration,
      idle: true
    }, now, settings))
  }

  if (result.context.pausedForIdle && result.state.phase === "paused") {
    var natural = transition(result.state, {
      type: "naturalBreak",
      durationMs: duration,
      idle: true
    }, now, settings)
    appendTransition(result, natural)
    if (natural.ok) result.context.pausedForIdle = false
  }
  return result
}

function beginObservedIdle(result, now, idleSince, settings) {
  if (result.state.phase === "active")
    idleSince = Math.max(result.state.activeStartedAtEpochMs, idleSince)
  result.context.isIdle = true
  result.context.idleSinceEpochMs = idleSince

  if (result.state.phase === "active") {
    appendTransition(result, transition(result.state, {
      type: "enterIdle",
      startedAtEpochMs: Math.max(result.state.activeStartedAtEpochMs, idleSince)
    }, now, settings))
  } else if (result.state.phase === "warning" || result.state.phase === "deferred") {
    var pauseAt = Math.max(result.state.savedAtEpochMs, idleSince)
    appendTransition(result, transition(result.state, { type: "pause" }, pauseAt, settings))
    if (result.ok) result.context.pausedForIdle = true
  }

  return satisfyNaturalBreak(result, now, settings)
}

function endObservedIdle(result, now, settings) {
  satisfyNaturalBreak(result, now, settings)
  result.context.isIdle = false
  result.context.idleSinceEpochMs = null

  if (result.state.phase === "idle") {
    appendTransition(result, transition(result.state, { type: "returnActive" }, now, settings))
  } else if (result.context.pausedForIdle && result.state.phase === "paused") {
    appendTransition(result, transition(result.state, { type: "resume" }, now, settings))
  }
  result.context.pausedForIdle = false
  return result
}

function activitySignal(inputState, inputContext, isIdle, now, monitorTimeoutMs, rawSettings) {
  var settings = normalizeSettings(rawSettings)
  var prepared = prepareActivityObservation(inputState, inputContext, now)
  if (!prepared.ok) return prepared

  var timeout = Number.isInteger(monitorTimeoutMs) && monitorTimeoutMs >= 0 ? monitorTimeoutMs : 0
  var requestedIdle = isIdle === true
  if (requestedIdle === prepared.context.isIdle) {
    if (requestedIdle) satisfyNaturalBreak(prepared, now, settings)
    prepared.context.lastObservedAtEpochMs = now
    return prepared
  }

  if (requestedIdle) {
    var idleSince = Math.max(0, now - timeout)
    beginObservedIdle(prepared, now, idleSince, settings)
  } else {
    endObservedIdle(prepared, now, settings)
  }
  prepared.context.lastObservedAtEpochMs = now
  return prepared
}

function heartbeat(inputState, inputContext, now, rawSettings, rawOptions) {
  var settings = normalizeSettings(rawSettings)
  var options = isObject(rawOptions) ? rawOptions : {}
  var expectedIntervalMs = integerSetting(options.expectedIntervalMs, 1000, 100, 60000)
  var suspensionThresholdMs = integerSetting(options.suspensionThresholdMs, 5000,
    expectedIntervalMs + 1, 300000)
  var tickEvent = { type: "tick", busyContext: options.busyContext === true }
  var remindersAllowed = options.remindersAllowed !== false
  var closeEvent = {
    type: "closeWorkday",
    prompt: options.endOfDayPrompt === true,
    dateKey: options.localDateKey
  }
  var previousObserved = inputContext.lastObservedAtEpochMs
  var prepared = prepareActivityObservation(inputState, inputContext, now)
  if (!prepared.ok) return prepared

  if (now < previousObserved) return prepared

  if (!remindersAllowed && prepared.state.workdayOverrideActive !== true &&
      ["active", "idle", "warning", "deferred"].indexOf(prepared.state.phase) !== -1) {
    appendTransition(prepared, transition(prepared.state, closeEvent, now, settings))
    prepared.context.lastObservedAtEpochMs = now
    return prepared
  }

  if (remindersAllowed && prepared.state.phase === "outside") {
    appendTransition(prepared, transition(prepared.state, {
      type: "openWorkday",
      idle: prepared.context.isIdle === true
    }, now, settings))
    prepared.context.lastObservedAtEpochMs = now
    return prepared
  }

  var gap = now - previousObserved
  if (!prepared.context.isIdle && gap >= suspensionThresholdMs) {
    var idleSince = Math.min(now, previousObserved + expectedIntervalMs)
    beginObservedIdle(prepared, now, idleSince, settings)
    endObservedIdle(prepared, now, settings)
    if (prepared.state.phase === "break")
      appendTransition(prepared, transition(prepared.state, tickEvent, now, settings))
    prepared.effects.unshift({ type: "activity-gap", atEpochMs: now, durationMs: now - idleSince })
  } else if (prepared.context.isIdle) {
    if (prepared.state.phase === "break") {
      appendTransition(prepared, transition(prepared.state, tickEvent, now, settings))
      if (prepared.state.phase === "active") {
        appendTransition(prepared, transition(prepared.state, {
          type: "enterIdle",
          startedAtEpochMs: now
        }, now, settings))
      }
    } else {
      satisfyNaturalBreak(prepared, now, settings)
    }
  } else {
    appendTransition(prepared, transition(prepared.state, tickEvent, now, settings))
  }

  if (!remindersAllowed && prepared.state.workdayOverrideActive !== true &&
      ["active", "idle", "warning", "deferred"].indexOf(prepared.state.phase) !== -1)
    appendTransition(prepared, transition(prepared.state, closeEvent, now, settings))

  prepared.context.lastObservedAtEpochMs = now
  return prepared
}

if (typeof module !== "undefined") {
  module.exports = {
    PHASES: PHASES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    createState: createState,
    createActivityContext: createActivityContext,
    publicState: publicState,
    transition: transition,
    snapshotState: snapshotState,
    restoreState: restoreState,
    activitySignal: activitySignal,
    heartbeat: heartbeat
  }
}
