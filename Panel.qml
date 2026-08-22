import QtQuick
import qs.Commons
import qs.Ui
import "lib/Settings.js" as Settings

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
  property bool historyResetArmed: false
  property bool historyExportVisible: false
  property string historyExportText: ""
  property string currentView: "daily"

  readonly property var barIdentity: hostWidget || root
  readonly property var state: service && service.ready
    ? service.publicState
    : ({
        phase: "stopped",
        breakKind: null,
        cycleIndex: 0,
        remainingSeconds: 0,
        paused: false,
        breakDebtSeconds: 0,
        contextDeferred: false,
        manualHoldRemainingSeconds: 0,
        activeElapsedSeconds: 0,
        outsideHours: false,
        outsideResumePhase: null,
        workdayOverrideActive: false,
        endOfDayPromptPending: false
      })
  readonly property var todayInsights: service && service.todayInsights
    ? service.todayInsights
    : ({ activeMinutes: 0, supportiveBreaks: 0, adherencePercent: null })
  readonly property var windowInsights: service && service.windowInsights
    ? service.windowInsights
    : ({
        days: 7,
        activeMinutes: 0,
        adherencePercent: null,
        continuityDays: 0,
        deferred: 0,
        skipped: 0,
        emergencyExit: 0,
        activeDays: 0
      })
  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property color mutedForeground: Qt.rgba(
    contentForeground.r,
    contentForeground.g,
    contentForeground.b,
    0.62
  )
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var workdayRows: [
    { key: "mon", label: "Monday" },
    { key: "tue", label: "Tuesday" },
    { key: "wed", label: "Wednesday" },
    { key: "thu", label: "Thursday" },
    { key: "fri", label: "Friday" },
    { key: "sat", label: "Saturday" },
    { key: "sun", label: "Sunday" }
  ]

  function phaseLabel() {
    if (state.contextDeferred) return "Break waiting"
    if (state.phase === "outside") return state.endOfDayPromptPending
      ? "Workday ended"
      : ["warning", "deferred"].indexOf(state.outsideResumePhase) !== -1
      ? "Break waiting outside reminder hours" : "Outside reminder hours"
    if (state.phase === "active") return "Active"
    if (state.phase === "idle") return "Idle"
    if (state.phase === "warning") return "Break soon"
    if (state.phase === "deferred") return "Deferred"
    if (state.phase === "break") return state.breakKind === "long" ? "Long break" : "Short break"
    if (state.phase === "paused") return "Paused"
    return "Stopped"
  }

  function contextSummary() {
    if (state.contextDeferred) {
      var reason = service ? service.busyContextReason : "busy context"
      return "A due break is waiting for " + (reason || "the current context") + " to end."
    }
    if (state.manualHoldRemainingSeconds > 0)
      return "Manual hold · " + formatRemaining(state.manualHoldRemainingSeconds) + " remaining"
    if (service && service.busyContext)
      return "Ready to defer for " + service.busyContextReason + "."
    return "No busy context detected."
  }

  function smartTimingSummary() {
    if (state.contextDeferred) return "Smart timing on · break waiting"
    if (state.manualHoldRemainingSeconds > 0)
      return "Smart timing held · " + formatRemaining(state.manualHoldRemainingSeconds) + " left"
    if (!form.contextDeferralEnabled) return "Smart timing off"
    if (service && service.busyContext)
      return "Smart timing on · " + (service.busyContextReason || "busy context")
    return "Smart timing on · no busy context"
  }

  function nextBreakKind() {
    if (state.phase === "break" && state.breakKind) return state.breakKind
    return Number(state.cycleIndex) >= Number(form.cyclesBeforeLong) - 1 ? "long" : "short"
  }

  function countdownCaption() {
    if (state.phase === "stopped") return "ready when you are"
    if (state.contextDeferred) return "break waiting for busy context"
    if (state.phase === "break") return "left in your " + nextBreakKind() + " break"
    if (state.phase === "warning") return "until your break starts"
    if (state.phase === "deferred") return "until the deferred break"
    if (state.phase === "outside") return state.endOfDayPromptPending
      ? "workday complete" : "outside reminder hours"
    return "until a " + nextBreakKind() + " break" + (state.phase === "paused" ? " · paused" : "")
  }

  function progressFraction() {
    if (state.phase === "stopped") return 0
    if (state.contextDeferred || state.phase === "warning" || state.phase === "deferred") return 1
    if (state.phase === "break") {
      var duration = nextBreakKind() === "long" ? form.longBreakSeconds : form.shortBreakSeconds
      return duration > 0 ? Math.max(0, Math.min(1, 1 - state.remainingSeconds / duration)) : 0
    }
    var elapsed = Math.max(0, Number(state.activeElapsedSeconds) || 0)
    var remaining = Math.max(0, Number(state.remainingSeconds) || 0)
    return elapsed + remaining > 0 ? Math.max(0, Math.min(1, elapsed / (elapsed + remaining))) : 0
  }

  function minutesLabel(seconds) {
    var value = Math.round((Number(seconds) || 0) / 60)
    return String(value) + " min"
  }

  function presetLabel() {
    var id = String(form.presetId || "custom")
    return id.charAt(0).toUpperCase() + id.slice(1)
  }

  function rhythmSummary() {
    return presetLabel() + " · " + minutesLabel(form.shortWorkIntervalSeconds) +
      " focus · " + String(form.shortBreakSeconds) + " sec break"
  }

  function breakRotationSummary() {
    var order = Array.isArray(form.routineOrder) ? form.routineOrder : []
    var labels = []
    var custom = Array.isArray(form.customBreakItems) ? form.customBreakItems : []
    for (var i = 0; i < order.length; i++) {
      var key = String(order[i])
      var label = key.charAt(0).toUpperCase() + key.slice(1)
      for (var c = 0; c < custom.length; c++)
        if (custom[c].id === key) label = custom[c].label
      labels.push(label)
    }
    return labels.join(", ")
  }

  function settingsSummary(view) {
    if (view === "rhythm") return rhythmSummary()
    if (view === "smart") {
      if (!form.contextDeferralEnabled) return "Off"
      var appCount = Settings.appIdList(form.busyAppIds).length
      return appCount > 0 ? "On · fullscreen and selected apps" : "On · fullscreen and stay-awake"
    }
    if (view === "rotation") return breakRotationSummary()
    if (view === "workday") return form.workdayHoursEnabled ? "Selected hours" : "Every day"
    if (view === "history") return form.historyEnabled
      ? String(form.historyWindowDays) + " days of local history" : "History off"
    if (view === "behavior") return (form.autoStart ? "Start automatically" : "Start manually") +
      " · " + (form.reducedMotion ? "reduced motion" : "motion on")
    return ""
  }

  function viewTitle() {
    if (currentView === "settings") return "Settings"
    if (currentView === "rhythm") return "Rhythm"
    if (currentView === "smart") return "Smart timing"
    if (currentView === "rotation") return "Break rotation"
    if (currentView === "workday") return "Workday"
    if (currentView === "history") return "History & privacy"
    if (currentView === "behavior") return "Behavior"
    return "Intermission"
  }

  function showView(view) {
    currentView = view
    Qt.callLater(function() {
      scroller.contentY = 0
      if (view === "daily") focusInitialAction()
      else if (backAction.visible) backAction.forceActiveFocus()
    })
  }

  function goBack() {
    showView(currentView === "settings" ? "daily" : "settings")
  }

  function resetDefaults() {
    form = Settings.formFromSettings({})
    dirty = true
    saveMessage = "Defaults ready"
  }

  function addCurrentApp() {
    if (!root.service || root.service.currentAppId === "") return
    root.setFormValue("busyAppIds", Settings.addAppId(
      root.form.busyAppIds,
      root.service.currentAppId
    ))
  }

  function setFormValues(values) {
    var next = {}
    for (var key in root.form) next[key] = root.form[key]
    for (var name in values) next[name] = values[name]
    root.form = next
    root.dirty = true
    root.saveMessage = ""
  }

  function setRoutineOrder(value) {
    root.setFormValue("routineOrder", Settings.normalizeRoutineOrder(
      value,
      root.form.customBreakItems
    ))
  }

  function addCustomRoutine() {
    var items = Array.isArray(root.form.customBreakItems)
      ? root.form.customBreakItems.slice() : []
    if (items.length >= 8) return
    var id = Settings.nextCustomRoutineId(items)
    items.push({
      id: id,
      label: "Custom break",
      instruction: "Step away for one calm moment."
    })
    var order = Array.isArray(root.form.routineOrder) ? root.form.routineOrder.slice() : []
    order.push(id)
    root.setFormValues({ customBreakItems: items, routineOrder: order })
  }

  function updateCustomRoutine(index, field, value) {
    var items = Array.isArray(root.form.customBreakItems)
      ? root.form.customBreakItems.slice() : []
    if (index < 0 || index >= items.length) return
    var item = {}
    for (var key in items[index]) item[key] = items[index][key]
    item[field] = value
    items[index] = item
    root.setFormValue("customBreakItems", items)
  }

  function removeCustomRoutine(index) {
    var items = Array.isArray(root.form.customBreakItems)
      ? root.form.customBreakItems.slice() : []
    if (index < 0 || index >= items.length) return
    var removedId = items[index].id
    items.splice(index, 1)
    var order = Array.isArray(root.form.routineOrder) ? root.form.routineOrder.slice() : []
    order = order.filter(function(key) { return key !== removedId })
    root.setFormValues({
      customBreakItems: items,
      routineOrder: Settings.normalizeRoutineOrder(order, items)
    })
  }

  function setWorkdayHours(dayKey, value) {
    var current = root.form.workdayHoursByDay || ({})
    var hours = {}
    for (var key in current) hours[key] = current[key]
    hours[dayKey] = value
    root.setFormValue("workdayHoursByDay", hours)
  }

  function formatRemaining(seconds) {
    var total = Math.max(0, Math.ceil(Number(seconds) || 0))
    var minutes = Math.floor(total / 60)
    var remainder = total % 60
    return String(minutes) + ":" + (remainder < 10 ? "0" : "") + String(remainder)
  }

  function formatAdherence(value) {
    return value === null || value === undefined ? "—" : String(value) + "%"
  }

  function toggleHistoryExport() {
    if (root.historyExportVisible) {
      root.historyExportVisible = false
      root.historyExportText = ""
      return
    }
    root.historyExportText = root.service ? root.service.historyExportText() : ""
    root.historyExportVisible = root.historyExportText !== ""
  }

  function requestHistoryReset() {
    if (!root.historyResetArmed) {
      root.historyResetArmed = true
      historyResetTimer.restart()
      return
    }
    if (root.service) root.service.clearHistory()
    root.historyResetArmed = false
    root.historyExportVisible = false
    root.historyExportText = ""
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
    root.form = Settings.formFromSettings(entry)
    root.dirty = false
    root.saveMessage = "Saved"
    savedMessageTimer.restart()
    return true
  }

  function open() {
    refreshForm()
    currentView = "daily"
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
    if (root.currentView !== "daily") {
      if (backAction.visible) backAction.forceActiveFocus()
      return
    }
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

  Timer {
    id: historyResetTimer
    interval: 5000
    onTriggered: root.historyResetArmed = false
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

          Column {
            id: dailyView
            visible: root.currentView === "daily"
            width: parent.width
            spacing: Style.space(18)

            Item {
              width: parent.width
              implicitHeight: Math.max(dailyTitle.implicitHeight, settingsAction.implicitHeight)

              Text {
                id: dailyTitle
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: "Intermission"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }

              Button {
                id: settingsAction
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                iconText: "󰒓"
                tooltipText: "Settings"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                fontSize: Style.font.body
                iconSize: Style.font.title
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(6)
                focusable: true
                Accessible.role: Accessible.Button
                Accessible.name: root.dirty ? "Settings, unsaved changes" : "Settings"
                Accessible.onPressAction: root.showView("settings")
                onClicked: root.showView("settings")
              }
            }

            PanelSeparator { foreground: root.contentForeground }

            Item {
              width: parent.width
              height: Style.space(8)
            }

            Column {
              width: parent.width
              spacing: Style.space(5)

              Text {
                id: countdown
                width: parent.width
                text: root.state.phase === "stopped" ? "—"
                  : root.state.contextDeferred ||
                    (root.state.phase === "outside" &&
                      ["warning", "deferred"].indexOf(root.state.outsideResumePhase) !== -1)
                  ? "waiting"
                  : root.formatRemaining(root.state.remainingSeconds)
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Math.max(Style.font.displayLarge, Style.space(52))
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
                Accessible.role: Accessible.StaticText
                Accessible.name: root.phaseLabel() + ", " + text
              }

              Text {
                width: parent.width
                text: root.countdownCaption()
                color: root.mutedForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
                horizontalAlignment: Text.AlignHCenter
                Accessible.role: Accessible.StaticText
                Accessible.name: text
              }
            }

            Rectangle {
              width: Math.min(parent.width, Style.space(240))
              anchors.horizontalCenter: parent.horizontalCenter
              height: Style.space(3)
              radius: height / 2
              color: Qt.rgba(
                root.contentForeground.r,
                root.contentForeground.g,
                root.contentForeground.b,
                0.14
              )

              Rectangle {
                width: parent.width * root.progressFraction()
                height: parent.height
                radius: parent.radius
                color: Color.accent
                Behavior on width {
                  enabled: !root.form.reducedMotion
                  NumberAnimation { duration: 160 }
                }
              }
            }

            Row {
              id: actionRow
              width: Math.min(parent.width, Style.space(340))
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: Style.space(8)
              readonly property int visibleCount: startBreakAction.visible ? 2 : 1
              readonly property real actionWidth: (width - spacing * (visibleCount - 1)) / visibleCount

              Button {
                id: startAction
                visible: root.state.phase === "stopped"
                width: actionRow.actionWidth
                text: "Start"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                selected: true
                bordered: true
                focusable: true
                verticalPadding: Style.space(10)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Start the break rhythm"
                Accessible.onPressAction: if (enabled && root.service) root.service.start()
                onClicked: if (root.service) root.service.start()
              }

              Button {
                id: pauseAction
                visible: ["active", "idle", "warning", "deferred"].indexOf(root.state.phase) !== -1
                width: actionRow.actionWidth
                text: "Pause"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                selected: true
                bordered: true
                focusable: true
                verticalPadding: Style.space(10)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Pause active-use timing"
                Accessible.onPressAction: if (enabled && root.service) root.service.pause()
                onClicked: if (root.service) root.service.pause()
              }

              Button {
                id: resumeAction
                visible: root.state.phase === "paused"
                width: actionRow.actionWidth
                text: "Resume"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                selected: true
                bordered: true
                focusable: true
                verticalPadding: Style.space(10)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Resume active-use timing"
                Accessible.onPressAction: if (enabled && root.service) root.service.resume()
                onClicked: if (root.service) root.service.resume()
              }

              Button {
                id: endBreakAction
                visible: root.state.phase === "break"
                width: actionRow.actionWidth
                text: "End break"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                selected: true
                bordered: true
                focusable: true
                verticalPadding: Style.space(10)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Complete the current break"
                Accessible.onPressAction: if (enabled && root.service) root.service.completeBreak("panel")
                onClicked: if (root.service) root.service.completeBreak("panel")
              }

              Button {
                id: startBreakAction
                visible: ["active", "warning", "deferred", "outside"].indexOf(root.state.phase) !== -1
                width: actionRow.actionWidth
                text: root.state.phase === "active" ? "Take a break"
                  : root.state.phase === "outside" ? "Take a break now" : "Start now"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                bordered: true
                focusable: true
                verticalPadding: Style.space(10)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Begin the pending break now"
                Accessible.onPressAction: if (enabled && root.service) root.service.startBreak()
                onClicked: if (root.service) root.service.startBreak()
              }
            }

            Row {
              visible: root.state.phase === "warning" || root.state.phase === "deferred"
              width: Math.min(parent.width, Style.space(340))
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: Style.space(8)

              Button {
                visible: root.state.phase === "warning"
                width: root.state.phase === "warning"
                  ? (parent.width - parent.spacing) / 2 : parent.width
                text: "Defer"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                bordered: true
                focusable: true
                verticalPadding: Style.space(9)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Postpone the pending break once"
                Accessible.onPressAction: if (enabled && root.service) root.service.snooze()
                onClicked: if (root.service) root.service.snooze()
              }

              Button {
                width: root.state.phase === "warning"
                  ? (parent.width - parent.spacing) / 2 : parent.width
                text: "Skip"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                bordered: true
                focusable: true
                verticalPadding: Style.space(9)
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Skip the pending break and advance the cadence"
                Accessible.onPressAction: if (enabled && root.service) root.service.skip("user")
                onClicked: if (root.service) root.service.skip("user")
              }
            }

            Button {
              visible: root.state.manualHoldRemainingSeconds > 0
              width: parent.width
              text: "End manual hold"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Return to automatic context timing now"
              Accessible.onPressAction: if (enabled && root.service) root.service.clearReminderHold()
              onClicked: if (root.service) root.service.clearReminderHold()
            }

            Text {
              width: parent.width
              text: root.smartTimingSummary()
              color: root.mutedForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.bodySmall
              horizontalAlignment: Text.AlignHCenter
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }

            PanelSeparator { foreground: root.contentForeground }

            SettingsRow {
              width: parent.width
              rowTitle: root.presetLabel() + " rhythm"
              rowSummary: ""
              targetView: "rhythm"
            }
          }

          Column {
            id: settingsHeader
            visible: root.currentView !== "daily"
            width: parent.width
            spacing: Style.space(12)

            Item {
              width: parent.width
              implicitHeight: Math.max(backAction.implicitHeight, settingsTitle.implicitHeight, saveAction.implicitHeight)

              Button {
                id: backAction
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                iconText: "󰅁"
                tooltipText: root.currentView === "settings" ? "Back to Intermission" : "Back to settings"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                iconSize: Style.font.title
                horizontalPadding: Style.space(7)
                verticalPadding: Style.space(6)
                focusable: true
                Accessible.role: Accessible.Button
                Accessible.name: tooltipText
                Accessible.onPressAction: root.goBack()
                onClicked: root.goBack()
              }

              Text {
                id: settingsTitle
                anchors.left: backAction.right
                anchors.leftMargin: Style.space(8)
                anchors.right: saveAction.left
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                text: root.viewTitle()
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
                elide: Text.ElideRight
              }

              Button {
                id: saveAction
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: root.dirty ? "Save changes" : "Saved"
                foreground: root.dirty ? root.contentForeground : root.mutedForeground
                fontFamily: root.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(6)
                bordered: root.dirty
                focusable: true
                enabled: root.dirty
                opacity: enabled ? 1.0 : 0.82
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Persist Intermission settings"
                Accessible.onPressAction: if (enabled) root.saveSettings()
                onClicked: if (enabled) root.saveSettings()
              }
            }

            PanelSeparator { foreground: root.contentForeground }
          }

          Column {
            id: settingsIndex
            visible: root.currentView === "settings"
            width: parent.width
            spacing: 0

            SettingsRow {
              width: parent.width
              rowTitle: "Rhythm"
              rowSummary: root.settingsSummary("rhythm")
              targetView: "rhythm"
            }
            SettingsRow {
              width: parent.width
              rowTitle: "Smart timing"
              rowSummary: root.settingsSummary("smart")
              targetView: "smart"
            }
            SettingsRow {
              width: parent.width
              rowTitle: "Break rotation"
              rowSummary: root.settingsSummary("rotation")
              targetView: "rotation"
            }
            SettingsRow {
              width: parent.width
              rowTitle: "Workday"
              rowSummary: root.settingsSummary("workday")
              targetView: "workday"
            }
            SettingsRow {
              width: parent.width
              rowTitle: "History & privacy"
              rowSummary: root.settingsSummary("history")
              targetView: "history"
            }
            SettingsRow {
              width: parent.width
              rowTitle: "Behavior"
              rowSummary: root.settingsSummary("behavior")
              targetView: "behavior"
            }

            Button {
              width: parent.width
              topPadding: Style.space(14)
              text: "Reset to defaults"
              foreground: root.mutedForeground
              fontFamily: root.contentFontFamily
              fontSize: Style.font.bodySmall
              leftAlign: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Prepare default settings for review before saving"
              Accessible.onPressAction: root.resetDefaults()
              onClicked: root.resetDefaults()
            }
          }

          Column {
            id: smartSettings
            visible: root.currentView === "smart"
            width: parent.width
            spacing: Style.space(14)

          Text {
            width: parent.width
            text: root.contextSummary()
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.StaticText
            Accessible.name: text
          }

          Toggle {
            width: parent.width
            label: "Defer during busy contexts"
            description: "Wait during fullscreen, stay-awake mode, or an exact app-id match."
            checked: root.form.contextDeferralEnabled
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue(
              "contextDeferralEnabled",
              !root.form.contextDeferralEnabled
            )
            Accessible.onToggleAction: if (enabled) root.setFormValue(
              "contextDeferralEnabled",
              !root.form.contextDeferralEnabled
            )
            onClicked: root.setFormValue(
              "contextDeferralEnabled",
              !root.form.contextDeferralEnabled
            )
          }

          Text {
            width: parent.width
            text: "Exact app IDs to protect (comma separated)"
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
          }

          TextField {
            id: busyAppsField
            width: parent.width
            text: root.form.busyAppIds
            placeholderText: "org.example.slides, firefox"
            foreground: root.contentForeground
            Accessible.name: "Busy-context app IDs"
            Accessible.description: "Exact app IDs only; titles and content are never inspected"
            onEditingFinished: root.setFormValue("busyAppIds", text)
          }

          Row {
            width: parent.width
            spacing: Style.space(8)

            Button {
              text: "Add current app"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              enabled: root.service && root.service.currentAppId !== ""
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Add the current app ID without reading its window title"
              Accessible.onPressAction: if (enabled) root.addCurrentApp()
              onClicked: root.addCurrentApp()
            }

            Button {
              text: "Clear app list"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              enabled: String(root.form.busyAppIds || "") !== ""
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.onPressAction: if (enabled) root.setFormValue("busyAppIds", "")
              onClicked: root.setFormValue("busyAppIds", "")
            }
          }

          Row {
            width: parent.width
            spacing: Style.space(8)

            Button {
              visible: root.state.manualHoldRemainingSeconds <= 0
              enabled: root.state.phase !== "stopped" && root.state.phase !== "break"
              text: "Hold for 30 min"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Temporarily hold due reminders for thirty minutes"
              Accessible.onPressAction: if (enabled && root.service) root.service.holdReminders(1800)
              onClicked: if (root.service) root.service.holdReminders(1800)
            }

            Button {
              visible: root.state.manualHoldRemainingSeconds > 0
              text: "End manual hold"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Return to automatic context timing now"
              Accessible.onPressAction: if (enabled && root.service) root.service.clearReminderHold()
              onClicked: if (root.service) root.service.clearReminderHold()
            }
          }

          }

          Column {
            id: rotationSettings
            visible: root.currentView === "rotation"
            width: parent.width
            spacing: Style.space(14)

          Text {
            width: parent.width
            text: "Choose which calm prompts rotate through short and long breaks."
            color: root.mutedForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Text {
            width: parent.width
            text: "Order exact IDs to include them; remove an ID to exclude it. " +
              "Built-ins: eyes, stand, stretch, hydrate."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          TextField {
            width: parent.width
            text: Array.isArray(root.form.routineOrder) ? root.form.routineOrder.join(", ") : ""
            placeholderText: "eyes, stand, stretch, hydrate"
            foreground: root.contentForeground
            Accessible.name: "Break rotation order"
            Accessible.description: "Comma-separated built-in or custom routine IDs"
            onEditingFinished: root.setRoutineOrder(text)
          }

          Repeater {
            model: Array.isArray(root.form.customBreakItems) ? root.form.customBreakItems : []

            delegate: Column {
              id: customRoutineRow
              required property var modelData
              required property int index
              width: contentColumn.width
              spacing: Style.space(6)

              Text {
                text: "Custom item · " + customRoutineRow.modelData.id
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.bodySmall
              }

              TextField {
                width: parent.width
                text: customRoutineRow.modelData.label
                maximumLength: 32
                placeholderText: "Short label"
                foreground: root.contentForeground
                Accessible.name: "Custom break label"
                onEditingFinished: root.updateCustomRoutine(customRoutineRow.index, "label", text)
              }

              TextField {
                width: parent.width
                text: customRoutineRow.modelData.instruction
                maximumLength: 80
                placeholderText: "One concise instruction"
                foreground: root.contentForeground
                Accessible.name: "Custom break instruction"
                onEditingFinished: root.updateCustomRoutine(customRoutineRow.index, "instruction", text)
              }

              Button {
                text: "Remove custom item"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                bordered: true
                focusable: true
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.onPressAction: if (enabled) root.removeCustomRoutine(customRoutineRow.index)
                onClicked: root.removeCustomRoutine(customRoutineRow.index)
              }
            }
          }

          Button {
            text: "Add custom item"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            bordered: true
            focusable: true
            enabled: !Array.isArray(root.form.customBreakItems) || root.form.customBreakItems.length < 8
            Accessible.role: Accessible.Button
            Accessible.name: text
            Accessible.description: "Add one locally stored break instruction"
            Accessible.onPressAction: if (enabled) root.addCustomRoutine()
            onClicked: root.addCustomRoutine()
          }

          }

          Column {
            id: rhythmSettings
            visible: root.currentView === "rhythm"
            width: parent.width
            spacing: Style.space(14)

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

          }

          Column {
            id: workdaySettings
            visible: root.currentView === "workday"
            width: parent.width
            spacing: Style.space(14)

          Text {
            width: parent.width
            text: root.state.phase === "outside"
              ? "Automatic timing is frozen outside the selected hours. Existing owed rest is unchanged."
              : "Automatic timing is currently inside the selected hours."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.StaticText
            Accessible.name: text
          }

          Toggle {
            width: parent.width
            label: "Only remind during selected hours"
            description: "Use one local-time window per day; off disables that day."
            checked: root.form.workdayHoursEnabled
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue(
              "workdayHoursEnabled",
              !root.form.workdayHoursEnabled
            )
            Accessible.onToggleAction: if (enabled) root.setFormValue(
              "workdayHoursEnabled",
              !root.form.workdayHoursEnabled
            )
            onClicked: root.setFormValue("workdayHoursEnabled", !root.form.workdayHoursEnabled)
          }

          Toggle {
            width: parent.width
            label: "Prompt at the end of the workday"
            description: "Open a non-blocking choice when an allowed window ends."
            checked: root.form.endOfDayPromptEnabled
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue(
              "endOfDayPromptEnabled",
              !root.form.endOfDayPromptEnabled
            )
            Accessible.onToggleAction: if (enabled) root.setFormValue(
              "endOfDayPromptEnabled",
              !root.form.endOfDayPromptEnabled
            )
            onClicked: root.setFormValue("endOfDayPromptEnabled", !root.form.endOfDayPromptEnabled)
          }

          Text {
            width: parent.width
            text: "Use HH:MM-HH:MM, including overnight windows such as 22:00-06:00, or off."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Grid {
            width: parent.width
            columns: 2
            columnSpacing: Style.space(12)
            rowSpacing: Style.space(10)

            Repeater {
              model: root.workdayRows

              delegate: Column {
                id: workdayRow
                required property var modelData
                required property int index
                width: (contentColumn.width - Style.space(12)) / 2
                spacing: Style.space(4)

                Text {
                  text: workdayRow.modelData.label
                  color: root.contentForeground
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.bodySmall
                }

                TextField {
                  width: parent.width
                  text: root.form.workdayHoursByDay
                    ? root.form.workdayHoursByDay[workdayRow.modelData.key] : "off"
                  placeholderText: "09:00-17:00"
                  maximumLength: 11
                  foreground: root.contentForeground
                  Accessible.name: workdayRow.modelData.label + " reminder hours"
                  onEditingFinished: root.setWorkdayHours(workdayRow.modelData.key, text)
                }
              }
            }
          }

          Column {
            visible: root.state.phase === "outside"
            width: parent.width
            spacing: Style.space(8)

            Button {
              width: parent.width
              text: "Continue this cycle"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Temporarily bypass workday hours until this break cycle finishes"
              Accessible.onPressAction: if (enabled && root.service) root.service.continueWorkday()
              onClicked: if (root.service) root.service.continueWorkday()
            }

            Button {
              width: parent.width
              visible: root.state.endOfDayPromptPending
              text: "Wait for next window"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.onPressAction: if (enabled && root.service) root.service.dismissEndOfDay()
              onClicked: if (root.service) root.service.dismissEndOfDay()
            }

            Button {
              width: parent.width
              text: "Stop for today"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Reset frozen progress when the next allowed window opens"
              Accessible.onPressAction: if (enabled && root.service) root.service.stopForDay()
              onClicked: if (root.service) root.service.stopForDay()
            }
          }

          }

          Column {
            id: historySettings
            visible: root.currentView === "history"
            width: parent.width
            spacing: Style.space(14)

          Toggle {
            width: parent.width
            label: "Keep private local history"
            description: "Off by default. Disabling and saving removes all retained event data."
            checked: root.form.historyEnabled
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.CheckBox
            Accessible.name: label
            Accessible.description: description
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.onPressAction: if (enabled) root.setFormValue(
              "historyEnabled",
              !root.form.historyEnabled
            )
            Accessible.onToggleAction: if (enabled) root.setFormValue(
              "historyEnabled",
              !root.form.historyEnabled
            )
            onClicked: root.setFormValue("historyEnabled", !root.form.historyEnabled)
          }

          ButtonGroup {
            visible: root.form.historyEnabled
            options: [
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" }
            ]
            value: String(root.form.historyWindowDays)
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            Accessible.role: Accessible.ComboBox
            Accessible.name: "Insight window: " + String(root.form.historyWindowDays) + " days"
            Accessible.description: "Choose a seven or fourteen day summary"
            onChanged: function(value) { root.setFormValue("historyWindowDays", Number(value)) }
          }

          Text {
            width: parent.width
            visible: !root.service || !root.service.historyReady
            text: "Local history is loading. Reminder timing is unaffected."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Text {
            width: parent.width
            visible: root.service && root.service.historyReady &&
              root.service.configuration.historyEnabled !== true
            text: root.service && !root.service.historyWritable && root.service.historyStatus !== ""
              ? root.service.historyStatus
              : root.form.historyEnabled
              ? "Save changes to begin a fresh local history."
              : "History is off; no event data is retained."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Text {
            width: parent.width
            visible: root.service && root.service.historyReady &&
              root.service.configuration.historyEnabled === true &&
              !root.service.historyRecordingAvailable
            text: root.service && root.service.historyStatus !== ""
              ? root.service.historyStatus
              : "Session recovery storage is unavailable, so new history is not being recorded."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Column {
            visible: root.service && root.service.historyReady &&
              root.service.configuration.historyEnabled === true &&
              root.service.historyRecordingAvailable
            width: parent.width
            spacing: Style.space(5)

            Text {
              width: parent.width
              text: "Today · " + String(root.todayInsights.activeMinutes) +
                " active min · " + String(root.todayInsights.supportiveBreaks) +
                " supportive breaks · " + root.formatAdherence(
                  root.todayInsights.adherencePercent
                ) + " adherence"
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }

            Text {
              width: parent.width
              text: String(root.windowInsights.days) + " days · " +
                String(root.windowInsights.activeMinutes) + " active min · " +
                root.formatAdherence(root.windowInsights.adherencePercent) +
                " adherence · " + String(root.windowInsights.continuityDays) +
                " supportive continuity days"
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }

            Text {
              width: parent.width
              text: "Deferred " + String(root.windowInsights.deferred) +
                " · skipped " + String(root.windowInsights.skipped) +
                " · early exits " + String(root.windowInsights.emergencyExit) +
                " · active days " + String(root.windowInsights.activeDays)
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.WordWrap
              Accessible.role: Accessible.StaticText
              Accessible.name: text
            }
          }

          Text {
            width: parent.width
            visible: root.form.historyEnabled
            text: "Stores only break outcomes and active-minute settlements when you stop, for up to 30 local days " +
              "(2,000 events maximum). It never stores app, window, or raw activity details."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Text {
            width: parent.width
            visible: root.form.historyEnabled
            text: "Completed and natural breaks support adherence; skips count against it. " +
              "Deferrals and early exits stay neutral. Continuity looks back from today, ignores empty days, " +
              "and forgives a skip on a day that also has a supportive break."
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Row {
            visible: root.service && root.service.historyReady &&
              root.service.configuration.historyEnabled === true
            width: parent.width
            spacing: Style.space(8)

            Button {
              text: root.historyExportVisible ? "Hide JSON export" : "Show JSON export"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              enabled: root.service && root.service.historyWritable
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: "Show a selectable machine-readable history document"
              Accessible.onPressAction: if (enabled) root.toggleHistoryExport()
              onClicked: root.toggleHistoryExport()
            }

            Button {
              text: root.historyResetArmed ? "Confirm reset" : "Reset history"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              bordered: true
              focusable: true
              Accessible.role: Accessible.Button
              Accessible.name: text
              Accessible.description: root.historyResetArmed
                ? "Confirm permanent removal of retained event data"
                : "Require a second press before clearing local history"
              Accessible.onPressAction: if (enabled) root.requestHistoryReset()
              onClicked: root.requestHistoryReset()
            }
          }

          TextEdit {
            visible: root.historyExportVisible
            width: parent.width
            height: visible ? Math.min(contentHeight, Style.space(180)) : 0
            text: root.historyExportText
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            readOnly: true
            selectByMouse: true
            wrapMode: TextEdit.WrapAnywhere
            clip: true
            Accessible.role: Accessible.StaticText
            Accessible.name: "JSON history export. Use select all and copy."
          }

          }

          Column {
            id: behaviorSettings
            visible: root.currentView === "behavior"
            width: parent.width
            spacing: Style.space(14)

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

          Text {
            visible: root.saveMessage === "Save failed"
            width: parent.width
            text: root.saveMessage
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            Accessible.role: Accessible.StaticText
            Accessible.name: text
          }

          }
        }
      }
    }
  }

  component SettingsRow: Button {
    id: settingsRow

    required property string rowTitle
    required property string rowSummary
    required property string targetView

    text: ""
    implicitHeight: rowSummary === "" ? Style.space(54) : Style.space(68)
    foreground: root.contentForeground
    fontFamily: root.contentFontFamily
    horizontalPadding: Style.space(12)
    verticalPadding: 0
    focusable: true
    leftAlign: true
    Accessible.role: Accessible.Button
    Accessible.name: rowTitle
    Accessible.description: rowSummary === "" ? "Open " + rowTitle : rowSummary
    Accessible.onPressAction: root.showView(targetView)
    onClicked: root.showView(targetView)

    Column {
      anchors.left: parent.left
      anchors.right: chevron.left
      anchors.leftMargin: Style.space(12)
      anchors.rightMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(3)

      Text {
        width: parent.width
        text: settingsRow.rowTitle
        color: root.contentForeground
        font.family: root.contentFontFamily
        font.pixelSize: Style.font.body
        font.bold: settingsRow.rowSummary === ""
        elide: Text.ElideRight
      }

      Text {
        visible: settingsRow.rowSummary !== ""
        width: parent.width
        text: settingsRow.rowSummary
        color: root.mutedForeground
        font.family: root.contentFontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }
    }

    Text {
      id: chevron
      anchors.right: parent.right
      anchors.rightMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      text: "󰅂"
      color: root.mutedForeground
      font.family: root.contentFontFamily
      font.pixelSize: Style.font.title
    }

    Rectangle {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      height: 1
      color: Qt.rgba(
        root.contentForeground.r,
        root.contentForeground.g,
        root.contentForeground.b,
        0.12
      )
    }
  }
}
