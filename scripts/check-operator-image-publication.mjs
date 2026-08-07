/** Protect the operator image distribution contract from workflow drift. */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runOperatorImageFixtures } from "./lib/operator-image-fixtures.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WORKFLOW = ".github/workflows/operator-image.yml"
const CI_WORKFLOW = ".github/workflows/ci.yml"
const DOCKERFILE = "apps/operator/Dockerfile"
const OPERATOR_README = "apps/operator/README.md"
const SMOKE = "scripts/smoke-operator-image.sh"
const UPGRADE = "scripts/upgrade-operator-image.sh"
const ACCEPTANCE_LIB = "scripts/lib/operator-image-acceptance.sh"
const BASELINE = "scripts/resolve-upgrade-baseline.mjs"
const RELEASE_HEALTH = "scripts/checks/image/release-health.json"
const IDENTITY = "scripts/verify-operator-image-identity.mjs"
const SHELL_PACKAGER = "scripts/package-operator-admin-shell.mjs"
const SHELL_IDENTITY = "scripts/verify-operator-admin-shell.mjs"
const CONTRACT = "docs/architecture/operator-image-distribution.md"
const EXPRESSION_START = "$" + "{{"
const violations = []

function source(path) {
  if (!existsSync(join(ROOT, path))) {
    violations.push({ path, message: "required operator image publication file is missing" })
    return ""
  }
  return readFileSync(join(ROOT, path), "utf8")
}

function requireFragments(path, text, fragments) {
  for (const [fragment, message] of fragments) {
    if (!text.includes(fragment)) violations.push({ path, message })
  }
}

const workflow = source(WORKFLOW)
const ci = source(CI_WORKFLOW)
const dockerfile = source(DOCKERFILE)
const operatorReadme = source(OPERATOR_README)
const smoke = source(SMOKE)
const upgrade = source(UPGRADE)
const acceptanceLib = source(ACCEPTANCE_LIB)
const baseline = source(BASELINE)
const identity = source(IDENTITY)
const shellPackager = source(SHELL_PACKAGER)
const shellIdentity = source(SHELL_IDENTITY)
const contract = source(CONTRACT)

if (/^\s*pull_request\s*:/m.test(workflow)) {
  violations.push({ path: WORKFLOW, message: "pull requests must never trigger image publication" })
}

for (const match of workflow.matchAll(/^\s+registry:\s*(\S+)\s*$/gm)) {
  if (match[1] !== "ghcr.io") {
    violations.push({ path: WORKFLOW, message: "GHCR must remain the sole publication registry" })
  }
}

