const { readFileSync } = require("node:fs")
const path = require("node:path")

const { read } = require("@changesets/config")
const { getPackages } = require("@manypkg/get-packages")
const semver = require("semver")
const { parse: parseYaml } = require("yaml")

const { getPublishablePackages } = require("./release-utils.cjs")

const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml"
const BUILD_STEP = "Build pending publish workspaces"
const TARBALL_STEP = "Verify publish tarballs"
const PUBLISH_STEP = "Publish pending packages"

// Publish must consume the Turbo-built, tarball-verified `dist` immutably.
// Several packages `clean` their dist in prepack, so a concurrent publish
// (changesets fans out to ~10) can delete a dependency's dist mid-build. The
// publish step therefore (a) must run after the build + tarball-verify steps
// and (b) must disable lifecycle scripts so prepack never rebuilds under
// fan-out. This guards that invariant from silently regressing.
function collectReleaseWorkflowProblems(cwd) {
  const problems = []
  const workflowPath = path.join(cwd, RELEASE_WORKFLOW_PATH)

  let workflow
  try {
    workflow = parseYaml(readFileSync(workflowPath, "utf8"))
  } catch (error) {
    return [`${RELEASE_WORKFLOW_PATH}: could not read or parse workflow (${error.message})`]
  }

  const releaseJob = workflow?.jobs?.release
  const steps = Array.isArray(releaseJob?.steps) ? releaseJob.steps : null
  if (!steps) {
    return [`${RELEASE_WORKFLOW_PATH}: missing jobs.release.steps`]
  }

  const indexOfStep = (name) => steps.findIndex((step) => step?.name === name)
  const buildIdx = indexOfStep(BUILD_STEP)
  const tarballIdx = indexOfStep(TARBALL_STEP)
  const publishIdx = indexOfStep(PUBLISH_STEP)

  for (const [label, idx] of [
    [BUILD_STEP, buildIdx],
    [TARBALL_STEP, tarballIdx],
    [PUBLISH_STEP, publishIdx],
  ]) {
    if (idx === -1) problems.push(`${RELEASE_WORKFLOW_PATH}: missing "${label}" step`)
  }

  if (publishIdx !== -1) {
    if (buildIdx !== -1 && buildIdx > publishIdx) {
      problems.push(`${RELEASE_WORKFLOW_PATH}: "${BUILD_STEP}" must precede "${PUBLISH_STEP}"`)
    }
    if (tarballIdx !== -1 && tarballIdx > publishIdx) {
      problems.push(`${RELEASE_WORKFLOW_PATH}: "${TARBALL_STEP}" must precede "${PUBLISH_STEP}"`)
    }

    const publishEnv = steps[publishIdx].env ?? {}
    const ignoreScripts = publishEnv.npm_config_ignore_scripts
    if (String(ignoreScripts) !== "true") {
      problems.push(
        `${RELEASE_WORKFLOW_PATH}: "${PUBLISH_STEP}" must set env.npm_config_ignore_scripts: "true" ` +
          "so publish consumes verified dist immutably instead of racing prepack rebuilds",
      )
    }
  }

  return problems
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]
const REQUIRED_WORKSPACE_RANGE = "workspace:^"
// A peer may state a published range instead of `workspace:^` as long as the
// range is a real semver range that admits the version currently in the
// workspace. This deliberately accepts comparator spans such as
// `>=0.65.0 <2.0.0` and not only caret unions: with
// `onlyUpdatePeerDependentsWhenOutOfRange` set in .changeset/config.json, a wide
// span is what stops changesets rewriting the range on every provider bump, so
// requiring caret shape here forced exactly the churn that setting prevents.
const isPublishedRange = (version) =>
  typeof version === "string" &&
  !version.startsWith("workspace:") &&
  semver.validRange(version) !== null

