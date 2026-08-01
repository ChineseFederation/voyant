import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const failures = []
const applicationFiles = []
const applicationRoot = join(root, "apps/operator")
const lineRatchet = 100

const lines = applicationFiles.reduce((total, relativePath) => {
  const path = join(applicationRoot, relativePath)
  if (!existsSync(path)) return total
  return total + readFileSync(path, "utf8").split("\n").length
}, 0)
if (lines > lineRatchet) {
  failures.push(
    `operator admin presentation glue grew to ${lines} lines; ratchet is ${lineRatchet}`,
  )
}

const forbidden = [
  "apps/operator/src/lib/dashboard-ssr-query-options.ts",
  "apps/operator/src/components/realtime-live.tsx",
  "apps/operator/src/components/providers/user-provider.tsx",
  "apps/operator/src/lib/admin-destinations.ts",
]
for (const relativePath of forbidden) {
  if (existsSync(join(root, relativePath))) {
    failures.push(`package-owned admin presentation must stay deleted: ${relativePath}`)
  }
}

const requiredTokens = new Map([
  [
    "packages/operator-standard/src/standard-route-files.ts",
    [
      "../../admin/selected-graph-admin.generated",
      'import.meta.glob("../../../src/admin/*/index.tsx"',
      "createStandardOperatorFrontend",
    ],
  ],
  ["packages/operator-standard/src/standard-frontend.tsx", ["createAdminHostWorkspace"]],
  [
    "packages/admin-host/src/admin-presentation.ts",
    ["loadAdminDashboard", "discoverAdminHostExtensions", "createAdminHostPresentation"],
  ],
  [
    "packages/realtime-react/src/admin.tsx",
    [
      "AdminRealtimeProvider",
      "ADMIN_INVALIDATIONS",
      "hasAdminRealtimeSession",
      "createSelectedRealtimeAdminExtension",
    ],
  ],
  [
    "packages/realtime/src/voyant.ts",
    [
      'entry: "@voyant-travel/realtime-react/admin"',
      'export: "createSelectedRealtimeAdminExtension"',
    ],
  ],
  [
    "packages/realtime-react/src/admin-workspace.tsx",
    ["AdminWorkspaceRealtimeProvider", "createRealtimeChannelConnector", "useSession"],
  ],
  ["packages/admin-react/src/user-bindings.tsx", ["createAdminUserBindings"]],
  [
    "packages/admin-host/src/workspace.tsx",
    [
      "createAdminUserBindings",
      "createAdminHostDestinations(presentation.extensions)",
      "AdminWorkspaceShell",
      "auth.signOut()",
    ],
  ],
])

for (const [relativePath, tokens] of requiredTokens) {
  const path = join(root, relativePath)
  if (!existsSync(path)) {
    failures.push(`${relativePath} is required`)
    continue
  }
  const source = readFileSync(path, "utf8")
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${relativePath} must contain ${token}`)
  }
}

const workspaceRoute = join(root, "packages/operator-standard/src/standard-route-files.ts")
const workspaceRouteSource = existsSync(workspaceRoute) ? readFileSync(workspaceRoute, "utf8") : ""
for (const token of [
  "AdminWorkspaceShell",
  "createAdminUserBindings",
  "createAdminHostDestinations",
  "useSignOut",
]) {
  if (workspaceRouteSource.includes(token)) {
    failures.push(`Operator workspace route retains package-owned authority token ${token}`)
  }
}

if (failures.length > 0) {
  console.error("Operator admin presentation authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Operator admin presentation authority: OK (${lines}/${lineRatchet} application lines)`)
