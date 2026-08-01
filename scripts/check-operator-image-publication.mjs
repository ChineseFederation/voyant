/** Protect the operator image distribution contract from workflow drift. */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WORKFLOW = ".github/workflows/operator-image.yml"
const CI_WORKFLOW = ".github/workflows/ci.yml"
const DOCKERFILE = "apps/operator/Dockerfile"
const SMOKE = "scripts/smoke-operator-image.sh"
const CONTRACT = "docs/architecture/operator-image-distribution.md"
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
const contract = source(CONTRACT)

if (/^\s*pull_request\s*:/m.test(workflow)) {
  violations.push({ path: WORKFLOW, message: "pull requests must never trigger image publication" })
}

requireFragments(WORKFLOW, workflow, [
  ["ghcr.io/voyant-travel/operator", "workflow must publish the canonical GHCR image"],
  ["platforms: linux/amd64,linux/arm64", "workflow must publish amd64 and arm64"],
  ["provenance: mode=max", "workflow must emit maximum BuildKit provenance"],
  ["sbom: true", "workflow must emit an SBOM"],
  ["actions/attest-build-provenance@", "workflow must attach registry build provenance"],
  ['version="sha-$GITHUB_SHA"', "main publication must use a full immutable SHA tag"],
  ["Immutable release tag", "release publication must reject an existing tag"],
  ["inputs.operation == 'promote-latest'", "latest promotion must be explicitly dispatched"],
  ["scripts/smoke-operator-image.sh", "published digests must use shared image acceptance"],
  ["steps.image.outputs.ref", "published acceptance must address the resolved digest"],
  ["steps.release.outputs.ref", "latest promotion must accept the resolved release digest"],
  ["packages: write", "registry mutation must be granted at job scope"],
  ["attestations: write", "publication must grant the attestation permission"],
])

requireFragments(CI_WORKFLOW, ci, [
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
