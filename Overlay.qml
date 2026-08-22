import QtQuick

Item {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null
  property var service: null
  property var barWidgetRegistry: null
  property var pluginRegistry: null

  property bool opened: false

  function open(payloadJson) {
    root.opened = true
  }

  function close() {
    root.opened = false
  }

  function status() {
    return root.opened ? "open" : "closed"
  }
}
