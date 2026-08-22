import QtQuick
import qs.Ui
import qs.Commons
import "Settings.js" as Settings

BarWidget {
  id: root
  moduleName: "io.github.andybowu.intermission"

  readonly property var intermissionService: bar && bar.shell
    ? bar.shell.serviceFor(moduleName)
    : null
  readonly property var state: intermissionService && intermissionService.ready
    ? intermissionService.publicState
    : ({ phase: "stopped", breakKind: null, cycleIndex: 0, remainingSeconds: 0, paused: false })
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true : false

  function phaseLabel(phase) {
    if (phase === "active") return "Active"
    if (phase === "idle") return "Idle"
    if (phase === "warning") return "Break soon"
    if (phase === "deferred") return "Deferred"
    if (phase === "break") return state.breakKind === "long" ? "Long break" : "Break"
    if (phase === "paused") return "Paused"
    return "Stopped"
  }

  function phaseIcon(phase) {
    if (phase === "active") return "󰔟"
    if (phase === "idle") return "󰒲"
    if (phase === "warning") return "󰀪"
    if (phase === "deferred") return "󰏥"
    if (phase === "break" || phase === "paused") return "󰏤"
    return "󰐊"
  }

  function formatRemaining(seconds, compact) {
    var total = Math.max(0, Math.ceil(Number(seconds) || 0))
    var minutes = Math.floor(total / 60)
    var remainder = total % 60
    if (compact && minutes > 9) return String(minutes) + "m"
    return String(minutes) + ":" + (remainder < 10 ? "0" : "") + String(remainder)
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("service" in target) target.service = root.intermissionService
  }

  function syncServiceSettings() {
    if (!root.intermissionService) return
    var normalized = Settings.normalize(root.settings)
    root.intermissionService.updateSettings(normalized)
  }

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  onBarChanged: injectPanel()
  onSettingsChanged: {
    injectPanel()
    syncServiceSettings()
  }
  onIntermissionServiceChanged: {
    injectPanel()
    syncServiceSettings()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.vertical
      ? root.phaseIcon(root.state.phase) + "\n" + root.formatRemaining(root.state.remainingSeconds, true)
      : root.phaseIcon(root.state.phase) + "  " + root.phaseLabel(root.state.phase) +
        (root.state.phase === "stopped" ? "" : " · " + root.formatRemaining(root.state.remainingSeconds, false))
    fixedHeight: root.vertical ? Style.bar.iconSlot * 2 : -1
    tooltipText: "Intermission — " + root.phaseLabel(root.state.phase) +
      (root.state.phase === "stopped" ? "" : " — " + root.formatRemaining(root.state.remainingSeconds, false))
    active: root.state.phase === "warning" || root.state.phase === "break" || root.opened
    enabled: root.intermissionService && root.intermissionService.ready

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
    }
  }

  Component.onCompleted: {
    injectPanel()
    syncServiceSettings()
  }
}
