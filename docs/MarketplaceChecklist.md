# Marketplace Checklist

This file records repository readiness and a local snapshot of the marketplace
submission. The live marketplace issue is authoritative because labels,
validation results, and approval state can change after this file is updated.

## Submission record

- Canonical repository: [`omacom/omarchy-plugin-marketplace`](https://github.com/omacom/omarchy-plugin-marketplace)
- Canonical submission guide: [`SUBMISSION.md`](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SUBMISSION.md)
- Active request: [`omacom/omarchy-plugin-marketplace#3598`](https://github.com/omacom/omarchy-plugin-marketplace/issues/3598)
- Superseded wrong-repository request: [`omacom/omarchy#7813`](https://github.com/omacom/omarchy/issues/7813)
- Submitted: 2026-08-30
- Validated commit: `12e353f3174c3fa7d34b3011ac2e9a6eafc4b899`
- Last checked: 2026-08-30
- Status at last check: open with `submission` and `validated` labels;
  Quattro compatibility and the automated security baseline passed; awaiting
  maintainer `approved-and-verified` approval before listing

## Repository readiness

- [x] One root `manifest.json` with a permanent namespaced plugin ID
- [x] Root README with installation, use, configuration, privacy, recovery,
  disable, and removal instructions
- [x] Root MIT license and documented runtime dependencies
- [x] One original root `preview.png` below marketplace size limits
- [x] No symlinks, unexpected executable binaries, runtime downloads, remote
  services, or elevated operations
- [x] Local manifest, unit, and static shell checks pass
- [x] QML lint passes in an Omarchy/Quickshell development environment
- [ ] Live single-display and multi-display acceptance matrix passes in an
  Omarchy/Wayland session
- [x] Repository is public
- [x] Owner confirms the exact commit and preview ownership for submission

## Submitted listing metadata

- Title: `[Plugin]: Intermission`
- Category: `Productivity`
- Tags: `bar`, `quickshell`, `system`
- Suggested missing tag: none
- Maintainer note: local-only break cadence; no account, telemetry, remote
  service, extra runtime package, or privileged setup

## Submitted body

```markdown
### Repository URL

https://github.com/AndyBoWu/Intermission

### Category

Productivity

### Tags

bar, quickshell, system

### Suggest a missing tag

_No response_

### Maintainer notes

Local-only break cadence with no account, telemetry, remote service, extra
runtime package, or privileged setup.

Supersedes https://github.com/omacom/omarchy/issues/7813, which was opened in
the wrong repository.

### Submission checklist

- [x] The repository is public and contains installation and removal instructions.
- [x] I have documented the plugin license and any external dependencies.
- [x] I confirm that I own or have permission to submit this plugin and its preview assets.
- [x] The plugin does not overwrite user configuration without explicit consent.
- [x] I understand that approval is for listing and is not a security review.
```

## Submission safeguards

For any future listing or verification request:

1. read the current canonical marketplace submission guide;
2. resolve and verify the exact target repository and issue form instead of
   inferring them from the Omarchy product repository;
3. finish the relevant real Omarchy acceptance matrix and update release
   evidence;
4. confirm public visibility, install/remove links, the exact protected `main`
   commit, and ownership of code and preview assets;
5. show the exact final title, body, and every attestation to the owner for
   explicit approval;
6. create the request only in the verified target repository;
7. read the request back immediately and confirm that the expected submission
   label, compatibility report, and security-baseline report appear;
8. update the submission record above while treating the live issue as the
   authoritative status.
