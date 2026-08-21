import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const rootIndex = process.argv.indexOf("--root")
const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : ".")
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8")
const failures = []

const applicationRuntimePath = "apps/operator/src/lib/realtime.ts"
const applicationTestPath = "apps/operator/src/lib/realtime.test.ts"
const deploymentResources = read("packages/runtime/src/deployment-resources.ts")
const contributor = read("packages/realtime/src/runtime-contributor.ts")
const runtime = read("packages/realtime/src/runtime.ts")
const manifest = read("packages/realtime/src/voyant.ts")
const localProvider = read("packages/realtime/src/providers/local.ts")
const cloudProvider = read("packages/realtime/src/providers/voyant-cloud.ts")
const packageJson = JSON.parse(read("packages/realtime/package.json"))
const retiredAdapterPath = "apps/operator/src/api/runtime/runtime-adapter.ts"
if (existsSync(path.join(root, retiredAdapterPath))) {
  failures.push(`${retiredAdapterPath} must stay deleted`)
}
const expectedRoutePolicy = JSON.parse(read("scripts/fixtures/realtime-route-policy.json"))

if (
  existsSync(path.join(root, applicationRuntimePath)) ||
  existsSync(path.join(root, applicationTestPath))
) {
  failures.push("Operator must not retain Realtime provider or route authority")
}
if (
  /loadRealtimeRuntime|operatorRealtimeBridgeRoutes|resolveRealtimeProviders/.test(
    deploymentResources,
  )
) {
  failures.push("Operator deployment resources must not load package-specific Realtime runtime")
}
if (/capabilities|loadRealtimeRuntime/.test(contributor)) {
  failures.push("Realtime contributor must not depend on a package-specific host capability")
}
if (
  !contributor.includes("realtimeTransportRuntimePort") ||
  !contributor.includes("host.getRuntimePort<RealtimeProvider>(realtimeTransportRuntimePort)") ||
  !contributor.includes("createRealtimeRuntime(transport)") ||
  !runtime.includes("resolveProviders: () => (provider ? [provider] : [])")
) {
  failures.push("Realtime runtime must consume only the graph-selected transport port")
}

if (/VOYANT_|createVoyantCloudRealtimeProvider|createLocalRealtimeProvider/.test(runtime)) {
  failures.push("Realtime runtime must not rediscover or construct deployment providers")
}

for (const token of [
  'selection: { role: "realtime", value: "local" }',
  'selection: { role: "realtime", value: "voyant-cloud" }',
  'export: "createLocalGraphRealtimeProvider"',
  'export: "createVoyantCloudGraphRealtimeProvider"',
  "@voyant-travel/realtime#secret.voyant-cloud-api-key",
]) {
  if (!manifest.includes(token)) failures.push(`Realtime manifest must preserve ${token}`)
}
if (!localProvider.includes("createLocalGraphRealtimeProvider")) {
  failures.push("Realtime local provider must expose its graph-selected factory")
}
for (const token of [
  "createVoyantCloudGraphRealtimeProvider",
  "context.getSecret(REALTIME_VOYANT_CLOUD_API_KEY_SECRET_ID)",
  "context.getConfig(REALTIME_VOYANT_CLOUD_BASE_URL_CONFIG_ID)",
  "context.getConfig(REALTIME_VOYANT_CLOUD_USER_AGENT_CONFIG_ID)",
  "createVoyantCloudClient",
]) {
  if (!cloudProvider.includes(token)) {
    failures.push(`Realtime cloud provider must preserve ${token}`)
  }
}
if (runtime.includes("bridgeRoutes:")) {
  failures.push("Realtime runtime must use selected subscriber descriptors, not bridgeRoutes")
}

