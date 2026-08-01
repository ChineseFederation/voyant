import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const paths = {
  manifest: "packages/legal/src/voyant.ts",
  legalModule: "packages/legal/src/index.ts",
  contributor: "packages/legal/src/runtime-contributor.ts",
  distribution: "packages/operator-standard/src/index.ts",
  composition: "packages/runtime/src/deployment-resources.ts",
  config: "apps/operator/voyant.config.ts",
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    ]),
  ),
)

const failures = []
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

rejectMatch(
  sources.distribution,
  /resolve:\s*["']@voyant-travel\/legal\/booking-contract-extension["']/,
  "Standard Operator distribution must not select the retired Legal booking-contract extension",
)
rejectMatch(
  sources.config,
  /resolve:\s*["']@voyant-travel\/legal\/booking-contract-extension["']/,
  "Operator config must not repeat the standard Legal booking-contract extension",
)
requireMatch(
  sources.manifest,
  /runtimePorts:\s*\[[^\]]*requirePort\(legalRuntimePort\)[^\]]*\]/,
  "Legal module must declare its API runtime port",
)
rejectMatch(
  sources.manifest,
  /createLegalBookingContractVoyantRuntime|legalBookingContractConfirmedSubscriber|legalBookingContractSubscriberRuntimePort/,
  "Legal manifest must not retain the retired booking-contract subscriber",
)
rejectMatch(
  sources.legalModule,
  /legalBookingContractConfirmedSubscriber\.register|eventBus\.subscribe\s*\(\s*["']booking\.confirmed["']/,
  "Legal API module must leave subscriber registration to selected-graph lowering",
)
requireMatch(
  sources.contributor,
  /\[legalRuntimePort\.id\]\s*:/,
  "Legal package contributor must provide the API runtime by port id",
)
rejectMatch(
  sources.contributor,
  /legalBookingContractSubscriberRuntimePort/,
  "Legal package contributor must not provide the retired subscriber runtime port",
)
rejectMatch(
  sources.composition,
  /["']@voyant-travel\/legal["']\s*:/,
  "Operator composition must not bind Legal by package id",
)
rejectMatch(
  sources.composition,
  /legalBookingContractConfirmedSubscriber\.register|eventBus\.subscribe[^\n]*booking\.confirmed/,
  "Operator composition must leave Legal subscriber registration to selected-graph lowering",
)

if (failures.length > 0) {
  console.error("Legal subscriber authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Legal subscriber authority: OK")
