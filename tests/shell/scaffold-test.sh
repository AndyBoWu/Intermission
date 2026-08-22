#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/../.." && pwd)
OMARCHY_ROOT=${OMARCHY_PATH:-}

fail() {
  echo "scaffold-test: $*" >&2
  exit 1
}

if [[ -z $OMARCHY_ROOT && -f $PROJECT_ROOT/../omarchy-core/bin/omarchy-plugin-validate ]]; then
  OMARCHY_ROOT=$(cd "$PROJECT_ROOT/../omarchy-core" && pwd)
fi

[[ -n $OMARCHY_ROOT ]] || fail "set OMARCHY_PATH to an Omarchy checkout"
[[ -f $OMARCHY_ROOT/bin/omarchy-plugin-validate ]] || fail "Omarchy plugin validator not found under $OMARCHY_ROOT"
command -v jq >/dev/null 2>&1 || fail "jq is required"

bash "$OMARCHY_ROOT/bin/omarchy-plugin-validate" "$PROJECT_ROOT"

manifest_count=$(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o -name manifest.json -type f -print | wc -l | tr -d ' ')
[[ $manifest_count == 1 ]] || fail "expected exactly one manifest.json, found $manifest_count"

for required in README.md LICENSE; do
  [[ -f $PROJECT_ROOT/$required ]] || fail "missing root $required"
done

plugin_id=$(jq -r '.id' "$PROJECT_ROOT/manifest.json")
[[ $plugin_id == io.github.andybowu.intermission ]] || fail "unexpected plugin id: $plugin_id"
jq -e '.barWidget.allowMultiple == false' "$PROJECT_ROOT/manifest.json" >/dev/null

