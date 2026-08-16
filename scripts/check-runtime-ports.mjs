import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const operatorRoot = argument("--operator-root", "apps/operator")
const frameworkRoot = argument("--framework-root", "packages/framework")
const runtimeRoot = argument("--runtime-root", "packages/runtime")
const compositionPath = path.join(operatorRoot, "src/api/composition.ts")
const retiredResourcesPath = path.join(operatorRoot, "src/api/runtime/deployment-resources.ts")
const appPath = path.join(operatorRoot, "src/api/app.ts")
const app = existsSync(appPath) ? await readFile(appPath, "utf8") : ""
const runtimePath = path.join(runtimeRoot, "src/index.ts")
const runtime = existsSync(runtimePath) ? await readFile(runtimePath, "utf8") : ""
const resources = await readFile(path.join(runtimeRoot, "src/deployment-resources.ts"), "utf8")

const migratedPorts = [
  "actionLedgerBookingDriftRuntimePort",
  "actionLedgerFinanceDriftRuntimePort",
  "actionLedgerInventoryDriftRuntimePort",
  "bookingMaintenanceRuntimePort",
  "bookingRequirementsRuntimePort",
  "bookingsRuntimePort",
  "catalogBookingRuntimePort",
  "catalogContentRuntimePort",
  "catalogOffersRuntimePort",
  "catalogSearchRuntimePort",
  "financeBookingScheduleRuntimePort",
  "financeBookingTaxRuntimePort",
  "financeRuntimePort",
  "inventoryBrochureRuntimePort",
  "inventoryRuntimePort",
  "legalContractDocumentRuntimePort",
  "miceRuntimePort",
  "proposalsPresentationRuntimePort",
  "proposalsRuntimePort",
  "proposalsSnapshotRuntimePort",
  "smartbillRuntimeHostPort",
  "publicApiCustomerPortalRuntimePort",
  "publicApiIntakeRuntimePort",
  "publicApiOffersRuntimePort",
  "publicApiPaymentLinkRuntimePort",
  "publicApiVerificationRuntimePort",
]

const violations = []
if (existsSync(compositionPath)) {
  violations.push("apps/operator/src/api/composition.ts must stay deleted")
}
if (existsSync(retiredResourcesPath)) {
  violations.push("apps/operator/src/api/runtime/deployment-resources.ts must stay deleted")
}
if (!resources.includes("export function createVoyantDeploymentResources")) {
  violations.push("runtime must expose one graph deployment resource factory")
}
for (const legacyExport of [
  "export function buildOperatorProviders",
  "export function buildOperatorRuntimePorts",
]) {
  if (resources.includes(legacyExport)) violations.push(`${legacyExport} must stay private`)
}
for (const legacyBuilder of ["buildOperatorProviders", "buildOperatorRuntimePorts"]) {
  if (resources.includes(legacyBuilder)) violations.push(`${legacyBuilder} must stay deleted`)
}
const directResourceComposition = /\.\.\.createOperatorRuntimeDeploymentResources\([^)]*\)/.test(
  app,
)
const resourceAssignment = app.match(
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*createOperatorRuntimeDeploymentResources\([^)]*\)/,
)
const assignedResourceComposition =
  resourceAssignment !== null && app.includes(`...${resourceAssignment[1]}`)
if (app && !directResourceComposition && !assignedResourceComposition) {
  violations.push("Operator app must compose the generated graph from deployment resources")
}
if (app && !app.includes("createGeneratedGraphRuntimePorts")) {
  violations.push("Operator app must inject its statically generated runtime ports")
}
if (
  !app &&
  runtime &&
  (!runtime.includes("createVoyantDeploymentResources") ||
    !runtime.includes("resolveSelectedGraphProviderPorts") ||
    !runtime.includes("providerPorts,") ||
    !runtime.includes("runtimePorts: deploymentResources.ports") ||
    !resources.includes("ports: options.createRuntimePorts({") ||
    !resources.includes("runtimePorts: options.providerPorts"))
) {
  violations.push("runtime must compose selected providers into statically generated runtime ports")
}
for (const port of migratedPorts) {
  if (app.includes(port)) violations.push(`Operator app must not own ${port}`)
}
for (const symbol of [
  "buildOperatorProviders",
  "buildOperatorRuntimePorts",
  "operatorGraphRuntimeBindings",
  "deploymentLocalExtensions",
  "bindingsFromExtensionFactories",
]) {
  if (app.includes(symbol)) violations.push(`${symbol} must stay out of Operator app composition`)
}
if (existsSync(path.join(frameworkRoot, "src/composition-lazy.ts"))) {
  violations.push("framework composition-lazy.ts must stay deleted")
}

if (violations.length > 0) {
  throw new Error(`check-runtime-ports:\n- ${violations.join("\n- ")}`)
}

console.log(
  `check-runtime-ports: OK (0 product runtime-port entries in app composition; ${migratedPorts.length} resources are behind the deployment boundary)`,
)