requireFragments(WORKFLOW, workflow, [
  ["ghcr.io/voyant-travel/operator", "workflow must publish the canonical GHCR image"],
  ["paths:", "automatic main publication must be limited to image-impacting changes"],
  ['"apps/operator/**"', "automatic main publication must include operator changes"],
  ['"packages/**"', "automatic main publication must include workspace package changes"],
  [
    '      - "scripts/smoke-operator-image.sh"',
    "automatic main publication must verify changes to its smoke harness",
  ],
  [
    '      - "scripts/verify-operator-image-identity.mjs"',
    "automatic main publication must verify changes to its identity verifier",
  ],
  [
    '      - "scripts/upgrade-operator-image.sh"',
    "automatic main publication must verify changes to its upgrade-path harness",
  ],
  [
    '      - "scripts/lib/operator-image-acceptance.sh"',
    "automatic main publication must verify changes to its shared acceptance primitives",
  ],
  [
    '      - "scripts/resolve-upgrade-baseline.mjs"',
    "automatic main publication must verify changes to upgrade baseline selection",
  ],
  [
    '      - "scripts/checks/image/release-health.json"',
    "automatic main publication must verify changes to recorded release health",
  ],
  ["runner: ubuntu-24.04", "amd64 images must build on a native GitHub runner"],
  ["runner: ubuntu-24.04-arm", "arm64 images must build on a native GitHub runner"],
  ["platform: linux/amd64", "workflow must build an amd64 image"],
  ["platform: linux/arm64", "workflow must build an arm64 image"],
  [
    `runs-on: ${EXPRESSION_START} matrix.runner }}`,
    "platform builds must run on the matching native matrix runner",
  ],
  [
    `platforms: ${EXPRESSION_START} matrix.platform }}`,
    "each native runner must build only its matching platform",
  ],
  ["push-by-digest=true", "native platform images must be published without temporary tags"],
  ["name-canonical=true", "native platform images must use content-addressed registry names"],
  [
    `operator-image-digest-${EXPRESSION_START} matrix.arch }}`,
    "platform digests must cross jobs as receipts",
  ],
  [
    'docker buildx imagetools create --tag "$FINAL_TAG"',
    "the canonical multi-platform tag must be created only in the finalize job",
  ],
  [
    "Canonical tag $FINAL_TAG appeared after publication planning",
    "finalization must refuse to overwrite a tag created after planning",
  ],
  [
    '"workflow_dispatch" && "$RUN_ATTEMPT" == "1"',
    "a fresh release dispatch must still reject an existing immutable tag",
  ],
  [
    `RUN_ATTEMPT: ${EXPRESSION_START} github.run_attempt }}`,
    "release recovery must use GitHub's workflow rerun attempt number",
  ],
  [
    "Release recovery attempt $RUN_ATTEMPT",
    "a failed release workflow rerun must adopt and reverify its existing immutable digest",
  ],
  [
    "format('{0}-{1}-{2}', github.ref, inputs.operation, inputs.release_version)",
    "push and release publication concurrency must retain ref and version isolation",
  ],
  [
    "inputs.operation == 'promote-latest' && 'promote-latest'",
    "all latest promotions must share one version-independent concurrency group",
  ],
  ["verify-operator-image-identity.mjs", "all canonical image paths must verify image identity"],
  [
    '"$IMAGE_NAME" "$IMAGE_NAME@$digest" "$GITHUB_SHA" "$version"',
    "release recovery must verify the existing tag against its planned source identity",
  ],
  [
    '"$IMAGE_NAME" "$IMAGE_NAME@$digest" "$GITHUB_SHA" "$IMAGE_VERSION"',
    "finalization recovery must verify the appeared tag against its planned source identity",
  ],
  ["provenance: mode=max", "workflow must emit maximum BuildKit provenance"],
  ["sbom: true", "workflow must emit an SBOM"],
  [
    `operator-admin-shell-${EXPRESSION_START} needs.plan.outputs.version }}`,
    "workflow must publish the shell companion under the image version",
  ],
  [
    'docker cp "$container:/app/admin-shell/."',
    "shell publication must copy the exact bytes embedded in the accepted image",
  ],
  ["actions/attest-build-provenance@", "workflow must attach registry build provenance"],
  ['version="sha-$GITHUB_SHA"', "main publication must use a full immutable SHA tag"],
  ["Immutable release tag", "release publication must reject an existing tag"],
  ["inputs.operation == 'promote-latest'", "latest promotion must be explicitly dispatched"],
  ["scripts/smoke-operator-image.sh", "published digests must use shared image acceptance"],
  ["steps.platform.outputs.ref", "each native build must be accepted by its resolved digest"],
  ["steps.image.outputs.ref", "canonical acceptance must address the resolved manifest digest"],
  ["steps.release.outputs.ref", "latest promotion must accept the resolved release digest"],
  [
    `scripts/upgrade-operator-image.sh \\\n            "${EXPRESSION_START} steps.image.outputs.ref }}" "${EXPRESSION_START} needs.plan.outputs.version }}"`,
    "the canonical digest must be accepted against the previous release's database, not only an empty one",
  ],
  [
    `scripts/upgrade-operator-image.sh \\\n            "${EXPRESSION_START} steps.release.outputs.ref }}" "${EXPRESSION_START} inputs.release_version }}"`,
    "latest promotion must accept the release's upgrade path before moving the tag",
  ],
  ["packages: write", "registry mutation must be granted at job scope"],
  ["attestations: write", "publication must grant the attestation permission"],
  ["docker logout ghcr.io", "publication must remove registry credentials before its public check"],
  [
    `imagetools inspect "${EXPRESSION_START} steps.image.outputs.ref }}" --raw`,
    "publication must prove anonymous access to the exact canonical digest",
  ],
])

if (workflow.includes("docker/setup-qemu-action")) {
  violations.push({
    path: WORKFLOW,
    message: "operator platform builds must remain native and must not install QEMU",
  })
}

