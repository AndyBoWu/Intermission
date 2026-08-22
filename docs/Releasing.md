# Release Process

Release publication is owner-gated and separate from Omarchy Marketplace
submission. A manual workflow run is always a dry run; only an existing strict
semantic tag can enter the publishing job.

## Deterministic assets

The tracked allowlist in `scripts/release-files.txt` contains only the plugin
manifest, QML entry points, runtime modules, README, license, and preview. It
excludes tests, development configuration, planning documents, and repository
metadata.

Build the current version without publishing:

```sh
npm run release:dry-run
```

The command creates `dist/intermission-VERSION.tar.gz`, its SHA-256 checksum,
and deterministic provenance metadata containing the exact source commit. It
refuses malformed or mismatched versions and refuses to overwrite assets.

## GitHub dry run

Run the `Release` workflow manually with a strict tag value such as `v0.1.0`.
The workflow re-runs portable and pinned Omarchy compatibility gates, builds
the assets from the tested commit, verifies them, and uploads a seven-day
workflow artifact. A manual run has read-only repository permission and never
creates a tag or GitHub Release.

## Publishing gate

Publishing requires all of the following:

1. Complete the applicable live evidence in `docs/ReleaseEvidence.md`.
2. Update `manifest.json` and `package.json` to the same semantic version.
3. Configure a `release` environment with at least one required reviewer.
4. Review the exact commit on `main`, create its `vMAJOR.MINOR.PATCH` tag, and
   push that tag as the repository owner.
5. Approve the waiting `Release / Publish` deployment.

The tag workflow re-runs both validation jobs before the environment gate. The
publishing job alone receives `contents: write`; it verifies the tag points to
the tested commit on `main`, re-verifies downloaded assets, rejects an existing
release, and uses `--verify-tag` when creating the release. Concurrency permits
only one run for a given tag. No workflow creates or submits a Marketplace
listing.

Publishing requires an environment named `release` with at least one required
reviewer. The publishing job reads back that protection rule and fails before any
release write if it is missing. Plan or visibility changes remain separate owner
decisions.

Add GitHub artifact attestations with the official attestation action, using only
`id-token: write` and `attestations: write` permissions, when your account plan
and policy allow it.
