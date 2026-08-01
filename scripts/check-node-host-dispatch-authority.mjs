import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const violations = []
const retiredAdapters = [
  "apps/operator/src/workflow-runtime.ts",
  "apps/operator/src/scheduled-crons.ts",
  "apps/operator/src/api-dispatch.ts",
  "apps/operator/src/entry.ts",
  "apps/operator/src/ssr-handler.ts",
]

for (const file of retiredAdapters) {
  if (existsSync(resolve(root, file)))
    violations.push(`${file}: generic host behavior must stay package-owned`)
}

for (const file of [
  "apps/operator/src/workflow-runtime.test.ts",
  "apps/operator/src/scheduled-crons.test.ts",
  "apps/operator/src/api-dispatch.test.ts",
]) {
  if (existsSync(resolve(root, file)))
    violations.push(`${file}: generic tests must be framework-owned`)
}

const runtime = read("packages/runtime/src/index.ts")
for (const token of ["loadVoyantProject", "createVoyantProjectServerEntry"]) {
  requireText(runtime, token, "packages/runtime/src/index.ts")
}

for (const file of [
  "packages/framework/src/node-api-dispatch.ts",
  "packages/framework/src/node-scheduled-jobs.ts",
]) {
  const source = read(file)
  requireAbsent(source, "Operator", file)
  requireAbsent(source, "operator", file)
}

if (violations.length > 0) {
  console.error("Node host dispatch authority check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-node-host-dispatch-authority: OK (application dispatch adapters deleted)")

function read(file) {
  return readFileSync(resolve(root, file), "utf8")
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) violations.push(`${label}: missing ${expected}`)
}

function requireAbsent(source, forbidden, label) {
  if (source.includes(forbidden)) violations.push(`${label}: contains ${forbidden}`)
}