for mapping in service:service bar-widget:barWidget overlay:overlay; do
  kind=${mapping%%:*}
  entry_key=${mapping##*:}
  jq -e --arg kind "$kind" '.kinds | index($kind) != null' "$PROJECT_ROOT/manifest.json" >/dev/null
  entry_path=$(jq -r --arg key "$entry_key" '.entryPoints[$key] // empty' "$PROJECT_ROOT/manifest.json")
  [[ -n $entry_path && -f $PROJECT_ROOT/$entry_path ]] || fail "$kind entry point is missing"
done

link=$(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o -type l -print -quit)
[[ -z $link ]] || fail "symlinks are not allowed: $link"

grep -Eq 'function[[:space:]]+open\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay open lifecycle is missing"
grep -Eq 'function[[:space:]]+close\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay close lifecycle is missing"
grep -Eq 'function[[:space:]]+status\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay status probe is missing"
grep -Eq 'function[[:space:]]+open\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar open lifecycle is missing"
grep -Eq 'function[[:space:]]+close\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar close lifecycle is missing"
grep -Eq 'function[[:space:]]+toggle\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar toggle lifecycle is missing"

runtime_files=(
  "$PROJECT_ROOT/manifest.json"
  "$PROJECT_ROOT/Service.qml"
  "$PROJECT_ROOT/BarWidget.qml"
  "$PROJECT_ROOT/Overlay.qml"
)
[[ ! -f $PROJECT_ROOT/lib/Engine.js ]] || runtime_files+=("$PROJECT_ROOT/lib/Engine.js")
[[ ! -f $PROJECT_ROOT/lib/Settings.js ]] || runtime_files+=("$PROJECT_ROOT/lib/Settings.js")
[[ ! -f $PROJECT_ROOT/lib/BreakViewModel.js ]] || runtime_files+=("$PROJECT_ROOT/lib/BreakViewModel.js")
[[ ! -f $PROJECT_ROOT/lib/StateStore.js ]] || runtime_files+=("$PROJECT_ROOT/lib/StateStore.js")
[[ ! -f $PROJECT_ROOT/lib/History.js ]] || runtime_files+=("$PROJECT_ROOT/lib/History.js")
[[ ! -f $PROJECT_ROOT/Panel.qml ]] || runtime_files+=("$PROJECT_ROOT/Panel.qml")

if grep -Eni '(^|[^[:alnum:]_])(sudo|systemctl|curl|wget)([^[:alnum:]_]|$)|https?://|execDetached|Process[[:space:]]*\{' "${runtime_files[@]}"; then
  fail "runtime scaffold contains a prohibited dependency"
fi

grep -Eq 'IdleMonitor[[:space:]]*\{' "$PROJECT_ROOT/Service.qml" \
  || fail "service must use the compositor idle monitor"
grep -Eq 'respectInhibitors:[[:space:]]*true' "$PROJECT_ROOT/Service.qml" \
  || fail "idle monitoring must respect inhibitors"
grep -Eq 'ToplevelManager\.activeToplevel' "$PROJECT_ROOT/Service.qml" \
  || fail "context timing must use the current Wayland toplevel"
grep -Eq 'activeToplevel\.appId' "$PROJECT_ROOT/Service.qml" \
  || fail "selected-app matching must use an app id"
grep -Eq 'activeToplevel\.fullscreen|focusedWorkspace\.hasFullscreen' "$PROJECT_ROOT/Service.qml" \
  || fail "context timing must observe focused fullscreen state"
grep -Eq 'firstPartyServiceFor\("omarchy\.idle"\)' "$PROJECT_ROOT/Service.qml" \
  || fail "presentation timing must honor the host stay-awake mode"
if grep -Eq 'activeToplevel\.title|\.windowTitle' "$PROJECT_ROOT/Service.qml"; then
  fail "context timing must not read window titles"
fi
grep -Eq 'Engine\.activitySignal' "$PROJECT_ROOT/Service.qml" \
  || fail "service must route idle signals through the pure engine"
grep -Eq 'Engine\.heartbeat' "$PROJECT_ROOT/Service.qml" \
  || fail "service must route timer gaps through the pure engine"
grep -Eq 'SystemClock[[:space:]]*\{' "$PROJECT_ROOT/Service.qml" \
  || fail "workday policy must follow the live local clock"
grep -Eq 'Date\.timeZoneUpdated' "$PROJECT_ROOT/Service.qml" \
  || fail "workday policy must refresh after a timezone change"
grep -Eq 'StateStore\.historyPath' "$PROJECT_ROOT/Service.qml" \
  || fail "private insights must use a separate XDG history path"
grep -Eq 'History\.appendEffects' "$PROJECT_ROOT/Service.qml" \
  || fail "service must record bounded history through the pure history model"
grep -Eq 'function exportHistory\(payloadJson: string\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service IPC must expose a machine-readable history export"

[[ -f $PROJECT_ROOT/Panel.qml ]] || fail "bar control panel is missing"
grep -Eq 'Qt\.resolvedUrl\("Panel\.qml"\)' "$PROJECT_ROOT/BarWidget.qml" \
  || fail "bar widget must own one nested panel loader"
grep -Eq 'KeyboardPanel[[:space:]]*\{' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must use the keyboard-capable host"
grep -Eq 'Keys\.onEscapePressed:[[:space:]]*root\.close' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose Escape close"
grep -Eq 'updateEntryInline' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must persist inline settings"
grep -Eq 'ButtonGroup[[:space:]]*\{' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose cadence presets"
grep -Eq 'shortWorkIntervalSeconds' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose the short work interval"
grep -Eq 'longWorkIntervalSeconds' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose the long work interval"
grep -Eq 'contextDeferralEnabled' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose context deferral"
grep -Eq 'busyAppIds' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose exact app-id controls"
grep -Eq 'holdReminders\(1800\)' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose a bounded manual hold"
grep -Eq 'routineOrder' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose break rotation ordering"
grep -Eq 'customBreakItems' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose local custom break items"
grep -Eq 'workdayHoursByDay' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose daily reminder windows"
grep -Eq 'continueWorkday\(\)' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose a reversible workday override"
grep -Eq 'historyEnabled' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose opt-in local history"
grep -Eq 'clearHistory\(\)' "$PROJECT_ROOT/Panel.qml" \
  || fail "control panel must expose explicit local-history reset"
grep -Eq 'summonBarWidget' "$PROJECT_ROOT/Service.qml" \
  || fail "service showPanel must route to a live bar widget"
grep -Eq 'function stableIpcError\(error\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service IPC must normalize internal errors"
grep -Eq 'function showPanel\(payloadJson: string\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service IPC must expose showPanel"

grep -Eq 'model:[[:space:]]*root\.opened[[:space:]]*\?[[:space:]]*Quickshell\.screens' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must create one surface per current screen"
grep -Eq 'PanelWindow[[:space:]]*\{' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must use a layer-shell window per screen"
grep -Eq 'WlrKeyboardFocus\.Exclusive' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must expose its keyboard controls"
grep -Eq 'Keys\.onPressed:[[:space:]]*function\(event\)' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must capture the safety keyboard path"
grep -Eq 'root\.beginEscapeHold\(\)' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must require a deliberate Escape hold"
grep -Eq 'outcome\.stateCompleted !== true' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must remain visible when emergency state recovery fails"
grep -Eq 'root\.service\.completeBreak\("overlay"\)' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay completion must route through the service"
grep -Eq 'root\.shell\.hide\(root\.moduleName\)' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay close must clear shell loader state"
grep -Eq 'root\.shell\.summon\(root\.moduleName,[[:space:]]*"\{\}"\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service must summon the break overlay"
grep -Eq 'function openOverlay\(payloadJson: string\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service IPC must expose overlay open"
grep -Eq 'function hideOverlay\(payloadJson: string\)' "$PROJECT_ROOT/Service.qml" \
  || fail "service IPC must expose overlay hide"
grep -Eq 'atomicWrites:[[:space:]]*true' "$PROJECT_ROOT/Service.qml" \
  || fail "runtime snapshots must use atomic writes"
grep -Eq 'blockWrites:[[:space:]]*true' "$PROJECT_ROOT/Service.qml" \
  || fail "shutdown snapshot writes must finish before teardown"
[[ $(grep -Ec 'atomicWrites:[[:space:]]*true' "$PROJECT_ROOT/Service.qml") -ge 2 ]] \
  || fail "session and history files must both use atomic writes"
grep -A2 'onSaveFailed: function(error)' "$PROJECT_ROOT/Service.qml" \
  | grep -Eq 'snapshotWritable[[:space:]]*=[[:space:]]*false' \
  || fail "session save failure must disable dependent history writes"
grep -Eq 'StateStore\.sessionPath' "$PROJECT_ROOT/Service.qml" \
  || fail "runtime snapshots must use the versioned state-store path"
grep -Eq 'Accessible\.onPressAction:.*root\.toggle\(\)' "$PROJECT_ROOT/BarWidget.qml" \
  || fail "bar widget must expose an accessible activation action"
grep -Eq 'Accessible\.onPressAction:.*root\.requestComplete\(\)' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay completion must expose an accessible action"
grep -Eq 'enabled:[[:space:]]*!root\.reducedMotion' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay progress must honor reduced motion"
grep -Eq 'Accessible\.role:[[:space:]]*Accessible\.ComboBox' "$PROJECT_ROOT/Panel.qml" \
  || fail "cadence presets must expose an accessible selector"
grep -Eq 'Accessible\.onIncreaseAction:.*root\.shiftPreset\(1\)' "$PROJECT_ROOT/Panel.qml" \
  || fail "cadence presets must expose accessible selection actions"
grep -Eq 'BreakView\.presentation' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must use the break presentation model"
grep -Eq 'service[[:space:]]*\?[[:space:]]*service\.configuration' "$PROJECT_ROOT/Overlay.qml" \
  || fail "overlay must render the configured break rotation"

echo "ok - scaffold contract"
