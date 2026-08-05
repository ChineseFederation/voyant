import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const pathOption = (name, fallback) => {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${name} requires a path`)
  return value
}
const root = pathOption("--root", ROOT)
const operatorRoot = pathOption("--operator-root", join(root, "apps/operator"))
const operatorRuntimePath = pathOption(
  "--runtime",
  join(root, "packages/runtime/src/deployment-resources.ts"),
)
const violations = []

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`check-operator-smartbill-authority: missing ${path}`)
  return readFileSync(path, "utf8")
}

const operatorPackage = JSON.parse(readRequired(join(operatorRoot, "package.json")))
const config = readRequired(join(operatorRoot, "voyant.config.ts"))
const operatorRuntime = readRequired(operatorRuntimePath)
const financeManifest = readRequired(join(root, "packages/finance/src/voyant.ts"))
const financeRuntime = readRequired(join(root, "packages/finance/src/runtime.ts"))
const financeRuntimePort = readRequired(join(root, "packages/finance/src/runtime-port.ts"))
const financeIndex = readRequired(join(root, "packages/finance/src/index.ts"))
// The graph declaration surface moved to @voyant-travel/graph-contracts;
// packages/core/src/project.ts is now a re-export shim.
const coreProject = readRequired(join(root, "packages/graph-contracts/src/index.ts"))
const graphGenerator = readRequired(join(root, "packages/framework/src/deployment-artifacts.ts"))

if (operatorPackage.dependencies?.["@voyant-travel/plugin-smartbill"]) {
  violations.push("operator application must not directly depend on the optional SmartBill plugin")
}
if (/resolve:\s*["']@voyant-travel\/plugin-smartbill["']/.test(config)) {
  violations.push("the default voyant.config.ts must not select @voyant-travel/plugin-smartbill")
}

const applicationAuthority = operatorRuntime
for (const forbidden of [
  "operatorSmartbillRuntimeHost",
  "resolveOperatorSmartbillConfig",
  "createOperatorInvoiceSettlementPollers",
  "invoiceSettlementPollers",
  "@voyant-travel/plugin-smartbill",
]) {
  if (applicationAuthority.includes(forbidden)) {
    violations.push(`operator runtime must not retain SmartBill bridge token ${forbidden}`)
  }
}
const genericContributorInputs =
  operatorRuntime.includes("options.createRuntimePorts({ primitives })") ||
  (operatorRuntime.includes("providerPorts?: VoyantGraphRuntimePorts") &&
    operatorRuntime.includes("runtimePorts: options.providerPorts"))
if (!genericContributorInputs) {
  violations.push("generated runtime contributors must receive only generic primitives and ports")
}
if (/eventBus\.subscribe|descriptor\.register/.test(applicationAuthority)) {
  violations.push("Operator code must not own or register SmartBill subscriber descriptors")
}

for (const [source, token] of [
  [financeManifest, "requirePort(financeInvoiceSettlementPollerRuntimePort, {"],
  [financeManifest, 'cardinality: "many"'],
  [financeRuntimePort, "FinanceInvoiceSettlementPollerProvider"],
  [financeRuntimePort, 'id: "finance.invoice-settlement-poller"'],
  [financeRuntime, "aggregateFinanceInvoiceSettlementPollers("],
  [financeIndex, "await getPorts(financeInvoiceSettlementPollerRuntimePort)"],
  [coreProject, "getPorts<TProvider>(port: VoyantPort<TProvider>)"],
  [graphGenerator, "GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS"],
  [graphGenerator, "values.push(value)"],
  [graphGenerator, "has multiple static contributors"],
]) {
  if (!source.includes(token)) {
    violations.push(`static multi-provider authority is missing ${token}`)
  }
}
if (financeRuntime.includes('config.read(bindings, "invoiceSettlementPollers")')) {
  violations.push("Finance runtime must not read invoiceSettlementPollers from host config")
}
if (!financeRuntime.includes("Object.hasOwn(pollers, provider.provider)")) {
  violations.push("Finance must reject duplicate invoicing provider names")
}
for (const forbidden of ["import(", "require(", "createRequire", "new Map(", "packageId"]) {
  if (`${financeRuntime}\n${financeRuntimePort}`.includes(forbidden)) {
    violations.push(`Finance settlement provider composition must stay static: found ${forbidden}`)
  }
}

if (violations.length > 0) {
  console.error("Operator SmartBill authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  "check-operator-smartbill-authority: OK (application bridge removed; optional many-valued Finance provider port is authoritative)",
)
