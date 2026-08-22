import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "BreakViewModel.js" as BreakView

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var service: null
  property var barWidgetRegistry: null
  property var pluginRegistry: null

  readonly property string moduleName: "io.github.andybowu.intermission"
  property bool opened: false
  property bool focusReady: false
  property string focusScreenName: ""
  property bool escapeHolding: false
  property double escapeHoldStartedAtEpochMs: 0
  property real escapeHoldProgress: 0
  readonly property int escapeHoldSeconds: service && service.configuration
    ? Number(service.configuration.escapeHoldSeconds) || 3 : 3
  readonly property int escapeHoldMs: escapeHoldSeconds * 1000
  readonly property bool reducedMotion: service && service.configuration
    ? service.configuration.reducedMotion === true : false
  readonly property var state: service && service.ready
    ? service.publicState
    : ({ phase: "stopped", breakKind: "short", cycleIndex: 0, remainingSeconds: 0, paused: false })
  readonly property var presentation: BreakView.presentation(state.breakKind, state.cycleIndex)
  readonly property int totalSeconds: BreakView.totalSeconds(
    state.breakKind,
    service ? service.settings : ({})
  )
  readonly property real remainingFraction: BreakView.remainingFraction(
    state.remainingSeconds,
    totalSeconds
  )

  onFocusScreenNameChanged: cancelEscapeHold()

  function open(payloadJson) {
    root.cancelEscapeHold()
    root.reconcileFocusScreen(true)
    root.focusReady = false
    root.opened = true
    focusPrimeTimer.restart()
    if (root.service && "overlayOpen" in root.service) root.service.overlayOpen = true
  }

  function close() {
    root.cancelEscapeHold()
    focusPrimeTimer.stop()
    root.focusReady = false
    root.opened = false
    if (root.service && "overlayOpen" in root.service) root.service.overlayOpen = false
  }

  function status() {
    return root.opened ? "open" : "closed"
  }

  function requestClose() {
    if (root.shell && typeof root.shell.hide === "function" && root.shell.hide(root.moduleName)) return
    root.close()
  }

  function requestComplete() {
    if (root.service && root.state.phase === "break")
      root.service.completeBreak("overlay")
    root.requestClose()
  }

  function beginEscapeHold() {
    if (!root.opened || root.escapeHolding) return
    root.escapeHolding = true
    root.escapeHoldProgress = 0
    root.escapeHoldStartedAtEpochMs = Date.now()
    escapeHoldTimer.start()
  }

  function cancelEscapeHold() {
    escapeHoldTimer.stop()
    root.escapeHolding = false
    root.escapeHoldProgress = 0
    root.escapeHoldStartedAtEpochMs = 0
  }

  function finishEmergencyExit() {
    escapeHoldTimer.stop()
    root.escapeHolding = false
    root.escapeHoldProgress = 1
    var outcome = root.service && typeof root.service.emergencyExit === "function"
      ? root.service.emergencyExit() : null
    if (!outcome || outcome.stateCompleted !== true) {
      root.escapeHoldProgress = 0
      return
    }
    if (outcome.overlayHidden !== true) root.requestClose()
  }

  function reconcileFocusScreen(preferFocused) {
    var screens = Quickshell.screens || []
    var screenNames = []
    for (var i = 0; i < screens.length; i++) {
      if (screens[i]) screenNames.push(String(screens[i].name || ""))
    }
    var focusedMonitor = Hyprland.focusedMonitor
    var focusedName = focusedMonitor ? String(focusedMonitor.name || "") : ""
    root.focusScreenName = BreakView.focusScreenName(
      screenNames,
      root.focusScreenName,
      focusedName,
      preferFocused === true
    )
  }

  Component.onDestruction: {
    if (root.service && "overlayOpen" in root.service) root.service.overlayOpen = false
  }

  Timer {
    id: focusPrimeTimer
    interval: 0
    onTriggered: if (root.opened) root.focusReady = true
  }

  Timer {
    id: escapeHoldTimer
    interval: 50
    repeat: true
    onTriggered: {
      var elapsed = Math.max(0, Date.now() - root.escapeHoldStartedAtEpochMs)
      root.escapeHoldProgress = Math.min(1, elapsed / root.escapeHoldMs)
      if (root.escapeHoldProgress >= 1) root.finishEmergencyExit()
    }
  }

  Connections {
    target: Quickshell
    function onScreensChanged() {
      root.cancelEscapeHold()
      root.reconcileFocusScreen(false)
      if (root.opened) focusPrimeTimer.restart()
    }
  }

  Variants {
    model: root.opened ? Quickshell.screens : []

    delegate: Component {
      PanelWindow {
        id: overlayWindow
        required property var modelData
        readonly property bool compact: width < Style.space(720) || height < Style.space(720)

        screen: modelData
        visible: root.opened && !remapGuard.remapping
        color: Color.background
        exclusionMode: ExclusionMode.Ignore

        WlrLayershell.namespace: "intermission-break"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: root.focusReady &&
          String(modelData.name || "") === root.focusScreenName
          ? WlrKeyboardFocus.Exclusive
          : WlrKeyboardFocus.None

        anchors {
          top: true
          bottom: true
          left: true
          right: true
        }

        function primeKeyboardFocus() {
          if (!visible || !root.focusReady ||
              String(modelData.name || "") !== root.focusScreenName) return
          Qt.callLater(function() {
            if (overlayWindow.visible && root.focusReady) finishButton.forceActiveFocus()
          })
        }

        onVisibleChanged: {
          if (!visible) root.cancelEscapeHold()
          primeKeyboardFocus()
        }

        Connections {
          target: root
          function onFocusReadyChanged() { overlayWindow.primeKeyboardFocus() }
          function onFocusScreenNameChanged() { overlayWindow.primeKeyboardFocus() }
        }

        ScreenMoveRemap {
          id: remapGuard
          window: overlayWindow
        }

        FocusScope {
          id: focusScope
          anchors.fill: parent
          focus: true
          Keys.priority: Keys.BeforeItem
          Keys.onPressed: function(event) {
            if (event.key !== Qt.Key_Escape) return
            event.accepted = true
            if (!event.isAutoRepeat) root.beginEscapeHold()
          }
          Keys.onReleased: function(event) {
            if (event.key !== Qt.Key_Escape) return
            event.accepted = true
            if (!event.isAutoRepeat && root.escapeHolding) root.cancelEscapeHold()
          }

          Rectangle {
            anchors.fill: parent
            color: Color.background
          }

          Text {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.margins: overlayWindow.compact ? Style.space(18) : Style.space(36)
            text: "Intermission"
            color: Color.foreground
            opacity: 0.72
            font.family: Style.font.family
            font.pixelSize: Style.font.title
          }

          Item {
            id: stage
            anchors.centerIn: parent
            width: Math.min(parent.width - Style.space(48), Style.space(760))
            height: Math.min(parent.height - Style.space(96), Style.space(620))

            Rectangle {
              id: outerHalo
              anchors.horizontalCenter: parent.horizontalCenter
              anchors.top: parent.top
              width: overlayWindow.compact
                ? Math.min(stage.width * 0.48, stage.height * 0.4)
                : Math.min(stage.width * 0.62, stage.height * 0.62)
              height: width
              radius: width / 2
              color: "transparent"
              border.width: Math.max(1, Style.spacing.scale)
              border.color: Color.muted
              opacity: 0.34
            }

            Rectangle {
              anchors.centerIn: outerHalo
              width: outerHalo.width * 0.78
              height: width
              radius: width / 2
              color: "transparent"
              border.width: Math.max(1, Style.spacing.scale)
              border.color: Color.accent
              opacity: 0.72
            }

            Column {
              anchors.horizontalCenter: outerHalo.horizontalCenter
              anchors.verticalCenter: outerHalo.verticalCenter
              width: outerHalo.width * 0.92
              spacing: Style.space(12)

              Text {
                width: parent.width
                text: root.presentation.eyebrow
                color: Color.foreground
                opacity: 0.78
                font.family: Style.font.family
                font.pixelSize: Style.font.subtitle
                horizontalAlignment: Text.AlignHCenter
              }

              Text {
                id: countdownText
                width: parent.width
                text: BreakView.formatRemaining(root.state.remainingSeconds)
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Math.max(
                  Style.font.displayLarge,
                  Math.min(overlayWindow.compact ? Style.space(64) : Style.space(108), outerHalo.width * 0.24)
                )
                horizontalAlignment: Text.AlignHCenter
                Accessible.role: Accessible.StaticText
                Accessible.name: "Break time remaining " + text
              }

              Text {
                width: parent.width
                text: root.presentation.title
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.heading
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
              }
            }

            Column {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              spacing: overlayWindow.compact ? Style.space(10) : Style.space(20)

              Text {
                width: parent.width
                text: root.presentation.instruction
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: overlayWindow.compact ? Style.font.heading : Style.font.display
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                Accessible.role: Accessible.StaticText
                Accessible.name: root.presentation.title + ". " + text
              }

              Rectangle {
                width: parent.width
                height: Math.max(2, Style.spacing.scale * 2)
                radius: height / 2
                color: Color.muted
                opacity: 0.4

                Rectangle {
                  width: parent.width * root.remainingFraction
                  height: parent.height
                  radius: parent.radius
                  color: Color.accent

                  Behavior on width {
                    enabled: !root.reducedMotion
                    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
                  }
                }
              }

              Button {
                id: finishButton
                anchors.horizontalCenter: parent.horizontalCenter
                text: "End break"
                iconText: "󰅖"
                foreground: Color.foreground
                fontFamily: Style.font.family
                fontSize: overlayWindow.compact ? Style.font.body : Style.font.heading
                horizontalPadding: overlayWindow.compact ? Style.space(16) : Style.space(24)
                verticalPadding: overlayWindow.compact ? Style.space(8) : Style.space(12)
                bordered: true
                focusable: true
                Accessible.role: Accessible.Button
                Accessible.name: text
                Accessible.description: "Complete the current break and return to the active interval"
                Accessible.onPressAction: if (enabled) root.requestComplete()
                onClicked: root.requestComplete()
              }

              Text {
                width: parent.width
                text: root.escapeHolding
                  ? "Keep holding Escape · " + Math.round(root.escapeHoldProgress * 100) + "%"
                  : "Enter to finish · Hold Esc for " + root.escapeHoldSeconds + " seconds to exit"
                color: Color.foreground
                opacity: 0.72
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                horizontalAlignment: Text.AlignHCenter
                Accessible.role: Accessible.StaticText
                Accessible.name: text
              }
            }
          }

        }

        Component.onCompleted: primeKeyboardFocus()
      }
    }
  }
}