if (/- name: Attest the canonical multi-platform image\n\s+if:/.test(workflow)) {
  violations.push({
    path: WORKFLOW,
    message: "canonical provenance must be re-attached for existing and newly published digests",
  })
}

requireFragments(CI_WORKFLOW, ci, [
  [
    "operator-image-impact:",
    "branch CI must cheaply detect whether operator image acceptance is required",
  ],
  [
    "if: needs.operator-image-impact.outputs.required == 'true'",
    "branch CI must not run operator image acceptance for unrelated changes",
  ],
  [
    "git diff --name-only --no-renames",
    "branch CI must classify both sides of image-impacting renames and deletions",
  ],
  [
    "generate-operator-application-manifest|generate-operator-application-metadata",
    "branch CI must accept changes to operator composition generators",
  ],
  [
    "run-generated-migrations|verify-operator-image-identity",
    "branch CI must accept changes to operator migration and image identity verification",
  ],
  [
    "scripts/smoke-operator-image.sh voyant-operator:ci",
    "branch CI must retain shared migration/boot/API image acceptance",
  ],
  [
    "scripts/upgrade-operator-image.sh voyant-operator:ci",
    "branch CI must accept the upgrade path, where a ledger-identity break is cheapest to catch",
  ],
  [
    "resolve-upgrade-baseline|run-generated-migrations",
    "branch CI must accept changes to upgrade baseline selection",
  ],
  [
    "scripts/(smoke|upgrade)-operator-image\\.sh",
    "branch CI must accept changes to either image acceptance harness",
  ],
])
requireFragments(DOCKERFILE, dockerfile, [
  ["org.opencontainers.image.source", "runtime image must label its source"],
  ["org.opencontainers.image.revision", "runtime image must label its revision"],
  ["org.opencontainers.image.version", "runtime image must label its version"],
  ["AS admin-shell-artifact", "image build must expose the portable shell target"],
  ["start-api-only.mjs", "runtime image must carry the API-only entrypoint"],
  ["./admin-shell", "runtime image must embed the shell artifact built from the same bytes"],
])
requireFragments(OPERATOR_README, operatorReadme, [
  [
    "IMAGE=ghcr.io/voyant-travel/operator@sha256:<digest>",
    "operator deployment guidance must pin the sole public GHCR image by digest",
  ],
  ["sole public operator image", "operator deployment guidance must identify one public image"],
  [
    "a build snapshot, not a release",
    "operator deployment guidance must separate release tags from main snapshots",
  ],
])
requireFragments(ACCEPTANCE_LIB, acceptanceLib, [
  ["node run-generated-migrations.mjs", "image acceptance must run embedded migrations"],
  ["/healthz", "image acceptance must check liveness"],
  ["/api/openapi.json", "image acceptance must dispatch the API"],
  ["operator_image_boot_api_only_and_assert", "image acceptance must boot the API-only profile"],
  ["operator_image_verify_shell_artifact", "image acceptance must verify shell file identity"],
])
requireFragments(SHELL_PACKAGER, shellPackager, [
  ["voyant.admin-shell-artifact.v1", "shell packaging must emit a versioned manifest"],
  ['apiBasePath: "/api"', "shell packaging must retain a same-origin API base"],
  ["graphHash", "shell packaging must record graph identity"],
  ["uiBuildId", "shell packaging must record UI build identity"],
])
requireFragments(SHELL_IDENTITY, shellIdentity, [
  ["file identity mismatch", "shell verification must hash every manifested file"],
  ["shellBootstrap", "shell verification must enforce compatibility metadata"],
])
for (const [path, text] of [
  [SMOKE, smoke],
  [UPGRADE, upgrade],
]) {
  requireFragments(path, text, [
    [
      "lib/operator-image-acceptance.sh",
      "both acceptance stages must run the image through the same environment and boot assertions",
    ],
    ["operator_image_boot_and_assert", "every acceptance stage must boot the image it accepted"],
  ])
}
requireFragments(UPGRADE, upgrade, [
  [
    "resolve-upgrade-baseline.mjs",
    "upgrade acceptance must resolve its baseline from the published release order",
  ],
  [
    "DROP DATABASE IF EXISTS",
    "upgrade acceptance must own a database the fresh-database stage has not already migrated",
  ],
  ["--expect-applied", "upgrade acceptance must prove the baseline produced a real prior state"],
  ["--expect-no-op", "upgrade acceptance must pin re-entrancy of the candidate's plan"],
  ["SKIPPED:", "upgrade acceptance must skip loudly rather than pass silently"],
])
requireFragments(BASELINE, baseline, [
  ["ghcr.io", "baseline selection must read the registry that publishes the image"],
  [
    "usableAsUpgradeBaseline === false",
    "baseline selection must honour releases recorded as unusable baselines",
  ],
  [
    "VOYANT_UPGRADE_BASELINE_VERSION",
    "an operator must be able to pin a baseline older than the previous release",
  ],
])

