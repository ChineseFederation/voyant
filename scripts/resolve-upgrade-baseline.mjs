#!/usr/bin/env node
/**
 * Resolve the released image the upgrade-path acceptance stage should migrate
 * from.
 *
 * The registry tag list is readable anonymously, so this needs no
 * `read:packages` credential and works the same in a workflow and on a laptop.
 *
 * Prints `<version> <digest>` on stdout, or nothing when there is no usable
 * predecessor. Diagnostics go to stderr. An absent predecessor is not an error
 * here: the caller decides to skip loudly.
 *
 * Both the tag list and the digest come from the registry HTTP API rather than
 * from `docker buildx imagetools`, so the stage needs no builder and runs the
 * same way in a job that never set one up.
 */

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const RELEASE_HEALTH = join(HERE, "checks/image/release-health.json")
const RELEASE_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/** Ordered ascending, so the last entry is the newest release. */
function compareReleases(left, right) {
  const a = RELEASE_SEMVER.exec(left)
  const b = RELEASE_SEMVER.exec(right)
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(a[part]) - Number(b[part])
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Pure selection, so the publication authority can exercise it against
 * fixtures instead of against the registry.
 */
export function selectUpgradeBaseline({ tags, candidateVersion, unusableBaselines = [] }) {
  const unusable = new Set(unusableBaselines)
  const releases = tags
    .filter((tag) => RELEASE_SEMVER.test(tag))
    .filter((tag) => !unusable.has(tag))

  // A candidate that is itself a release must upgrade from something older; a
  // main snapshot (sha-<git-sha>) has no place in the release order and
  // upgrades from the newest release there is.
  const older = RELEASE_SEMVER.test(candidateVersion ?? "")
    ? releases.filter((tag) => compareReleases(tag, candidateVersion) < 0)
    : releases

  if (older.length === 0) return null
  return older.sort(compareReleases).at(-1)
}

export function readUnusableBaselines(path = RELEASE_HEALTH) {
  const health = JSON.parse(readFileSync(path, "utf8"))
  return (health.knownBad ?? [])
    .filter((release) => release.usableAsUpgradeBaseline === false)
    .map((release) => release.version)
}

function splitImageName(imageName) {
  const separator = imageName.indexOf("/")
  if (separator === -1) throw new Error(`Image name ${imageName} has no registry host.`)
  const registry = imageName.slice(0, separator)
  const repository = imageName.slice(separator + 1)
  if (registry !== "ghcr.io") {
    throw new Error(`Upgrade baseline resolution only knows how to list tags on ghcr.io.`)
  }
  return { registry, repository }
}

async function pullToken(registry, repository) {
  const response = await fetch(
    `https://${registry}/token?service=${registry}&scope=${encodeURIComponent(`repository:${repository}:pull`)}`,
  )
  if (!response.ok) {
    throw new Error(`Anonymous pull token request failed with ${response.status}.`)
  }
  const { token } = await response.json()
  return token
}

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(",")

async function resolveDigest(imageName, tag) {
  const { registry, repository } = splitImageName(imageName)
  const token = await pullToken(registry, repository)
  const response = await fetch(`https://${registry}/v2/${repository}/manifests/${tag}`, {
    method: "HEAD",
    headers: { authorization: `Bearer ${token}`, accept: MANIFEST_TYPES },
  })
  if (!response.ok) {
    throw new Error(`Could not resolve ${imageName}:${tag}: registry answered ${response.status}.`)
  }
  const digest = response.headers.get("docker-content-digest")
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? "")) {
    throw new Error(`Registry returned no usable digest for ${imageName}:${tag}.`)
  }
  return digest
}

async function listTags(imageName) {
  const { registry, repository } = splitImageName(imageName)
  const token = await pullToken(registry, repository)

  const tags = []
  let next = `https://${registry}/v2/${repository}/tags/list?n=1000`
  while (next) {
    const response = await fetch(next, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Tag listing failed with ${response.status}.`)
    const page = await response.json()
    tags.push(...(page.tags ?? []))

    // The registry paginates with a Link header; without one the list is whole.
    const link = /<([^>]+)>\s*;\s*rel="next"/.exec(response.headers.get("link") ?? "")
    next = link ? new URL(link[1], `https://${registry}`).href : null
  }
  return tags
}

async function main() {
  const [imageName, candidateVersion] = process.argv.slice(2)
  if (!imageName) {
    console.error("Usage: resolve-upgrade-baseline.mjs <image-name> [candidate-version]")
    process.exit(2)
  }

  const pinned = process.env.VOYANT_UPGRADE_BASELINE_VERSION?.trim()
  let baseline
  if (pinned) {
    if (!RELEASE_SEMVER.test(pinned)) {
      console.error(`VOYANT_UPGRADE_BASELINE_VERSION must be a bare release semver, got ${pinned}.`)
      process.exit(1)
    }
    console.error(`Upgrade baseline pinned to ${pinned} by VOYANT_UPGRADE_BASELINE_VERSION.`)
    baseline = pinned
  } else {
    const unusableBaselines = readUnusableBaselines()
    for (const version of unusableBaselines) {
      console.error(`Release ${version} is recorded as an unusable upgrade baseline; skipping it.`)
    }

    const tags = await listTags(imageName)
    baseline = selectUpgradeBaseline({ tags, candidateVersion, unusableBaselines })
    if (!baseline) {
      console.error(
        candidateVersion
          ? `No usable released predecessor of ${candidateVersion} in ${imageName}.`
          : `No usable released version in ${imageName}.`,
      )
      return
    }
    console.error(`Upgrade baseline for ${candidateVersion || "this candidate"}: ${baseline}.`)
  }

  // Pin the baseline the same way a deployment must pin the image: by digest.
  const digest = await resolveDigest(imageName, baseline)
  console.log(`${baseline} ${digest}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
