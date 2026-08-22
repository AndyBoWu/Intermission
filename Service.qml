import QtQuick
import Quickshell.Wayland
import "Engine.js" as Engine

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var barWidgetRegistry: null
  property var pluginRegistry: null

  property bool autoStart: true
  property var settings: Engine.normalizeSettings({})
  property var runtimeState: Engine.createState(0, settings)
  property var activityContext: Engine.createActivityContext(0)
  property double displayNowEpochMs: 0
  property var lastEffects: []
  property var lastError: null
  property bool ready: false

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

  function updateSettings(rawSettings) {
    root.settings = Engine.normalizeSettings(rawSettings)
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

  Component.onCompleted: {
    var now = Date.now()
    root.displayNowEpochMs = now
    root.runtimeState = Engine.createState(now, root.settings)
    root.activityContext = Engine.createActivityContext(now)
    root.ready = true
    if (root.autoStart) root.dispatch({ type: "start" })
    Qt.callLater(root.handleIdleChanged)
  }
}
