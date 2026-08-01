import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const rootIndex = process.argv.indexOf("--root")
const root = path.resolve(rootIndex === -1 ? "." : process.argv[rootIndex + 1])
const violations = []
const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) {
    violations.push(`missing ${relativePath}`)
    return ""
  }
  return readFileSync(absolutePath, "utf8")
}

for (const retiredPath of [
  "apps/operator/src/api/runtime/contract-document-runtime.ts",
  "apps/operator/src/api/runtime/contract-document-variables.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
  "packages/legal-node",
]) {
  if (existsSync(path.join(root, retiredPath))) violations.push(`${retiredPath} must stay deleted`)
}

const deploymentResources = read("packages/runtime/src/deployment-resources.ts")
const legalManifest = JSON.parse(read("packages/legal/package.json") || "{}")
const contributor = read("packages/legal/src/runtime-contributor.ts")
const runtime = read("packages/legal/src/runtime.ts")
const artifactRuntime = read("packages/legal/src/document-artifact-runtime.ts")
const documentCommand = read("packages/legal/src/contract-document-command.ts")
const documentJob = read("packages/legal/src/contract-document-job.ts")
const mcpRuntime = read("packages/legal/src/mcp-runtime.ts")
const voyant = read("packages/legal/src/voyant.ts")
const contractRoutes = read("packages/legal/src/contracts/routes.ts")
const legalIndex = read("packages/legal/src/index.ts")
const commerceRuntimePort = read("packages/commerce/src/runtime-port.ts")
const commerceRuntime = read("packages/commerce/src/runtime.ts")
const productDistribution = JSON.parse(read("packages/operator-standard/package.json") || "{}")
const standardDistribution = read("packages/operator-standard/src/index.ts")

for (const token of [
  "loadLegalRuntime",
  "createOperatorLegalRuntime",
  "AUTO_GENERATE_CONTRACT_OPTIONS",
]) {
  if (deploymentResources.includes(token)) {
    violations.push(`deployment host retains Legal composition token ${token}`)
  }
}
for (const token of [
  "executeAdmittedExistingTargetCommand",
  "claimActionId",
  "claimIdempotencyFingerprint",
  "claimCommandPayload",
]) {
  if (!documentCommand.includes(token)) {
    violations.push(`Legal document command seam is missing ${token}`)
  }
}
if (
  !mcpRuntime.includes("executeLegalContractDocumentCommand") ||
  mcpRuntime.includes("createLegalDocumentOperationEngine") ||
  mcpRuntime.includes("providerResolver")
) {
  violations.push("Legal MCP mutation must exclusively use the admitted document command seam")
}
if (
  !documentJob.includes("hasPort(legalDocumentArtifactProviderPort)") ||
  documentJob.includes("providerResolver") ||
  documentJob.includes("resolveBindings")
) {
  violations.push("Legal recovery job must no-op without and directly use the selected provider")
}
if (contributor.includes("[legalDocumentArtifactProviderPort.id]")) {
  violations.push("Legal contributor must not install an unattested alternate artifact provider")
}
if (deploymentResources.includes("@voyant-travel/legal/runtime")) {
  violations.push("deployment host must not load the Legal runtime")
}
if (
  legalManifest.voyant?.runtime?.export !== "createLegalRuntimePortContribution" ||
  legalManifest.voyant?.kind !== "module" ||
  !legalManifest.exports?.["./runtime-contributor"] ||
  legalManifest.exports?.["./standard-node"]
) {
  violations.push("Legal package must declare its standard Node runtime contributor")
}
for (const dependency of ["@voyant-travel/bookings"]) {
  if (!legalManifest.dependencies?.[dependency]) {
    violations.push(`Legal package must declare ${dependency}`)
  }
}
for (const token of [
  "createLegalRuntime",
  "legalRuntimePort.id",
  "legalContractDocumentRuntimePort.id",
  "createLegalDocumentArtifactGraphProvider",
  "legalContractDocumentJobRuntimePort.id",
]) {
  if (!contributor.includes(token)) violations.push(`Legal contributor is missing ${token}`)
}
for (const token of ["createContractDocumentRoutesOptions", "resolveStorage"]) {
  if (!runtime.includes(token)) violations.push(`Legal runtime is missing ${token}`)
}
for (const token of [
  "createStandardLegalDocumentArtifactProvider",
  "pg_advisory_xact_lock",
  "operation.operationKey",
]) {
  if (!artifactRuntime.includes(token)) {
    violations.push(`Legal durable artifact runtime is missing ${token}`)
  }
}
for (const token of [
  "generate_booking_contract_document",
  "regenerate_booking_contract_document",
  'status: "unavailable"',
  "selectedProviderPorts",
  "legalDocumentArtifactProviderPort.id",
  "legal.contract-document-operations",
]) {
  if (!voyant.includes(token)) violations.push(`Legal selected graph is missing ${token}`)
}
for (const token of ["createLegalDocumentOperationEngine", "createLegalDocumentOperationJob"]) {
  if (legalIndex.includes(token)) {
    violations.push(`Legal public index exposes private operation token ${token}`)
  }
}
for (const token of ["generateContractPdf", "checkoutContractPdf"]) {
  if (commerceRuntimePort.includes(token) || commerceRuntime.includes(token)) {
    violations.push(`Commerce retains retired Legal document generator token ${token}`)
  }
}
if (contractRoutes.includes('path: "/{id}/attach-document"')) {
  violations.push("Legal routes retain the generic attach-document compatibility alias")
}
for (const token of [
  "buildContractVariableBindings",
  "createContractDocumentService",
  "resolveContractDocumentGenerator",
  "resolveBookingPiiService",
  "createBookingContractSubscriberHost",
]) {
  if (runtime.includes(token)) violations.push(`Legal runtime retains retired token ${token}`)
}
if (!productDistribution.dependencies?.["@voyant-travel/legal"]) {
  violations.push("product distribution must supply @voyant-travel/legal")
}
if (!standardDistribution.includes('resolve: "@voyant-travel/legal"')) {
  violations.push("authored standard product BOM must select @voyant-travel/legal")
}
for (const retiredSelection of [
  '@voyant-travel/legal/contract-document"',
  '@voyant-travel/legal/booking-contract-extension"',
]) {
  if (standardDistribution.includes(retiredSelection)) {
    violations.push(`authored standard product BOM retains ${retiredSelection.slice(0, -1)}`)
  }
}

if (violations.length > 0) {
  console.error("Legal document runtime authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-legal-document-runtime-authority: OK (Legal-owned standard Node runtime)")
