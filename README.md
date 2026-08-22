# Intermission

A calm, idle-aware break coach for Omarchy Quattro.

Intermission counts active use instead of wall-clock time, recognizes natural
breaks, and can place a clear pause surface on every display when a reminder
becomes due. It stays local, has no account or network service, and always
provides an immediate way back to the desktop.

![Intermission overlay preview](preview.png)

> The repository is currently private. Installation requires GitHub access
> until the owner makes a separate visibility decision.

## Requirements

- Omarchy with the Quattro shell plugin system
- Git access to this repository
- no additional runtime packages or background services

Plugins run inside the long-lived shell process and are not sandboxed. Review
the source before enabling any third-party plugin.

## Install

With SSH access to the private repository:

```sh
omarchy plugin add git@github.com:AndyBoWu/Intermission.git --enable
```

If the repository is made public later, HTTPS installation can be used:

```sh
omarchy plugin add https://github.com/AndyBoWu/Intermission.git --enable
```

The plugin adds one Intermission chip to the configured bar section. No user
configuration is overwritten without the normal Omarchy enable/save flow.

## Use

- Select the bar chip to open controls and settings.
- Start, pause, resume, begin a break, defer, or skip from the panel.
- A due break opens on every connected display. Only the focused display owns
  keyboard focus.
- Use the visible **End break** control, press Enter on that control, or hold
  Escape for the configured safety interval to exit.
- Qualifying idle time can satisfy a pending break without showing a stale
  overlay when activity resumes.

## Configure

Open the bar panel, change the settings, then select **Save changes**. Named
cadence presets update both work intervals, both break durations, and the
short-cycle count together; changing one of those values creates a custom
rhythm.

Defaults:

| Setting | Default |
| --- | ---: |
| Work before a short break | 20 minutes |
| Work before a long break | 20 minutes |
| Short break | 20 seconds |
| Short cycles before a long break | 4 |
| Long break | 3 minutes |
| Advance warning | 30 seconds |
| Quick defer | 5 minutes |
| Natural-break idle threshold | 2 minutes |
| Escape hold | 3 seconds |

Reduced motion removes Intermission's progress transition. The interface uses
the active Omarchy theme and keeps pointer and keyboard controls available.

The complete field ranges and migration behavior are in
[Runtime and IPC Contracts](docs/Contracts.md).

## Privacy and permissions

Intermission:

- stores settings in the normal Omarchy inline plugin configuration;
- stores one runtime recovery snapshot under the user's XDG state directory;
- does not send telemetry or make runtime network requests;
- does not record window titles, typed content, screenshots, audio, camera
  input, or browsing history;
- does not install a system service or request elevated privileges.

The runtime snapshot contains only cadence state and timestamps. Its default
location is:

```text
${XDG_STATE_HOME:-~/.local/state}/intermission/session.json
```

## Recovery

Valid recent snapshots restore the active cadence without counting shell
downtime as active use. Expired breaks complete without replaying, while
corrupt, future, or stale snapshots recover to a safe stopped state.

If recovery remains unexpected:

1. Disable the plugin.
2. Move `session.json` out of the state directory shown above.
3. Enable the plugin and start a fresh cadence.

The original file can be moved back for diagnosis while the plugin is
disabled. See the [Acceptance Guide](docs/Acceptance.md) for disposable-state
testing instructions.

## Disable or remove

Disable Intermission while keeping its checkout and settings:

```sh
omarchy plugin disable io.github.andybowu.intermission
```

Remove the installed checkout:

```sh
omarchy plugin remove io.github.andybowu.intermission
```

Removal unloads the plugin but intentionally leaves the local recovery
snapshot. Delete or archive that file separately if no cadence recovery data
should remain.

## Verify

The portable local and static checks are:

```sh
npm test
npm run test:shell
npm run audit:release
```

The remaining checks require an Omarchy/Quickshell development environment:

```sh
npm run lint:qml
npm run test:live
```

Run the live test only from an Omarchy session where this checkout is already
installed and enabled. Current release evidence and environment limits are
recorded in [Release Evidence](docs/ReleaseEvidence.md).

## Documentation

- [Planning Document](docs/Planning.md) — product scope, milestones, and tickets
- [Runtime and IPC Contracts](docs/Contracts.md) — settings, state, recovery, and commands
- [Acceptance Guide](docs/Acceptance.md) — local checks, live scenarios, and visual evidence
- [Marketplace Checklist](docs/MarketplaceChecklist.md) — owner-gated publication preparation

## License

[MIT](LICENSE) © 2026 Andy Wu.
