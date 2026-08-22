# Marketplace Checklist

This is a preparation document, not a submission. Repository visibility and
marketplace publication remain explicit owner decisions.

## Repository readiness

- [x] One root `manifest.json` with a permanent namespaced plugin ID
- [x] Root README with installation, use, configuration, privacy, recovery,
  disable, and removal instructions
- [x] Root MIT license and documented runtime dependencies
- [x] One original root `preview.png` below marketplace size limits
- [x] No symlinks, unexpected executable binaries, runtime downloads, remote
  services, or elevated operations
- [x] Local manifest, unit, and static shell checks pass
- [ ] QML lint passes in an Omarchy/Quickshell development environment
- [ ] Live single-display and multi-display acceptance matrix passes in an
  Omarchy/Wayland session
- [ ] Repository is public
- [ ] Owner confirms the exact commit and preview ownership for submission

## Proposed listing metadata

- Title: `[Plugin]: Intermission`
- Category: `Productivity`
- Tags: `bar`, `quickshell`, `system`
- Suggested missing tag: none
- Maintainer note: local-only break cadence; no account, telemetry, remote
  service, extra runtime package, or privileged setup

## Submission body draft

Do not submit this body until every checkbox statement is true and the owner
has approved publication.

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

### Submission checklist

- [ ] The repository is public and contains installation and removal instructions.
- [x] I have documented the plugin license and any external dependencies.
- [ ] I confirm that I own or have permission to submit this plugin and its preview assets.
- [x] The plugin does not overwrite user configuration without explicit consent.
- [x] I understand that approval is for listing and is not a security review.
```

## Owner gate

Before submission:

1. finish the real Omarchy live matrix and replace pending evidence;
2. choose whether to make the repository public;
3. review the exact commit and confirm ownership of code and preview assets;
4. rerun marketplace compatibility and static security checks on that commit;
5. show the final title and body to the owner for explicit approval;
6. only then create the marketplace issue.

No step in the current implementation changes visibility or creates a
marketplace submission.
