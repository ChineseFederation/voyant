import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const rootIndex = process.argv.indexOf("--root")
const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : ".")
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8")
const failures = []

const storageContributor = read("packages/storage/src/runtime-contributor.ts")
const storageRuntime = read("packages/storage/src/runtime.ts")
const inventoryContributor = read("packages/inventory/src/runtime-contributor.ts")
const brochureRuntime = read("packages/inventory/src/brochure-runtime.ts")
const inventoryGraphRuntime = read("packages/inventory/src/graph-runtime.ts")
const inventoryManifest = read("packages/inventory/src/voyant.ts")
const nodeRuntime = read("packages/framework/src/node-runtime.ts")
const deploymentResources = read("packages/runtime/src/deployment-resources.ts")
const storagePackage = JSON.parse(read("packages/storage/package.json"))
const inventoryPackage = JSON.parse(read("packages/inventory/package.json"))
const policy = JSON.parse(read("scripts/fixtures/storage-media-runtime-policy.json"))

for (const relativePath of policy.forbiddenApplicationPaths) {
  if (existsSync(path.join(root, relativePath))) {
    failures.push(`${relativePath} must stay deleted`)
  }
}

if (!storageContributor.includes("primitives: VoyantRuntimeHostPrimitives")) {
  failures.push("Storage contributor must consume generic runtime host primitives")
}
if (
  /capabilities|loadStorageMediaRuntime/.test(storageContributor) ||
  !storageContributor.includes("createStorageRuntime(host.primitives)")
) {
  failures.push("Storage contributor must construct its runtime package-side")
}
if (
  !inventoryContributor.includes("host.hasRuntimePort?.(documentRendererPort)") ||
  !inventoryContributor.includes("host.getRuntimePort<DocumentRenderer>(documentRendererPort)") ||
  !inventoryContributor.includes("createInventoryBrochureRuntime(host.primitives, renderer)") ||
  /runtime\.brochure|host\.capabilities|loadInventoryRuntime/.test(inventoryContributor)
) {
  failures.push(
    "Inventory brochure printer port must be derived package-side from generic primitives and the optional document renderer port",
  )
}

for (const token of policy.storageRuntimeTokens) {
  if (!storageRuntime.includes(token)) failures.push(`Storage runtime must preserve ${token}`)
}
for (const legacyToken of ["MEDIA_BUCKET", "DOCUMENTS_BUCKET", "R2Bucket", "createR2"]) {
  if (storageRuntime.includes(legacyToken)) {
    failures.push(`Storage runtime must not restore legacy binding token ${legacyToken}`)
  }
}
for (const token of policy.brochureRuntimeTokens) {
  if (!brochureRuntime.includes(token)) failures.push(`Brochure runtime must preserve ${token}`)
}
for (const legacyToken of [
  "@voyant-travel/cloud-sdk",
  "VOYANT_API_KEY",
  "VOYANT_CLOUD_API_KEY",
  "VOYANT_CLOUD_API_URL",
  "VOYANT_CLOUD_USER_AGENT",
  "voyant-cloud-browser",
]) {
  if (brochureRuntime.includes(legacyToken)) {
    failures.push(`Brochure runtime must not depend on legacy cloud renderer token ${legacyToken}`)
  }
}

if (!nodeRuntime.includes('from "@voyant-travel/storage/runtime"')) {
  failures.push("Framework Node runtime must consume Storage through its supported runtime API")
}
if (
  storagePackage.exports["./runtime"] !== "./src/runtime.ts" ||
  storagePackage.publishConfig?.exports?.["./runtime"]?.import !== "./dist/runtime.js"
) {
  failures.push("Storage must publish its neutral runtime")
}
if (storagePackage.exports["./standard-node"]) {
  failures.push("Storage must not publish a target-labelled runtime")
}
if (
  storagePackage.exports["./runtime-port"] !== "./src/runtime-port.ts" ||
  storagePackage.publishConfig?.exports?.["./runtime-port"]?.import !== "./dist/runtime-port.js"
) {
  failures.push("Storage must publish its neutral typed runtime port")
}
if (Object.keys(inventoryPackage.exports ?? {}).some((entry) => entry.includes("standard-node"))) {
  failures.push("Inventory must not publish target-labelled standard-node APIs")
}
if (inventoryPackage.exports?.["./brochure-runtime"]) {
  failures.push("Inventory's package-owned brochure runtime must remain private")
}
if (
  !inventoryGraphRuntime.includes('from "@voyant-travel/storage/runtime-port"') ||
  !inventoryGraphRuntime.includes("getPort(storageMediaRuntimePort)") ||
  !inventoryManifest.includes("requirePort(storageMediaRuntimePort)")
) {
  failures.push("Inventory brochure routes must consume Storage through its neutral typed port")
}
if (
  brochureRuntime.includes("@voyant-travel/storage/runtime") ||
  brochureRuntime.includes("createMediaStorage")
) {
  failures.push("Inventory brochure runtime must not import Storage's target-labelled runtime")
}
if (storagePackage.dependencies?.["@voyant-travel/inventory"]) {
  failures.push("Storage must not depend on Inventory")
}
if (storagePackage.dependencies?.["@voyant-travel/hono"]) {
  failures.push("Storage must not create the Hono/public-document-delivery dependency cycle")
}
if (inventoryPackage.dependencies?.["@voyant-travel/storage"] !== "workspace:^") {
  failures.push("Inventory must retain the existing acyclic dependency on Storage")
}
if (/loadStorageMediaRuntime|operatorInventoryBrochureRuntime/.test(deploymentResources)) {
  failures.push("Operator deployment resources must not retain Storage or brochure capabilities")
}

if (failures.length > 0) {
  console.error("check-storage-media-runtime-authority: FAILED")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("check-storage-media-runtime-authority: OK")