const releaseHealth = JSON.parse(source(RELEASE_HEALTH) || "{}")
if (!Array.isArray(releaseHealth.knownBad)) {
  violations.push({ path: RELEASE_HEALTH, message: "release health must record a knownBad array" })
} else {
  for (const release of releaseHealth.knownBad) {
    if (!/^\d+\.\d+\.\d+$/.test(release?.version ?? "")) {
      violations.push({
        path: RELEASE_HEALTH,
        message: `known-bad entry ${JSON.stringify(release?.version)} is not a bare release semver`,
      })
    }
    if (!release?.reason || !release?.issue) {
      violations.push({
        path: RELEASE_HEALTH,
        message: `known-bad release ${release?.version} must record a reason and an issue`,
      })
    }
    if (typeof release?.usableAsUpgradeBaseline !== "boolean") {
      violations.push({
        path: RELEASE_HEALTH,
        message: `known-bad release ${release?.version} must state whether it is a usable upgrade baseline`,
      })
    }
  }
}
requireFragments(IDENTITY, identity, [
  ["SUPPORTED_ARCHITECTURES", "identity verification must cover every supported architecture"],
  ["amd64", "identity verification must require linux/amd64"],
  ["arm64", "identity verification must require linux/arm64"],
  [
    "org.opencontainers.image.revision",
    "identity verification must compare the source revision label",
  ],
  [
    "org.opencontainers.image.version",
    "identity verification must compare the planned image version label",
  ],
  [
    "vnd.docker.reference.type",
    "identity verification must allow only explicit unknown/unknown attestation descriptors",
  ],
  [
    "unexpected runnable or non-attestation platform descriptor",
    "identity verification must reject extra runnable platform descriptors",
  ],
  [
    '"--format", "{{json .Image}}"',
    "identity verification must inspect each platform image configuration",
  ],
])

violations.push(
  ...runOperatorImageFixtures({ identity: IDENTITY, baseline: BASELINE, report: SMOKE }),
)

requireFragments(CONTRACT, contract, [
  [
    "sole public OCI distribution point",
    "distribution contract must name a single public registry",
  ],
  [
    "supersedes #3976's original",
    "distribution contract must replace the same-final-image premise with a public base",
  ],
  ["canonical base for downstream private products", "contract must define private derivatives"],
  ["@sha256:<digest>", "distribution contract must require digest pinning"],
  [
    "resolve a semver tag to its digest",
    "distribution contract must tell downstreams to admit releases by semver tag",
  ],
  [
    "not admitting the snapshot",
    "distribution contract must route a needed main fix through a release dispatch",
  ],
  ["ADMIN_UI_EXTENSION_API_VERSION", "contract must separate extension API versioning"],
  ["APP_API_VERSION", "contract must separate Apps API versioning"],
  ["deployment.providers", "contract must define provider selection authority"],
  ["VOYANT_DEPLOYMENT_BINDINGS_JSON", "contract must document the boot-time provider overlay"],
  ['"isolation": "shared"', "contract must document Redis isolation semantics"],
  ['"network": "untrusted"', "contract must document Redis network semantics"],
  [
    "upgrade-path acceptance",
    "distribution contract must describe acceptance against an existing database",
  ],
  [
    "scripts/checks/image/release-health.json",
    "distribution contract must point consumers at where a known-bad release is recorded",
  ],
])

if (violations.length > 0) {
  console.error("Operator image publication contract violation.\n")
  for (const violation of violations) {
    console.error(`  ${violation.path}`)
    console.error(`    ${violation.message}`)
  }
  process.exit(1)
}

console.log("check-operator-image-publication: OK")