const routeEvents = [...runtime.matchAll(/^\s{2}"([a-z][a-z0-9._-]+)":\s*(?:\(|\{)/gm)].map(
  (match) => match[1],
)
const descriptorEvents = [
  ...runtime.matchAll(/invalidationSubscriber\(\s*"([a-z][a-z0-9._-]+)"\s*,?\s*\)/g),
].map((match) => match[1])
const manifestEntries = [
  ...manifest.matchAll(
    /\[\s*"([a-z][a-z0-9._-]+)",\s*"(realtime[A-Za-z]+InvalidationSubscriber)"\s*,?\s*\]/g,
  ),
].map((match) => ({ eventType: match[1], exportName: match[2] }))

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index)
if (routeEvents.length === 0) failures.push("Realtime route table must not be empty")
if (duplicates(routeEvents).length > 0) failures.push("Realtime route events must be unique")
if (duplicates(descriptorEvents).length > 0) failures.push("Realtime descriptors must be unique")
if (duplicates(manifestEntries.map(({ eventType }) => eventType)).length > 0) {
  failures.push("Realtime manifest events must be unique")
}

const sorted = (values) => [...values].sort().join("\n")
if (sorted(routeEvents) !== sorted(descriptorEvents)) {
  failures.push("Every Realtime route must have exactly one package-owned runtime descriptor")
}
if (sorted(routeEvents) !== sorted(manifestEntries.map(({ eventType }) => eventType))) {
  failures.push("Every Realtime route descriptor must be selected by the package manifest")
}

const observedRoutePolicy = {}
for (const match of runtime.matchAll(
  /"([a-z][a-z0-9._-]+)":\s*\(event\)\s*=>\s*adminHint\(\s*"([a-z-]+)",\s*firstId\(event,\s*([^)]*)\)\s*,?\s*\)/g,
)) {
  observedRoutePolicy[match[1]] = {
    entity: match[2],
    idKeys: [...match[3].matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((key) => key[1]),
    kind: "admin",
  }
}
for (const match of runtime.matchAll(
  /"([a-z][a-z0-9._-]+)":\s*\(event\)\s*=>\s*bookingHint\(event,\s*"(booking|payment)"\)/g,
)) {
  observedRoutePolicy[match[1]] = { entity: match[2], kind: "booking" }
}
if (
  /"availability\.slot\.changed":[\s\S]*?channels:\s*\["admin",\s*`product:\$\{productId\}`\][\s\S]*?hint:\s*\{\s*entity:\s*"availability",\s*id:\s*productId\s*\}/.test(
    runtime,
  )
) {
  observedRoutePolicy["availability.slot.changed"] = { kind: "availability" }
}
const orderedPolicy = (policy) =>
  Object.fromEntries(Object.entries(policy).sort(([left], [right]) => left.localeCompare(right)))
if (
  JSON.stringify(orderedPolicy(observedRoutePolicy)) !==
  JSON.stringify(orderedPolicy(expectedRoutePolicy))
) {
  failures.push("Realtime event-to-channel route behavior must match the preserved policy fixture")
}
if (
  !/channels:\s*\["admin",\s*`booking:\$\{bookingId\}`\]/.test(runtime) ||
  !/channels:\s*\["admin",\s*`product:\$\{productId\}`\]/.test(runtime)
) {
  failures.push("Realtime detail routes must preserve booking and product channel fan-out")
}
for (const { exportName } of manifestEntries) {
  if (!runtime.includes(`export const ${exportName} =`)) {
    failures.push(`Realtime manifest references missing runtime export ${exportName}`)
  }
}
if (!manifest.includes('source: "@voyant-travel/realtime/runtime"')) {
  failures.push("Realtime subscribers must load from the package-owned runtime")
}
if (packageJson.dependencies?.["@voyant-travel/cloud-sdk"] !== "^0.11.0") {
  failures.push("Realtime must directly declare its acyclic Cloud SDK provider dependency")
}
if (packageJson.exports?.["./runtime"] !== "./src/runtime.ts") {
  failures.push("Realtime must export its neutral runtime source entry")
}
if (packageJson.exports?.["./standard-node"]) {
  failures.push("Realtime must not export a target-labelled runtime entry")
}

if (failures.length > 0) {
  console.error("Realtime runtime authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Realtime runtime authority: OK (${routeEvents.length} package-owned routes and selected descriptors; 0 Operator loaders)`,
)