// The standard product distribution pins its runtime modules to the EXACT current version
// (`workspace:*` → `X.Y.Z` on publish) so the published set is deterministic and
// tested - see scripts/generate-standard-product-distribution.mjs (and
// verify:product-distribution,
// which enforces `workspace:*` there). That intent is the opposite of the caret
// rule, so the BOM's runtime `dependencies` are exempt. Its dev/peer deps still
// follow the caret convention (they aren't part of the pinned published set).
const BOM_EXACT_PIN = "workspace:*"
const BOM_EXACT_PIN_PACKAGES = new Set(["@voyant-travel/operator-standard"])

function collectWorkspaceRangeProblems(packages, projectedVersions = new Map()) {
  const problems = []
  const workspacePackageVersions = new Map(
    packages.packages
      .map((pkg) => [pkg.packageJson.name, pkg.packageJson.version])
      .filter(([name, version]) => name && version),
  )

  for (const pkg of packages.packages) {
    const packageJsonPath = path.join(pkg.dir, "package.json")
    const packageJson = pkg.packageJson
    const isBom = BOM_EXACT_PIN_PACKAGES.has(packageJson.name)

    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = packageJson[field]
      if (!dependencies || typeof dependencies !== "object") continue

      // The BOM's runtime `dependencies` must be exact-pinned; everything else
      // (incl. the BOM's dev/peer deps) uses the caret range.
      const expected = isBom && field === "dependencies" ? BOM_EXACT_PIN : REQUIRED_WORKSPACE_RANGE

      for (const [name, version] of Object.entries(dependencies)) {
        if (!workspacePackageVersions.has(name) || version === expected) continue

        const projectedConsumerVersion = projectedVersions.get(packageJson.name)
        const projectedProviderVersion = projectedVersions.get(name)
        const currentProviderVersion = workspacePackageVersions.get(name)
        const isCompatiblePublishedPeerRange =
          field === "peerDependencies" &&
          isPublishedRange(version) &&
          semver.satisfies(currentProviderVersion, version)
        const isExactStagedPeerRange =
          field === "peerDependencies" &&
          projectedConsumerVersion &&
          projectedProviderVersion &&
          !semver.satisfies(currentProviderVersion, version) &&
          version === `^${projectedProviderVersion}`

        if (!isCompatiblePublishedPeerRange && !isExactStagedPeerRange) {
          problems.push(
            `${packageJsonPath}: ${field}.${name} uses ${version}; expected ${expected}`,
          )
        }
      }
    }
  }

  return problems
}

async function main() {
  const cwd = process.cwd()
  const packages = await getPackages(cwd)
  const config = await read(cwd, packages)
  const { default: getReleasePlan } = await import("@changesets/get-release-plan")
  const releasePlan = await getReleasePlan(cwd)
  const projectedVersions = new Map(
    releasePlan.releases.map(({ name, newVersion }) => [name, newVersion]),
  )
  const publishableNames = new Set(
    getPublishablePackages(packages, config).map((pkg) => pkg.packageJson.name),
  )
  const seenFixedPackages = new Map()
  const problems = []

  for (const group of config.fixed) {
    if (group.length < 2) {
      problems.push(`fixed group must contain at least two packages: ${group.join(", ")}`)
    }

    for (const packageName of group) {
      if (!publishableNames.has(packageName)) {
        problems.push(`fixed group references non-publishable package: ${packageName}`)
      }

      if (packageName.endsWith("-contracts")) {
        problems.push(`contract package must version independently: ${packageName}`)
      }

      const previousGroup = seenFixedPackages.get(packageName)
      if (previousGroup) {
        problems.push(
          `${packageName} appears in multiple fixed groups: ${previousGroup.join(
            ", ",
          )} and ${group.join(", ")}`,
        )
      }
      seenFixedPackages.set(packageName, group)
    }
  }

  problems.push(...collectWorkspaceRangeProblems(packages, projectedVersions))
  problems.push(...collectReleaseWorkflowProblems(cwd))

  if (problems.length > 0) {
    console.error("Release configuration verification failed:\n")
    for (const problem of problems) {
      console.error(`- ${problem}`)
    }
    process.exit(1)
  }

  console.log(
    `Verified ${config.fixed.length} release cohorts and compatible @voyant-travel workspace ranges.`,
  )
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

module.exports = { collectReleaseWorkflowProblems, collectWorkspaceRangeProblems }
