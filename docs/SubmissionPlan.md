# Intermission Submission and QA Plan

Date: 2026-08-22

Goal: finish the current release-readiness path after the live lifecycle fix
(`9d7dee6`) and move toward a marketplace-ready submission.

## Current status

- Plugin branch state: `main` includes commit `9d7dee6`.
- Local checks already executed: unit, shell scaffold, compatibility,
  release-asset, release-audit, and static checks.
- Remaining hard dependency: `npm run test:live` requires a live Omarchy Wayland
  session and cannot be completed in a plain terminal container.

## Scope of this plan

1. finish environment-limited proof points that are still open;
2. decide and prepare listing metadata/assets;
3. finalize evidence for release and marketplace owner gates;
4. prepare versioned release action only when all gates are explicitly approved.

## Execution checklist

1. **Live QA in Omarchy**
   - run `npm run test:live` on a real session and capture pass output.
   - run a manual live matrix: single-display and multi-display scenarios from
     `docs/Acceptance.md` using your real monitor layout.
2. **Submission visuals**
   - confirm `preview.png` is final and follows the target dimensions.
   - confirm any planned store listing media is present and owned by the project.
3. **Repository/publication gates**
   - owner confirms repository visibility decision and commit ownership.
   - set repository public only if owner policy allows.
4. **Evidence completion**
   - add local QA evidence row + live QA evidence rows in
     `docs/ReleaseEvidence.md` and `docs/Acceptance.md` record tables.
   - add a one-line QA summary for the `test:live` pass/fail status.
5. **Release lockstep**
   - update `manifest.json` and `package.json` together if version changes are
     required.
   - rerun `npm run check` and `npm run test:release` at the exact release commit.
6. **Marketplace submission prep**
   - complete `docs/MarketplaceChecklist.md` owner-gated items (public status,
     live evidence links, ownership confirmation, commit verification).
   - keep final marketplace body draft in `docs/MarketplaceChecklist.md` for review.

## Risks and blockers

- No local environment can verify Wayland overlay behavior, hot-reload paths, and
  real input/monitor transitions.
- Marketplace publication itself is owner-gated in this repository and requires
  explicit approval before creating any listing issue or public announcement.

## Decision point

The current fix is merged; next action is to complete live QA and update this plan
to “submission-ready” status once the environment-bound checks are recorded.
