# Intermission

[![CI](https://github.com/AndyBoWu/Intermission/actions/workflows/ci.yml/badge.svg)](https://github.com/AndyBoWu/Intermission/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AndyBoWu/Intermission/actions/workflows/codeql.yml/badge.svg)](https://github.com/AndyBoWu/Intermission/actions/workflows/codeql.yml)
[![Compatibility](https://github.com/AndyBoWu/Intermission/actions/workflows/compatibility.yml/badge.svg)](https://github.com/AndyBoWu/Intermission/actions/workflows/compatibility.yml)
[![Security](https://github.com/AndyBoWu/Intermission/actions/workflows/security.yml/badge.svg)](https://github.com/AndyBoWu/Intermission/actions/workflows/security.yml)
[![Release](https://github.com/AndyBoWu/Intermission/actions/workflows/release.yml/badge.svg)](https://github.com/AndyBoWu/Intermission/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/AndyBoWu/Intermission)](LICENSE)

Intermission is a local-only Omarchy Quattro plugin that tracks active use and
shows a break overlay when needed.

![Intermission overlay preview](preview.png)

## Install

```sh
omarchy plugin add https://github.com/AndyBoWu/Intermission.git --enable
```

SSH: `omarchy plugin add git@github.com:AndyBoWu/Intermission.git --enable`

## Use

- Start, pause, resume, defer, skip, or end breaks from the bar control panel.
- A due break opens on every display; focus remains on the active one.
- Escape (hold) and **End break** both dismiss the overlay.
- Natural idle time can satisfy a pending break without flashing a stale overlay.
- Breaks can be deferred during busy contexts or blocked windows.

## Configure

- Preset/cycle settings (work and break timing) are on one panel.
- Break rotation supports built-in prompts and up to 8 local custom prompts.
- Optional:
  - per-weekday reminder window (`off`, `HH:MM-HH:MM`, overnight supported),
  - end-of-day policy,
  - local history.
- Plugin ID: `io.github.andybowu.intermission`

## Privacy and local state

No telemetry or remote service calls.

- Settings: normal Omarchy inline plugin config.
- Recovery snapshot: `${XDG_STATE_HOME:-~/.local/state}/intermission/session.json`
- Optional local history: `${XDG_STATE_HOME:-~/.local/state}/intermission/history.json`

History is bounded (30 days max, 2,000 events, 1 MiB) and contains no app IDs or
raw activity timelines.

## Verify

```sh
npm run check:portable
npm run lint:qml
npm run test:compatibility
npm run test:live
```

## Docs

- [Contracts](docs/Contracts.md)
- [Acceptance Guide](docs/Acceptance.md)
- [Automation Security](docs/AutomationSecurity.md)
- [Governance](docs/Governance.md)
- [Release Process](docs/Releasing.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT © 2026 Andy Wu.
