import QtQuick
import Quickshell
import Quickshell.Wayland
import "Engine.js" as Engine
import "Settings.js" as Settings

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var barWidgetRegistry: null
  property var pluginRegistry: null

  readonly property string moduleName: "io.github.andybowu.intermission"

  property bool autoStart: true
  property var configuration: Settings.normalize({})
  property var settings: Engine.normalizeSettings({})
  property var runtimeState: Engine.createState(0, settings)
  property var activityContext: Engine.createActivityContext(0)
  property double displayNowEpochMs: 0
  property var lastEffects: []
  property var lastError: null
  property bool overlayOpen: false
  property bool ready: false
  property bool initialized: false

  readonly property int idleDetectionSeconds: 5
  readonly property int heartbeatIntervalMs: 1000
  readonly property int suspensionThresholdMs: 5000
  readonly property bool isIdle: activityContext && activityContext.isIdle === true
  readonly property var publicState: Engine.publicState(runtimeState, displayNowEpochMs, settings)

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
    return true
  }

  function observe(now) {
    var result = Engine.heartbeat(
      root.runtimeState,
      root.activityContext,
      now,
      root.settings,
      {
        expectedIntervalMs: root.heartbeatIntervalMs,
        suspensionThresholdMs: root.suspensionThresholdMs
      }
    )
    root.displayNowEpochMs = now
    return root.applyActivityResult(result)
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
      return root.applyTransitionResult(result)
    }
    return true
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
    root.applyActivityResult(result)
  }

  function inlineSettings() {
    var config = root.shell && root.shell.shellConfig ? root.shell.shellConfig : ({})
    return Settings.findInlineEntry(config, root.moduleName)
  }

  function updateSettings(rawSettings) {
    var normalized = Settings.normalize(rawSettings)
    root.configuration = normalized
    root.autoStart = normalized.autoStart
    root.settings = Engine.normalizeSettings(normalized)
  }

  function initialize() {
    if (root.initialized) return
    var now = Date.now()
    root.displayNowEpochMs = now
    root.updateSettings(root.inlineSettings())
    root.runtimeState = Engine.createState(now, root.settings)
    root.activityContext = Engine.createActivityContext(now)
    root.initialized = true
    root.ready = true
    if (root.autoStart) root.dispatch({ type: "start" })
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
  function snooze(seconds) {
    var event = { type: "snooze" }
    if (seconds !== undefined && seconds !== null) event.seconds = seconds
    return root.dispatch(event)
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
        overlayOpen: root.overlayOpen
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
    } else if (command === "showPanel") {
      succeeded = root.showPanel()
      if (!succeeded) return root.ipcError(command, "UI_UNAVAILABLE", "No live bar panel is available")
    } else {
      return root.ipcError(command, "INVALID_ARGUMENT", "Unknown command")
    }

    if (succeeded) return root.ipcResponse(command, true, null)
    return root.ipcResponse(command, false, root.stableIpcError(root.lastError))
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
    function showPanel(payloadJson: string): string { return root.runIpc("showPanel", payloadJson) }
  }

  Component.onCompleted: {
    Qt.callLater(root.initialize)
  }
}
