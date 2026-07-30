import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const [deploymentResources, bookingsContributor, financeContributor, quotesContributor] =
  await Promise.all([
    read("packages/runtime/src/deployment-resources.ts"),
    read("packages/bookings/src/runtime-contributor.ts"),
    read("packages/finance/src/runtime-contributor.ts"),
    read("packages/quotes/src/runtime-contributor.ts"),
  ])

const packagePorts = {
  bookings: ["actionLedgerBookingDriftRuntimePort"],
  finance: ["financeHostRuntimePort", "bookingsFinanceRuntimePort"],
  quotes: ["quotesRuntimePort", "quotesProposalRuntimePort", "quotesSnapshotRuntimePort"],
}
const contributors = {
  bookings: bookingsContributor,
  finance: financeContributor,
  quotes: quotesContributor,
}

const violations = []
for (const [packageName, ports] of Object.entries(packagePorts)) {
  for (const port of ports) {
    if (deploymentResources.includes(port)) {
      violations.push(`deployment-resources.ts must not register or import ${port}`)
    }
    if (!contributors[packageName].includes(`[${port}.id]`)) {
      violations.push(`${packageName} runtime contributor must own ${port}`)
    }
  }
}

for (const factory of [
  "createBookingsRuntimePortContribution",
  "createFinanceRuntimePortContribution",
  "createQuotesRuntimePortContribution",
]) {
  if (deploymentResources.includes(factory)) {
    violations.push(`deployment-resources.ts must not enumerate ${factory}`)
  }
}

const residualRegistrations = deploymentResources.match(/^\s+\[[A-Za-z][A-Za-z0-9]*Port\.id\]/gm)
if ((residualRegistrations?.length ?? 0) > 22) {
  violations.push(
    `deployment-resources.ts has ${residualRegistrations?.length ?? 0} direct runtime-port registrations; expected at most 22`,
  )
}

if (violations.length > 0) {
  throw new Error(`check-operator-booking-finance-runtime-authority:\n- ${violations.join("\n- ")}`)
}

const movedCount = Object.values(packagePorts).flat().length
console.log(
  `check-operator-booking-finance-runtime-authority: OK (${movedCount} package-owned registrations; ${residualRegistrations?.length ?? 0} direct registrations remain)`,
)
