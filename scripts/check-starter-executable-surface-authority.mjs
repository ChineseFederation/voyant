import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const violations = []
const obsoleteStarterFiles = [
  "starters/operator/src/api/routes/charters.ts",
  "starters/operator/src/api/routes/cruises.ts",
  "starters/operator/src/api/jobs/channel-push-scheduled.ts",
  "starters/operator/src/api/jobs/external-cruise-refresh-scheduled.ts",
  "starters/operator/src/api/jobs/workflow-scheduled.ts",
  "starters/operator/src/api/jobs/outbox-drain-scheduled.ts",
  "starters/operator/src/local-scheduled-jobs.ts",
  "starters/operator/src/api/routes/invitations.ts",
  "starters/operator/src/api/routes/team.ts",
  "starters/operator/src/modules/invitations/index.ts",
  "starters/operator/src/modules/team/index.ts",
]

for (const relativePath of obsoleteStarterFiles) {
  if (existsSync(join(root, relativePath))) violations.push(`${relativePath} must stay deleted`)
}

const requiredSourceTokens = new Map([
  ["packages/charters/src/voyant.ts", ["createChartersVoyantRuntime"]],
  [
    "packages/cruises/src/voyant.ts",
    ["createCruisesVoyantRuntime", "cruisesRoutesRuntimePort", "external-cruise-catalog-refresh"],
  ],
  [
    "packages/distribution/src/voyant.ts",
    ["channel-push-booking-link", "channel-push-availability", "channel-push-content"],
  ],
  ["packages/db/src/voyant.ts", ["outbox-drain"]],
  [
    "packages/auth/src/voyant.ts",
    ["authInvitationsVoyantModule", "authTeamVoyantModule", "identityAccessRuntimePort"],
  ],
  [
    "packages/auth/src/identity-access-graph-runtime.ts",
    ["createInvitationsVoyantRuntime", "createTeamVoyantRuntime"],
  ],
])

for (const [relativePath, tokens] of requiredSourceTokens) {
  const path = join(root, relativePath)
  if (!existsSync(path)) {
    violations.push(`${relativePath} is required`)
    continue
  }
  const source = readFileSync(path, "utf8")
  for (const token of tokens) {
    if (!source.includes(token)) violations.push(`${relativePath} must contain ${token}`)
  }
}

if (violations.length > 0) {
  console.error("Starter executable-surface authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-starter-executable-surface-authority: OK")
