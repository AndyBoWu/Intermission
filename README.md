# Intermission

A calm, idle-aware break coach for Omarchy Quattro.

Intermission helps people step away before a long stretch of computer work
turns into eye strain or physical fatigue. It counts active use rather than
wall-clock time, recognizes natural breaks, and can cover every display with a
short, accessible pause when a reminder alone is not enough.

## Documentation

- [Planning Document](docs/Planning.md) — product scope, milestones, and tickets
- [Runtime and IPC Contracts](docs/Contracts.md) — settings, state, recovery, and commands
- [Acceptance Guide](docs/Acceptance.md) — local checks, live scenarios, and visual evidence

## Verify

```sh
npm test
npm run test:shell
npm run lint:qml
```

Run `npm run test:live` only from an Omarchy session where the current plugin
checkout is already installed and enabled.
