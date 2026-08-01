import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import "./check-node-host-dispatch-authority.mjs"

const root = resolve(import.meta.dirname, "..")
const violations = []
const retiredAdapters = [
  "apps/operator/src/api/app.ts",
  "apps/operator/src/api/auth/handler.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
]
const frameworkFiles = [
  "packages/framework/src/node-deployment-artifacts.ts",
  "packages/framework/src/node-host.ts",
  "packages/framework/src/node-provider-plan.ts",
]

for (const retiredPath of ["apps/operator/src/operator-node-provider-plan.ts"]) {
  if (existsSync(resolve(root, retiredPath))) {
    violations.push(`${retiredPath}: generic Node provider planning must stay framework-owned`)
  }
}

for (const retired of retiredAdapters) {
  if (existsSync(resolve(root, retired)))
    violations.push(`${retired}: generic host adapter must stay deleted`)
}

for (const file of frameworkFiles) {
  const source = read(file)
  requireAbsent(source, "Operator", file)
  requireAbsent(source, "operator", file)
  const productPackage = source.match(/@voyant-travel\/(?!framework(?:[/#"]|$))[^\s"']+/)
  if (productPackage)
    violations.push(`${file}: contains product package authority ${productPackage[0]}`)
}

const frameworkPackage = read("packages/framework/package.json")
requireText(frameworkPackage, '"./node-host": "./src/node-host.ts"', "framework package exports")
requireText(frameworkPackage, '"./node-host"', "framework publish exports")

const server = read("apps/operator/src/server.ts")
requireText(server, 'from "@voyant-travel/runtime"', "Operator Node server")
requireText(server, "createVoyantProjectServerEntry", "Operator Node server")
if (server.split("\n").length > 16)
  violations.push("Operator Node server exceeds 16-line bootstrap budget")
for (const forbidden of [
  "@voyant-travel/framework/node-host",
  "resolveVoyantNodeProviderPlan",
  "@voyant-travel/db",
  "@voyant-travel/distribution",
]) {
  requireAbsent(server, forbidden, "Operator Node server")
}

if (violations.length > 0) {
  console.error("Generic Node bootstrap authority check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-generic-node-bootstrap-authority: OK (one generic Node bootstrap)")

function read(file) {
  return readFileSync(resolve(root, file), "utf8")
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) violations.push(`${label}: missing ${expected}`)
}

function requireAbsent(source, forbidden, label) {
  if (source.includes(forbidden)) violations.push(`${label}: contains ${forbidden}`)
}
