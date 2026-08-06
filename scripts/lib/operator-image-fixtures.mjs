/**
 * Behavioural fixtures for the operator image publication authority.
 *
 * The rest of that checker matches source text, which proves a step is written
 * down. These prove the three decisions behind image acceptance actually come
 * out right — image identity, which release an upgrade is measured from, and
 * what a migration report is allowed to say — because each of them is a place
 * where a wrong answer reads as a green run.
 */

import { assertMigrationReport, extractMigrationReport } from "../assert-migration-report.mjs"
import { selectUpgradeBaseline } from "../resolve-upgrade-baseline.mjs"
import { verifyOperatorImageIdentity } from "../verify-operator-image-identity.mjs"

const AMD64_DIGEST = `sha256:${"a".repeat(64)}`
const ARM64_DIGEST = `sha256:${"b".repeat(64)}`
const EXPECTED_REVISION = "1".repeat(40)
const EXPECTED_VERSION = "1.2.3"

const identityFixture = {
  manifests: [
    { digest: AMD64_DIGEST, platform: { os: "linux", architecture: "amd64" } },
    { digest: ARM64_DIGEST, platform: { os: "linux", architecture: "arm64" } },
    {
      digest: `sha256:${"c".repeat(64)}`,
      platform: { os: "unknown", architecture: "unknown" },
      annotations: { "vnd.docker.reference.type": "attestation-manifest" },
    },
  ],
}
const matchingConfig = {
  config: {
    Labels: {
      "org.opencontainers.image.revision": EXPECTED_REVISION,
      "org.opencontainers.image.version": EXPECTED_VERSION,
    },
  },
}

const BASELINE_TAGS = [
  "latest",
  "sha-0123456789abcdef0123456789abcdef01234567",
  "sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "0.5.0",
  "0.6.0",
  "0.10.0",
  "0.6.1-rc.1",
]

const REPORT_LOG = `booting\n${JSON.stringify(
  {
    schemaVersion: "voyant.migration-result.v1",
    contentHash: "hash",
    applied: [{ id: "operations/0000", migrationKind: "schema", status: "applied" }],
    skipped: [],
    failed: [],
  },
  null,
  2,
)}\n`

/**
 * @param {{ identity: string, baseline: string, report: string }} paths
 * @returns {{ path: string, message: string }[]}
 */
export function runOperatorImageFixtures(paths) {
  const violations = []

  function requireIdentityResult(name, manifest, loadConfig, expectedFailure) {
    try {
      verifyOperatorImageIdentity(manifest, EXPECTED_REVISION, EXPECTED_VERSION, loadConfig)
      if (expectedFailure) {
        violations.push({ path: paths.identity, message: `${name} fixture unexpectedly passed` })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!expectedFailure || !message.includes(expectedFailure)) {
        violations.push({
          path: paths.identity,
          message: `${name} fixture failed incorrectly: ${message}`,
        })
      }
    }
  }

  requireIdentityResult("matching identity", identityFixture, () => matchingConfig)
  requireIdentityResult(
    "wrong revision",
    identityFixture,
    () => ({
      config: {
        Labels: { ...matchingConfig.config.Labels, "org.opencontainers.image.revision": "wrong" },
      },
    }),
    "revision is",
  )
  requireIdentityResult(
    "wrong version",
    identityFixture,
    () => ({
      config: {
        Labels: { ...matchingConfig.config.Labels, "org.opencontainers.image.version": "9.9.9" },
      },
    }),
    "version is",
  )
  requireIdentityResult(
    "extra runnable platform",
    {
      manifests: [
        ...identityFixture.manifests,
        { digest: `sha256:${"d".repeat(64)}`, platform: { os: "linux", architecture: "s390x" } },
      ],
    },
    () => matchingConfig,
    "unexpected runnable or non-attestation platform descriptor",
  )

  function requireBaseline(name, input, expected) {
    const selected = selectUpgradeBaseline(input)
    if (selected !== expected) {
      violations.push({
        path: paths.baseline,
        message: `${name}: selected ${JSON.stringify(selected)}, expected ${JSON.stringify(expected)}`,
      })
    }
  }

  requireBaseline(
    "a release upgrades from the newest release below it",
    { tags: BASELINE_TAGS, candidateVersion: "0.10.0" },
    "0.6.0",
  )
  requireBaseline(
    "a main snapshot upgrades from the newest release",
    { tags: BASELINE_TAGS, candidateVersion: "sha-0123456789abcdef0123456789abcdef01234567" },
    "0.10.0",
  )
  requireBaseline(
    "an unusable baseline is skipped for the next one down",
    { tags: BASELINE_TAGS, candidateVersion: "0.10.0", unusableBaselines: ["0.6.0"] },
    "0.5.0",
  )
  requireBaseline(
    "the first release has no predecessor",
    { tags: ["0.1.0", "latest"], candidateVersion: "0.1.0" },
    null,
  )
  requireBaseline("an empty registry has no predecessor", { tags: [], candidateVersion: "" }, null)

  function requireReportResult(name, report, expect, expectedFailure) {
    try {
      assertMigrationReport(report, { label: name, expect })
      if (expectedFailure) {
        violations.push({ path: paths.report, message: `${name} fixture unexpectedly passed` })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!expectedFailure || !message.includes(expectedFailure)) {
        violations.push({
          path: paths.report,
          message: `${name} fixture failed incorrectly: ${message}`,
        })
      }
    }
  }

  requireReportResult("an applied report", extractMigrationReport(REPORT_LOG), "applied")
  requireReportResult(
    "a re-run that applied something is not re-entrant",
    extractMigrationReport(REPORT_LOG),
    "no-op",
    "not re-entrant",
  )
  requireReportResult(
    "a baseline that applied nothing is not a prior state",
    { applied: [], skipped: [{ id: "x" }], failed: [] },
    "applied",
    "not a real prior state",
  )
  requireReportResult(
    "a failed migration",
    {
      applied: [],
      skipped: [],
      failed: [{ id: "operations/0000", detail: 'relation "allocation_audit_log" already exists' }],
    },
    "none",
    "allocation_audit_log",
  )
  requireReportResult("a missing report", extractMigrationReport("no json here"), "none", "no ")

  return violations
}
