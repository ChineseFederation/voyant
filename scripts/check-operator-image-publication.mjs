/** Protect the operator image distribution contract from workflow drift. */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyOperatorImageIdentity } from "./verify-operator-image-identity.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WORKFLOW = ".github/workflows/operator-image.yml"
const CI_WORKFLOW = ".github/workflows/ci.yml"
const DOCKERFILE = "apps/operator/Dockerfile"
const SMOKE = "scripts/smoke-operator-image.sh"
const IDENTITY = "scripts/verify-operator-image-identity.mjs"
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
const smoke = source(SMOKE)
const identity = source(IDENTITY)
const contract = source(CONTRACT)

if (/^\s*pull_request\s*:/m.test(workflow)) {
  violations.push({ path: WORKFLOW, message: "pull requests must never trigger image publication" })
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
  ["actions/attest-build-provenance@", "workflow must attach registry build provenance"],
  ['version="sha-$GITHUB_SHA"', "main publication must use a full immutable SHA tag"],
  ["Immutable release tag", "release publication must reject an existing tag"],
  ["inputs.operation == 'promote-latest'", "latest promotion must be explicitly dispatched"],
  ["scripts/smoke-operator-image.sh", "published digests must use shared image acceptance"],
  ["steps.platform.outputs.ref", "each native build must be accepted by its resolved digest"],
  ["steps.image.outputs.ref", "canonical acceptance must address the resolved manifest digest"],
  ["steps.release.outputs.ref", "latest promotion must accept the resolved release digest"],
  ["packages: write", "registry mutation must be granted at job scope"],
  ["attestations: write", "publication must grant the attestation permission"],
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
])
requireFragments(DOCKERFILE, dockerfile, [
  ["org.opencontainers.image.source", "runtime image must label its source"],
  ["org.opencontainers.image.revision", "runtime image must label its revision"],
  ["org.opencontainers.image.version", "runtime image must label its version"],
])
requireFragments(SMOKE, smoke, [
  ["node run-generated-migrations.mjs", "image acceptance must run embedded migrations"],
  ["/healthz", "image acceptance must check liveness"],
  ["/api/openapi.json", "image acceptance must dispatch the API"],
])
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

function requireIdentityResult(name, manifest, loadConfig, expectedFailure) {
  try {
    verifyOperatorImageIdentity(manifest, EXPECTED_REVISION, EXPECTED_VERSION, loadConfig)
    if (expectedFailure) {
      violations.push({ path: IDENTITY, message: `${name} fixture unexpectedly passed` })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!expectedFailure || !message.includes(expectedFailure)) {
      violations.push({ path: IDENTITY, message: `${name} fixture failed incorrectly: ${message}` })
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
requireFragments(CONTRACT, contract, [
  ["@sha256:<digest>", "distribution contract must require digest pinning"],
  ["ADMIN_UI_EXTENSION_API_VERSION", "contract must separate extension API versioning"],
  ["APP_API_VERSION", "contract must separate Apps API versioning"],
  ["deployment.providers", "contract must define provider selection authority"],
  ["VOYANT_DEPLOYMENT_BINDINGS_JSON", "contract must document the boot-time provider overlay"],
  ['"isolation": "shared"', "contract must document Redis isolation semantics"],
  ['"network": "untrusted"', "contract must document Redis network semantics"],
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
