import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import "Engine.js" as Engine
import "Settings.js" as Settings
import "StateStore.js" as StateStore

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var barWidgetRegistry: null
  property var pluginRegistry: null

  readonly property string moduleName: "io.github.andybowu.intermission"
  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string xdgStateHome: Quickshell.env("XDG_STATE_HOME") || ""
  readonly property string sessionPath: StateStore.sessionPath(xdgStateHome, home)

  property bool autoStart: true
  property var configuration: Settings.normalize({})
  property var settings: Engine.normalizeSettings({})
  property var runtimeState: Engine.createState(0, settings)
  property var activityContext: Engine.createActivityContext(0)
  property double displayNowEpochMs: 0
  property var lastEffects: []
  property var lastError: null
  property bool overlayOpen: false
  property bool snapshotWritable: true
  property bool ready: false
  property bool initialized: false
  property var localTimeParts: Settings.localTimeParts(new Date())
  property bool workdayObservationInitialized: false
  property bool lastConfiguredReminderWindowOpen: true
  property string pendingEndOfDayPromptDateKey: ""

  readonly property int idleDetectionSeconds: 5
  readonly property int heartbeatIntervalMs: 1000
  readonly property int suspensionThresholdMs: 5000
  readonly property bool isIdle: activityContext && activityContext.isIdle === true
  readonly property var publicState: Engine.publicState(runtimeState, displayNowEpochMs, settings)
  readonly property var activeToplevel: ToplevelManager.activeToplevel
  readonly property string currentAppId: activeToplevel
    ? String(activeToplevel.appId || "").trim().toLowerCase() : ""
  readonly property var hostIdleService: shell && typeof shell.firstPartyServiceFor === "function"
    ? shell.firstPartyServiceFor("omarchy.idle") : null
  readonly property bool hostStayAwake: hostIdleService && hostIdleService.stayAwake === true
  readonly property bool fullscreenContext: (activeToplevel && activeToplevel.fullscreen === true) ||
    (Hyprland.focusedWorkspace && Hyprland.focusedWorkspace.hasFullscreen === true)
  readonly property bool allowlistedContext: Settings.appIdAllowed(
    currentAppId,
    configuration.busyAppIds
  )
  readonly property bool manualHoldContext: runtimeState &&
    Number(runtimeState.manualHoldUntilEpochMs) > displayNowEpochMs
  readonly property bool busyContext: busyContextAt(displayNowEpochMs)
  readonly property string busyContextReason: contextReasonAt(displayNowEpochMs)
  readonly property bool configuredReminderWindowOpen: Settings.reminderAllowedAt(
    configuration,
    localTimeParts
  )
  readonly property bool reminderWindowOpen: configuredReminderWindowOpen ||
    (runtimeState && runtimeState.workdayOverrideActive === true)

  function automaticContextBusy() {
    return root.configuration.contextDeferralEnabled === true &&
      (root.hostStayAwake || root.fullscreenContext || root.allowlistedContext)
  }

  function busyContextAt(now) {
    var manual = root.runtimeState && Number(root.runtimeState.manualHoldUntilEpochMs) > now
    return manual || root.automaticContextBusy()
  }

  function contextReasonAt(now) {
    if (root.runtimeState && Number(root.runtimeState.manualHoldUntilEpochMs) > now) return "manual hold"
    if (root.configuration.contextDeferralEnabled !== true) return ""
    if (root.hostStayAwake) return "stay-awake mode"
    if (root.fullscreenContext) return "fullscreen"
    if (root.allowlistedContext) return "selected app"
    return ""
  }

  function refreshLocalTime(dateValue) {
    var timestamp = dateValue instanceof Date ? dateValue.getTime() : Date.now()
    if (typeof Date.timeZoneUpdated === "function") Date.timeZoneUpdated()
    var date = new Date(timestamp)
    root.localTimeParts = Settings.localTimeParts(date)
  }

  function effectNamed(effects, name) {
    var values = Array.isArray(effects) ? effects : []
    for (var i = 0; i < values.length; i++) {
      if (values[i] && values[i].type === name) return true
    }
    return false
  }

  function openOverlay() {
    if (root.runtimeState.phase !== "break") {
      root.lastError = { code: "INVALID_STATE", message: "No break is active" }
      return false
    }
    if (root.overlayOpen) return true
    var opened = !!(root.shell && typeof root.shell.summon === "function" &&
      root.shell.summon(root.moduleName, "{}"))
    if (!opened) root.lastError = { code: "UI_UNAVAILABLE", message: "Break overlay is unavailable" }
    return opened
  }

  function hideOverlay(reason) {
    var wasOpen = root.overlayOpen
    var hidden = !!(root.shell && typeof root.shell.hide === "function" &&
      root.shell.hide(root.moduleName))
    root.overlayOpen = false
    if (!hidden && wasOpen) {
      root.lastError = { code: "UI_UNAVAILABLE", message: "Break overlay could not be closed" }
      return false
    }
    return true
  }

  function processRuntimeResult(result) {
    if (!result) return
    if (result.changed === true) root.persistSnapshot()

    var effects = result.effects || []
    if (root.effectNamed(effects, "end-of-day-prompt")) Qt.callLater(root.showPanel)
    if (root.runtimeState.phase === "break" &&
        (root.effectNamed(effects, "break-started") || root.effectNamed(effects, "restore-overlay"))) {
      Qt.callLater(root.openOverlay)
    } else if (result.changed === true && root.runtimeState.phase !== "break" && root.overlayOpen) {
      Qt.callLater(function() { root.hideOverlay("state-change") })
    }
  }

  function persistSnapshot() {
    if (!root.initialized || !root.snapshotWritable) return true
    var snapshot = Engine.snapshotState(root.runtimeState, Date.now())
    var encoded = StateStore.serializeSnapshot(snapshot)
    if (!encoded.ok) {
      root.lastError = { code: "PERSISTENCE_ERROR", message: encoded.message }
      return false
    }
    stateFile.setText(encoded.text)
    return true
  }

  function applyActivityResult(result) {
    if (!result || !result.ok) {
      root.lastError = result && result.error ? result.error : {
        code: "INTERNAL_ERROR",
        message: "Activity policy returned no result"
      }
      return false
    }

    root.runtimeState = result.state
    root.activityContext = result.context
    root.lastEffects = result.effects || []
    root.lastError = null
    root.processRuntimeResult(result)
    return true
  }

  function applyTransitionResult(result) {
    if (!result || !result.ok) {
      root.lastError = result && result.error ? result.error : {
        code: "INTERNAL_ERROR",
        message: "Rhythm transition returned no result"
      }
      return false
    }

    root.runtimeState = result.state
    root.lastEffects = result.effects || []
    root.lastError = null
    root.processRuntimeResult(result)
    return true
  }

  function observe(now) {
    if (root.workdayObservationInitialized && root.lastConfiguredReminderWindowOpen &&
        !root.configuredReminderWindowOpen &&
        root.configuration.endOfDayPromptEnabled === true &&
        ["active", "idle", "warning", "deferred", "break"].indexOf(
          root.runtimeState.phase
        ) !== -1)
      root.pendingEndOfDayPromptDateKey = root.localTimeParts.dateKey
    if (root.configuredReminderWindowOpen ||
        root.configuration.endOfDayPromptEnabled !== true)
      root.pendingEndOfDayPromptDateKey = ""
    var result = Engine.heartbeat(
      root.runtimeState,
      root.activityContext,
      now,
      root.settings,
      {
        expectedIntervalMs: root.heartbeatIntervalMs,
        suspensionThresholdMs: root.suspensionThresholdMs,
        busyContext: root.busyContextAt(now),
        remindersAllowed: root.reminderWindowOpen,
        endOfDayPrompt: root.pendingEndOfDayPromptDateKey !== "",
        localDateKey: root.pendingEndOfDayPromptDateKey || root.localTimeParts.dateKey
      }
    )
    root.displayNowEpochMs = now
    var applied = root.applyActivityResult(result)
    if (root.runtimeState.phase === "outside") root.pendingEndOfDayPromptDateKey = ""
    root.lastConfiguredReminderWindowOpen = root.configuredReminderWindowOpen
    root.workdayObservationInitialized = true
    return applied
  }

  function dispatch(event) {
    var now = Date.now()
    if (!root.observe(now)) return false

    var result = Engine.transition(root.runtimeState, event, now, root.settings)
    if (!root.applyTransitionResult(result)) return false

    if (root.activityContext.isIdle && root.runtimeState.phase === "active") {
      result = Engine.transition(root.runtimeState, {
        type: "enterIdle",
        startedAtEpochMs: now
      }, now, root.settings)
      if (!root.applyTransitionResult(result)) return false
    }
    return root.observe(now)
  }

  function handleIdleChanged() {
    if (!root.ready) return
    var now = Date.now()
    var result = Engine.activitySignal(
      root.runtimeState,
      root.activityContext,
      idleMonitor.isIdle,
      now,
      root.idleDetectionSeconds * 1000,
      root.settings
    )
    root.displayNowEpochMs = now
    if (root.applyActivityResult(result)) root.observe(now)
  }

  function inlineSettings() {
    var config = root.shell && root.shell.shellConfig ? root.shell.shellConfig : ({})
    return Settings.findInlineEntry(config, root.moduleName)
  }

  function updateSettings(rawSettings) {
    var normalized = Settings.normalize(rawSettings)
    root.workdayObservationInitialized = false
    root.pendingEndOfDayPromptDateKey = ""
    root.configuration = normalized
    root.autoStart = normalized.autoStart
    root.settings = Engine.normalizeSettings(normalized)
  }

  function initializeFromSnapshot(rawSnapshot, source) {
    if (root.initialized) return
    var now = Date.now()
    root.displayNowEpochMs = now
    root.updateSettings(root.inlineSettings())
    root.runtimeState = Engine.createState(now, root.settings)
    root.activityContext = Engine.createActivityContext(now)
    root.snapshotWritable = source !== "unavailable"

    var restored = null
    if (source === "loaded") {
      var parsed = StateStore.parseSnapshotText(rawSnapshot)
      if (parsed.reason === "UNSUPPORTED_VERSION") root.snapshotWritable = false
      if (parsed.ok) restored = Engine.restoreState(parsed.value, now, root.settings)
    }

    if (restored && restored.ok) {
      root.runtimeState = restored.state
      root.lastEffects = restored.effects || []
    }

    root.initialized = true
    root.ready = true
    root.lastError = null

    if (restored && restored.ok) root.processRuntimeResult(restored)
    else if (source === "missing" && root.autoStart) root.dispatch({ type: "start" })
    root.handleIdleChanged()
  }

  function start() { return root.dispatch({ type: "start" }) }
  function stop() { return root.dispatch({ type: "stop" }) }
  function pause() { return root.dispatch({ type: "pause" }) }
  function resume() { return root.dispatch({ type: "resume" }) }
  function skip(reason) { return root.dispatch({ type: "skip", reason: reason || "user" }) }
  function startBreak(kind) {
    var event = { type: "startBreak" }
    if (kind !== undefined && kind !== null && kind !== "") event.kind = kind
    return root.dispatch(event)
  }
  function completeBreak(source) {
    return root.dispatch({ type: "completeBreak", source: source || "panel" })
  }
  function emergencyExit() {
    var completed = root.runtimeState.phase === "break"
      ? root.dispatch({ type: "emergencyExit" }) : true
    if (!completed) return { stateCompleted: false, overlayHidden: false }
    var hidden = root.hideOverlay("emergency")
    return { stateCompleted: true, overlayHidden: hidden }
  }
  function snooze(seconds) {
    var event = { type: "snooze" }
    if (seconds !== undefined && seconds !== null) event.seconds = seconds
    return root.dispatch(event)
  }
  function holdReminders(seconds) {
    return root.dispatch({ type: "holdContext", seconds: seconds || 1800 })
  }
  function clearReminderHold() {
    return root.dispatch({ type: "clearContextHold" })
  }
  function continueWorkday() {
    return root.dispatch({ type: "continueWorkday", idle: root.isIdle })
  }
  function dismissEndOfDay() {
    return root.dispatch({ type: "dismissEndOfDay" })
  }
  function stopForDay() {
    return root.dispatch({ type: "stopForDay" })
  }

  function showPanel() {
    return !!(root.shell && root.shell.bar &&
      typeof root.shell.bar.summonBarWidget === "function" &&
      root.shell.bar.summonBarWidget(root.moduleName))
  }

  function parsePayload(payloadJson) {
    try {
      var payload = JSON.parse(payloadJson === undefined || payloadJson === "" ? "{}" : payloadJson)
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return { ok: false, error: "Payload must be a JSON object" }
      return { ok: true, value: payload }
    } catch (error) {
      return { ok: false, error: "Payload must be valid JSON" }
    }
  }

  function onlyKeys(payload, allowed) {
    var keys = Object.keys(payload)
    for (var i = 0; i < keys.length; i++) if (allowed.indexOf(keys[i]) === -1) return false
    return true
  }

  function ipcResponse(command, ok, error) {
    var projected = root.publicState
    return JSON.stringify({
      ok: ok === true,
      command: command,
      state: {
        phase: projected.phase,
        breakKind: projected.breakKind,
        cycleIndex: projected.cycleIndex,
        remainingSeconds: projected.remainingSeconds,
        overlayOpen: root.overlayOpen,
        breakDebtSeconds: projected.breakDebtSeconds,
        contextDeferred: projected.contextDeferred,
        busyContext: root.busyContext,
        busyContextReason: root.busyContextReason,
        manualHoldRemainingSeconds: projected.manualHoldRemainingSeconds,
        outsideHours: projected.outsideHours,
        outsideResumePhase: projected.outsideResumePhase,
        workdayOverrideActive: projected.workdayOverrideActive,
        endOfDayPromptPending: projected.endOfDayPromptPending
      },
      error: error || null
    })
  }

  function ipcError(command, code, message) {
    return root.ipcResponse(command, false, { code: code, message: message })
  }

  function stableIpcError(error) {
    var supportedCodes = [
      "INVALID_ARGUMENT",
      "INVALID_STATE",
      "PERSISTENCE_ERROR",
      "UI_UNAVAILABLE",
      "INTERNAL_ERROR"
    ]
    if (!error || supportedCodes.indexOf(error.code) === -1) {
      return {
        code: "INTERNAL_ERROR",
        message: error && error.message ? error.message : "Command failed"
      }
    }
    return {
      code: error.code,
      message: error.message || "Command failed"
    }
  }

  function runIpc(command, payloadJson) {
    var parsed = root.parsePayload(payloadJson)
    if (!parsed.ok) return root.ipcError(command, "INVALID_ARGUMENT", parsed.error)
    var payload = parsed.value
    var allowed = []
    if (command === "snooze") allowed = ["seconds"]
    else if (command === "skip") allowed = ["reason"]
    else if (command === "startBreak") allowed = ["kind"]
    else if (command === "completeBreak") allowed = ["source"]
    else if (command === "hideOverlay") allowed = ["reason"]
    if (!root.onlyKeys(payload, allowed))
      return root.ipcError(command, "INVALID_ARGUMENT", "Payload contains an unknown field")

    var succeeded = false
    if (command === "status") return root.ipcResponse(command, true, null)
    if (command === "start") succeeded = root.start()
    else if (command === "pause") succeeded = root.pause()
    else if (command === "resume") succeeded = root.resume()
    else if (command === "snooze") succeeded = root.snooze(payload.seconds)
    else if (command === "skip") {
      if (payload.reason !== undefined && payload.reason !== "user")
        return root.ipcError(command, "INVALID_ARGUMENT", "Skip reason must be user")
      succeeded = root.skip(payload.reason || "user")
    } else if (command === "startBreak") {
      if (payload.kind !== undefined && payload.kind !== "short" && payload.kind !== "long")
        return root.ipcError(command, "INVALID_ARGUMENT", "Break kind must be short or long")
      succeeded = root.startBreak(payload.kind)
    } else if (command === "completeBreak") {
      var source = payload.source === undefined ? "ipc" : payload.source
      if (["overlay", "panel", "ipc"].indexOf(source) === -1)
        return root.ipcError(command, "INVALID_ARGUMENT", "Completion source is invalid")
      succeeded = root.completeBreak(source)
    } else if (command === "openOverlay") {
      succeeded = root.openOverlay()
    } else if (command === "hideOverlay") {
      if (payload.reason !== undefined && payload.reason !== "ipc")
        return root.ipcError(command, "INVALID_ARGUMENT", "Hide reason must be ipc")
      succeeded = root.hideOverlay(payload.reason || "ipc")
    } else if (command === "showPanel") {
      succeeded = root.showPanel()
      if (!succeeded) return root.ipcError(command, "UI_UNAVAILABLE", "No live bar panel is available")
    } else {
      return root.ipcError(command, "INVALID_ARGUMENT", "Unknown command")
    }

    if (succeeded) return root.ipcResponse(command, true, null)
    return root.ipcResponse(command, false, root.stableIpcError(root.lastError))
  }

  FileView {
    id: stateFile
    path: root.sessionPath
    watchChanges: false
    atomicWrites: true
    blockWrites: true
    printErrors: false

    onLoaded: {
      var raw = text()
      Qt.callLater(function() { root.initializeFromSnapshot(raw, "loaded") })
    }
    onLoadFailed: function(error) {
      var source = error === FileViewError.FileNotFound ? "missing" : "unavailable"
      Qt.callLater(function() { root.initializeFromSnapshot("", source) })
    }
    onSaveFailed: function(error) {
      root.lastError = {
        code: "PERSISTENCE_ERROR",
        message: "Runtime snapshot could not be saved: " + FileViewError.toString(error)
      }
    }
  }

  IdleMonitor {
    id: idleMonitor
    enabled: root.ready
    timeout: root.idleDetectionSeconds
    respectInhibitors: true
    onIsIdleChanged: root.handleIdleChanged()
  }

  Timer {
    interval: root.heartbeatIntervalMs
    repeat: true
    running: root.ready
    triggeredOnStart: false
    onTriggered: root.observe(Date.now())
  }

  SystemClock {
    id: localClock
    precision: SystemClock.Minutes
    onDateChanged: root.refreshLocalTime(date)
  }

  onBusyContextChanged: {
    if (root.ready) Qt.callLater(function() { root.observe(Date.now()) })
  }

  onConfiguredReminderWindowOpenChanged: {
    if (root.ready) Qt.callLater(function() { root.observe(Date.now()) })
  }

  IpcHandler {
    target: root.moduleName

    function status(payloadJson: string): string { return root.runIpc("status", payloadJson) }
    function start(payloadJson: string): string { return root.runIpc("start", payloadJson) }
    function pause(payloadJson: string): string { return root.runIpc("pause", payloadJson) }
    function resume(payloadJson: string): string { return root.runIpc("resume", payloadJson) }
    function snooze(payloadJson: string): string { return root.runIpc("snooze", payloadJson) }
    function skip(payloadJson: string): string { return root.runIpc("skip", payloadJson) }
    function startBreak(payloadJson: string): string { return root.runIpc("startBreak", payloadJson) }
    function completeBreak(payloadJson: string): string { return root.runIpc("completeBreak", payloadJson) }
    function openOverlay(payloadJson: string): string { return root.runIpc("openOverlay", payloadJson) }
    function hideOverlay(payloadJson: string): string { return root.runIpc("hideOverlay", payloadJson) }
    function showPanel(payloadJson: string): string { return root.runIpc("showPanel", payloadJson) }
  }

  Component.onCompleted: {
    root.refreshLocalTime(localClock.date)
    if (root.sessionPath === "")
      Qt.callLater(function() { root.initializeFromSnapshot("", "unavailable") })
  }

  Component.onDestruction: {
    if (root.initialized) root.persistSnapshot()
    root.hideOverlay("shutdown")
  }
}
