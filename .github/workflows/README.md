# CI and Release Workflows

The primary pull-request and branch CI workflow runs natively on Depot from
`.depot/workflows/ci.yml`. This directory retains a manually dispatched GitHub
Actions fallback and owns npm releases.

## Workflows Overview

### `.depot/workflows/ci.yml`

Runs the main repository checks for pull requests and pushes to `main` and `develop`:

- quality checks use Depot-native parallel steps
- typechecking skips workspaces already typechecked by their `tsc` build
- builds and their independent artifact consumers run in parallel phases
- database replay, union, and integration checks use separate Postgres sandboxes
- the custom CI image supplies Node, pnpm's populated store, and Chromium
- Turbo run summaries report cache hit rate and slow cache misses

Keep the stable `CI / checks`, `CI / build`, `CI / db-checks`, and
`CI / node-smoke` GitHub checks required by branch protection. Depot reports a
GitHub check for every native workflow job.

### `.depot/workflows/build-ci-image.yml`

Builds the custom CI image on relevant dependency/tooling changes and by manual
dispatch. Update its image tag when changing the pinned Node, pnpm, or Playwright
versions, then update `.depot/workflows/ci.yml` to use the same tag.

### `.github/workflows/ci.yml`

Provides a manually dispatched fallback on Depot GitHub Actions runners. Keep it
trigger-free for pull requests and pushes so it does not duplicate native Depot
CI.

### `release.yml`

Handles package releases:

- normal Changesets release flow on pushes to `main`
- scoped npm publication for packages whose checked-in versions are not yet on npm
- manual GitHub release + starter asset refresh for an explicit starter release version
- npm Trusted Publishing via GitHub Actions OIDC
- versioned starter tarballs attached to each GitHub Release for CLI scaffolding

### `operator-image.yml`

Publishes `ghcr.io/voyant-travel/operator` independently from npm packages:

- GHCR is the sole public registry for the OSS operator base; no mirror is
  published
- pushes to `main` publish immutable `sha-<git-sha>` multi-architecture images
- manual `publish-release` dispatches from `main` publish immutable semver tags
- amd64 and arm64 variants build and pass digest-level acceptance concurrently
  on matching native GitHub runners before their canonical index is created
- manual `promote-latest` dispatches move `latest` only after digest-level
  migration, boot, and API acceptance
- BuildKit SBOM/provenance and a GitHub registry attestation accompany new
  artifacts
- canonical publication finishes by resolving the exact digest without registry
  credentials, so a private package cannot pass as the public base

Pull requests do not trigger this workflow. Platform deployments consume a
digest, never `latest`; see
`docs/architecture/operator-image-distribution.md` for the complete contract.

Notes:

- the push flow creates or updates the Changesets release PR whenever releasable changesets exist
- the publish path builds and verifies only the pending package set and their build dependencies
- pending package publication runs only after the release PR is merged and no releasable changesets remain; this prevents placeholder versions for new packages from being published before their changesets are applied
- starter GitHub Releases are separate from npm package publication; run the manual dispatch with `release_assets=true` and an explicit `release_version` to create or refresh starter archives
- package publishing may still create package tags, but GitHub Releases are intended for starter assets rather than every npm package release

## Required GitHub Secrets

No npm publish token is required when Trusted Publishing is configured.

Release jobs run on GitHub-hosted runners and therefore need explicit Depot
Cache configuration in GitHub Settings → Secrets and variables → Actions:

- secret `TURBO_TOKEN`: a Depot API token with cache access
- variable `TURBO_API`: `https://cache.depot.dev`
- variable `TURBO_TEAM`: the Depot organization ID

Depot-native CI and Depot-hosted GitHub Actions runners receive the cache
connection automatically. The fallback workflow still sets the three values
explicitly so its cache behavior is visible and reproducible.

## Notes

- Database migrations are intentionally not automated in GitHub Actions for this repository.
- Schema and migration work should be generated, reviewed, and applied explicitly by maintainers.
