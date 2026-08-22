import QtQuick
import qs.Ui

BarWidget {
  id: root
  moduleName: "io.github.andybowu.intermission"

  readonly property var intermissionService: bar && bar.shell
    ? bar.shell.serviceFor(moduleName)
    : null

  function open() {
    if (bar && bar.shell) bar.shell.summon(moduleName, "{}")
  }

  function close() {
    if (bar && bar.shell) bar.shell.hide(moduleName)
  }

  function toggle() {
    if (bar && bar.shell) bar.shell.toggle(moduleName, "{}")
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰏤"
    tooltipText: "Intermission"
    enabled: root.intermissionService && root.intermissionService.ready

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
    }
  }
}
