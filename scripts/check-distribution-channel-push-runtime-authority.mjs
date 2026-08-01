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
const distributionRoot = pathOption("--distribution-root", join(ROOT, "packages/distribution"))
const operatorRoot = pathOption("--operator-root", join(ROOT, "apps/operator"))
const compositionPath = pathOption(
  "--composition",
  join(ROOT, "packages/runtime/src/deployment-resources.ts"),
)
const deploymentGraphCheckerPath = pathOption(
  "--deployment-graph-checker",
  join(ROOT, "scripts/check-deployment-graph.ts"),
)
const violations = []

function readRequired(path) {
  if (!existsSync(path)) {
    throw new Error(`check-distribution-channel-push-runtime-authority: missing ${path}`)
  }
  return readFileSync(path, "utf8")
}

const manifest = readRequired(join(distributionRoot, "src/voyant.ts"))
const manifestExtensionsPath = join(distributionRoot, "src/voyant-extensions.ts")
const manifestExtensions = existsSync(manifestExtensionsPath)
  ? readFileSync(manifestExtensionsPath, "utf8")
  : manifest
const extension = readRequired(join(distributionRoot, "src/channel-push/extension.ts"))
const runtimePort = readRequired(join(distributionRoot, "src/channel-push/runtime-port.ts"))
const domainPackage = readRequired(join(distributionRoot, "package.json"))
const contributor = readRequired(join(distributionRoot, "src/runtime-contributor.ts"))
const normalizedContributor = contributor.replace(
  /host\.getRuntimePort<[^>]+>/g,
  "host.getRuntimePort",
)
const runtime = readRequired(join(distributionRoot, "src/runtime.ts"))
const composition = readRequired(compositionPath)
const workflowServicesPath = join(operatorRoot, "src/api/runtime/operator-workflow-services.ts")
const workflowServices = existsSync(workflowServicesPath)
  ? readFileSync(workflowServicesPath, "utf8")
  : ""
const deploymentGraphChecker = readRequired(deploymentGraphCheckerPath)

if (existsSync(join(operatorRoot, "src/api/runtime/runtime-adapter.ts"))) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}

if (
  !manifestExtensions.includes("runtimePorts: [requirePort(channelPushRuntimePort)]") ||
  !manifestExtensions.includes('export: "createChannelPushVoyantRuntime"')
) {
  violations.push("Distribution manifest must declare the channel-push runtime port and factory")
}
if (
  !domainPackage.includes('"./runtime-contributor"') ||
  !domainPackage.includes('"export": "createDistributionRuntimePortContribution"')
) {
  violations.push(
    "Distribution domain package must publish its neutral Catalog extension contributor",
  )
}
if (existsSync(join(dirname(distributionRoot), "distribution-node"))) {
  violations.push("The retired @voyant-travel/distribution-node package must stay deleted")
}
if (
  !contributor.includes("Promise.resolve()") ||
  !normalizedContributor.includes("host.getRuntimePort(catalogRuntimeServicesPort)") ||
  !contributor.includes("createDistributionRuntime(host.primitives, services)") ||
  !contributor.includes("[channelPushRuntimePort.id]: channelPushRuntime") ||
  !contributor.includes("[catalogDistributionRuntimeExtensionPort.id]") ||
  !contributor.includes("[financeDistributionPaymentPolicyRuntimePort.id]")
) {
  violations.push(
    "Distribution contributor must synchronously provide extensions and defer its Catalog-backed runtime",
  )
}
for (const required of [
  "catalogRuntime.getSourceRegistryFromContext",
  "primitives.database.resolve",
  "withDeps",
]) {
  if (!runtime.includes(required)) {
    violations.push(`Distribution runtime must contain ${JSON.stringify(required)}`)
  }
}
if (
  !extension.includes("defineGraphRuntimeFactory") ||
  !extension.includes("getPort(channelPushRuntimePort)") ||
  !extension.includes("runtime.registerSubscriberRuntime(context)")
) {
  violations.push("Distribution must own channel-push route and subscriber composition")
}
if (
  !runtimePort.includes('id: "distribution.channel-push-runtime"') ||
  !runtimePort.includes("resolveRegistry") ||
  !runtimePort.includes("registerSubscriberRuntime") ||
  !runtimePort.includes("withDeps")
) {
  violations.push("Distribution must publish the typed channel-push runtime dependency contract")
}
if (
  composition.includes('from "@voyant-travel/distribution/runtime-contributor"') ||
  composition.includes("createDistributionRuntimePortContribution") ||
  !composition.includes("options.createRuntimePorts")
) {
  violations.push("Operator must bind Distribution through generated contributor composition")
}
if (
  composition.includes('"@voyant-travel/distribution#channel-push-extension"') ||
  composition.includes("createChannelPushExtension") ||
  composition.includes("loadDistributionChannelPushRuntime")
) {
  violations.push(
    "Operator must not restore channel-push compatibility binding or loader authority",
  )
}
if (existsSync(join(operatorRoot, "src/api/runtime/channel-push-runtime.ts"))) {
  violations.push("Operator channel-push compatibility entrypoint must stay deleted")
}
if (workflowServices) {
  violations.push("Operator must not restore retired workflow-service composition")
}
const compatibilityRoutePath = join(operatorRoot, "src/api/routes/channel-push.ts")
if (existsSync(compatibilityRoutePath)) {
  violations.push("src/api/routes/channel-push.ts must stay deleted")
}
if (
  !deploymentGraphChecker.includes(
    'const operatorChannelPushRoutePath = join(operatorRoot, "src/api/routes/channel-push.ts")',
  ) ||
  !deploymentGraphChecker.includes("if (existsSync(operatorChannelPushRoutePath))")
) {
  violations.push(
    "Deployment-graph verification must model the Operator channel-push compatibility route as deleted",
  )
}
if (/readFile\s*\(\s*operatorChannelPushRoutePath/.test(deploymentGraphChecker)) {
  violations.push("Deployment-graph verification must not read the deleted channel-push route")
}

if (violations.length > 0) {
  console.error("Distribution channel-push runtime authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-distribution-channel-push-runtime-authority: OK (package-owned runtime)")
