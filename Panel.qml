import QtQuick
import qs.Commons
import qs.Ui
import "Settings.js" as Settings

Panel {
  id: root
  moduleName: Settings.PLUGIN_ID
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var service: null
  property var form: Settings.formFromSettings(settings)
  property bool dirty: false
  property string saveMessage: ""

  readonly property var barIdentity: hostWidget || root
  readonly property var state: service && service.ready
    ? service.publicState
    : ({ phase: "stopped", breakKind: null, cycleIndex: 0, remainingSeconds: 0, paused: false })
  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  function phaseLabel() {
    if (state.phase === "active") return "Active"
    if (state.phase === "idle") return "Idle"
    if (state.phase === "warning") return "Break soon"
    if (state.phase === "deferred") return "Deferred"
    if (state.phase === "break") return state.breakKind === "long" ? "Long break" : "Short break"
    if (state.phase === "paused") return "Paused"
    return "Stopped"
  }

  function formatRemaining(seconds) {
    var total = Math.max(0, Math.ceil(Number(seconds) || 0))
    var minutes = Math.floor(total / 60)
    var remainder = total % 60
    return String(minutes) + ":" + (remainder < 10 ? "0" : "") + String(remainder)
  }

  function setFormValue(name, value) {
    var next = {}
    for (var key in root.form) next[key] = root.form[key]
    next[name] = value
    if (Settings.PRESET_FIELDS.indexOf(name) !== -1)
      next.presetId = Settings.matchingPreset(next)
    root.form = next
    root.dirty = true
    root.saveMessage = ""
  }

  function applyPreset(presetId) {
    root.form = Settings.applyPreset(root.form, presetId)
    root.dirty = true
    root.saveMessage = ""
  }

  function shiftPreset(direction) {
    var presetIds = ["balanced", "frequent", "spacious"]
    var currentIndex = presetIds.indexOf(String(root.form.presetId || ""))
    if (currentIndex < 0) currentIndex = 0
    var offset = direction < 0 ? -1 : 1
    var nextIndex = (currentIndex + offset + presetIds.length) % presetIds.length
    root.applyPreset(presetIds[nextIndex])
  }

  function refreshForm() {
    root.form = Settings.formFromSettings(root.settings)
    root.dirty = false
    root.saveMessage = ""
  }

  function saveSettings() {
    var entry = Settings.entryFromForm(root.settings, root.form, root.moduleName)
    var current = Settings.entryFromForm(
      root.settings,
      Settings.formFromSettings(root.settings),
      root.moduleName
    )
    var persisted = JSON.stringify(current) === JSON.stringify(entry)
    if (!persisted && root.bar && root.bar.shell &&
        typeof root.bar.shell.updateEntryInline === "function") {
      persisted = root.bar.shell.updateEntryInline(root.moduleName, entry) === true
    }
    if (!persisted) {
      root.dirty = true
      root.saveMessage = "Save failed"
      savedMessageTimer.restart()
      return false
    }

    root.settings = entry
    if (root.hostWidget && "settings" in root.hostWidget) root.hostWidget.settings = entry
    if (root.service) root.service.updateSettings(entry)
    root.dirty = false
    root.saveMessage = "Saved"
    savedMessageTimer.restart()
    return true
  }

  function open() {
    refreshForm()
    root.controller.show()
    Qt.callLater(root.focusInitialAction)
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function focusInitialAction() {
    if (!root.opened) return
    if (startAction.visible) startAction.forceActiveFocus()
    else if (resumeAction.visible) resumeAction.forceActiveFocus()
    else if (pauseAction.visible) pauseAction.forceActiveFocus()
    else if (startBreakAction.visible) startBreakAction.forceActiveFocus()
    else endBreakAction.forceActiveFocus()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  onSettingsChanged: if (!root.opened || !root.dirty) refreshForm()

  Timer {
    id: savedMessageTimer
    interval: 1800
    onTriggered: root.saveMessage = ""
  }

  KeyboardPanel {
    id: keyboardPanel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: focusScope
    contentWidth: keyboardPanel.fittedContentWidth(Style.space(520))
    contentHeight: keyboardPanel.fittedContentHeight(contentColumn.implicitHeight, Style.space(760))

    FocusScope {
      id: focusScope
      anchors.fill: parent
      focus: true
      Keys.priority: Keys.AfterItem
      Keys.onEscapePressed: root.close()

      Flickable {
        id: scroller
        anchors.fill: parent
        contentWidth: width
        contentHeight: contentColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: contentColumn
          width: scroller.width
          spacing: Style.space(14)

          Item {
            width: parent.width
            implicitHeight: Math.max(statusLabels.implicitHeight, countdown.implicitHeight)

            Column {
              id: statusLabels
              anchors.left: parent.left
              anchors.right: countdown.left
              anchors.rightMargin: Style.space(12)
              spacing: Style.space(3)

              Text {
                text: "Intermission"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }

              Text {
                text: root.phaseLabel() + (root.service && root.service.isIdle ? " · away" : "")
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
                Accessible.role: Accessible.StaticText
                Accessible.name: "Intermission status " + text
              }
            }

            Text {
              id: countdown
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              text: root.state.phase === "stopped" ? "—" : root.formatRemaining(root.state.remainingSeconds)
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.displayLarge
            }
          }

          Row {
            id: actionRow
            width: parent.width
            spacing: Style.space(6)

            Button {
              id: startAction
              visible: root.state.phase === "stopped"
              text: "Start"
              iconText: "󰐊"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Start the break rhythm"
              Accessible.onPressAction: if (enabled && root.service) root.service.start()
              onClicked: if (root.service) root.service.start()
            }

            Button {
              id: pauseAction
              visible: ["active", "idle", "warning", "deferred"].indexOf(root.state.phase) !== -1
              text: "Pause"
              iconText: "󰏤"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Pause active-use timing"
              Accessible.onPressAction: if (enabled && root.service) root.service.pause()
              onClicked: if (root.service) root.service.pause()
            }

            Button {
              id: resumeAction
              visible: root.state.phase === "paused"
              text: "Resume"
              iconText: "󰐊"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Resume active-use timing"
              Accessible.onPressAction: if (enabled && root.service) root.service.resume()
              onClicked: if (root.service) root.service.resume()
            }

            Button {
              id: startBreakAction
              visible: ["active", "warning", "deferred"].indexOf(root.state.phase) !== -1
              text: root.state.phase === "active" ? "Take a break" : "Start now"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Begin the pending break now"
              Accessible.onPressAction: if (enabled && root.service) root.service.startBreak()
              onClicked: if (root.service) root.service.startBreak()
            }

            Button {
              visible: root.state.phase === "warning"
              text: "Defer"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Postpone the pending break once"
              Accessible.onPressAction: if (enabled && root.service) root.service.snooze()
              onClicked: if (root.service) root.service.snooze()
            }

            Button {
              visible: root.state.phase === "warning" || root.state.phase === "deferred"
              text: "Skip"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Skip the pending break and advance the cadence"
              Accessible.onPressAction: if (enabled && root.service) root.service.skip("user")
              onClicked: if (root.service) root.service.skip("user")
            }

            Button {
              id: endBreakAction
              visible: root.state.phase === "break"
              text: "End break"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Complete the current break"
              Accessible.onPressAction: if (enabled && root.service) root.service.completeBreak("panel")
              onClicked: if (root.service) root.service.completeBreak("panel")
            }
          }

          PanelSeparator { foreground: root.contentForeground }
          PanelSectionHeader {
            text: "RHYTHM"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
          }

          Text {
            width: parent.width
            text: root.form.presetId === "custom"
              ? "Custom timing"
              : "Choose a starting rhythm, then adjust any field if needed."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          ButtonGroup {
            options: [
              { value: "balanced", label: "Balanced" },
              { value: "frequent", label: "Frequent" },
              { value: "spacious", label: "Spacious" }
            ]
            value: root.form.presetId
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.ComboBox
            Accessible.name: "Cadence preset: " + String(root.form.presetId || "custom")
            Accessible.description: "Choose Balanced, Frequent, or Spacious timing. Use increase or decrease to change the preset."
            Accessible.focusable: focusable
            Accessible.focused: activeFocus
            Accessible.onDecreaseAction: if (enabled) root.shiftPreset(-1)
            Accessible.onIncreaseAction: if (enabled) root.shiftPreset(1)
            Accessible.onPressAction: if (enabled) root.shiftPreset(1)
            onChanged: function(value) { root.applyPreset(value) }
          }

          Grid {
            id: rhythmGrid
            width: parent.width
            columns: 2
            columnSpacing: Style.space(16)
            rowSpacing: Style.space(12)

            readonly property real cellWidth: (width - columnSpacing) / 2

            NumberField {
              width: rhythmGrid.cellWidth
              label: "Before short break (seconds)"
              from: 60; to: 14400; stepSize: 60
              value: root.form.shortWorkIntervalSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("shortWorkIntervalSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Before long break (seconds)"
              from: 60; to: 14400; stepSize: 60
              value: root.form.longWorkIntervalSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("longWorkIntervalSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Short break (seconds)"
              from: 10; to: 900; stepSize: 5
              value: root.form.shortBreakSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("shortBreakSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Long break (seconds)"
              from: 30; to: 3600; stepSize: 30
              value: root.form.longBreakSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("longBreakSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Cycles before long break"
              from: 1; to: 12; stepSize: 1
              value: root.form.cyclesBeforeLong
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("cyclesBeforeLong", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Advance warning (seconds)"
              from: 0; to: 300; stepSize: 5
              value: root.form.warningSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("warningSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Quick defer (seconds)"
              from: 60; to: 1800; stepSize: 60
              value: root.form.snoozeSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("snoozeSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Natural break idle (seconds)"
              from: 30; to: 3600; stepSize: 30
              value: root.form.naturalBreakSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("naturalBreakSeconds", v) }
            }
            NumberField {
              width: rhythmGrid.cellWidth
              label: "Escape hold (seconds)"
              from: 1; to: 10; stepSize: 1
              value: root.form.escapeHoldSeconds
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              onModified: function(v) { root.setFormValue("escapeHoldSeconds", v) }
            }
          }

          PanelSeparator { foreground: root.contentForeground }
          PanelSectionHeader {
            text: "BEHAVIOR"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
          }

          Toggle {
            width: parent.width
            label: "Start with the plugin"
            description: "Begin a fresh active-use interval when the service loads."
            checked: root.form.autoStart
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue("autoStart", !root.form.autoStart)
            Accessible.onToggleAction: if (enabled) root.setFormValue("autoStart", !root.form.autoStart)
            onClicked: root.setFormValue("autoStart", !root.form.autoStart)
          }

          Toggle {
            width: parent.width
            label: "Reduced motion"
            description: "Use restrained transitions in the break surface."
            checked: root.form.reducedMotion
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue("reducedMotion", !root.form.reducedMotion)
            Accessible.onToggleAction: if (enabled) root.setFormValue("reducedMotion", !root.form.reducedMotion)
            onClicked: root.setFormValue("reducedMotion", !root.form.reducedMotion)
          }

          Row {
            width: parent.width
            spacing: Style.space(8)

            Button {
              text: root.dirty ? "Save changes" : "Saved"
              iconText: "󰆓"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              enabled: root.dirty
              opacity: enabled ? 1.0 : 0.55
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Persist Intermission settings"
              Accessible.onPressAction: if (enabled) root.saveSettings()
              onClicked: root.saveSettings()
            }

            Text {
              text: root.saveMessage
              visible: text !== ""
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.bodySmall
              anchors.verticalCenter: parent.verticalCenter
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }
          }
        }
      }
    }
  }
}
