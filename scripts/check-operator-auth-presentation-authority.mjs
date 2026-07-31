import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  AUTH_ROUTE_HOSTS,
  checkOperatorAuthPresentationAuthority,
} from "./lib/operator-auth-presentation-authority.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

// The auth route files are no longer hardcoded in operator-standard. The
// local-auth presentation declares its route table in @voyant-travel/auth, and
// the operator-standard generator turns each declaration into a generated host
// binding `operatorFrontend.routes.localAuth!.<member>`. Reconstruct the host
// map from those two sources so this check still asserts package authority over
// the generated auth route files.
const routeRegistry = readFileSync(
  join(root, "packages/operator-standard/src/standard-route-files.ts"),
  "utf8",
)
const authModule = readFileSync(join(root, "packages/auth/src/voyant.ts"), "utf8")

// Derive a route file path from a router path exactly as the generator does.
const routeFilePath = (route) => {
  const withoutLeadingSlash = route.slice(1)
  const groupMatch = /^(\([^)]+\))(?:\/(.*))?$/.exec(withoutLeadingSlash)
  if (groupMatch) {
    const [, group, rest] = groupMatch
    return rest === undefined ? `${group}/route.tsx` : `${group}/${rest.replaceAll("/", ".")}.tsx`
  }
  return `${withoutLeadingSlash.replaceAll("/", ".")}.tsx`
}

// The generator must still emit the generic package-owned host binding; without
// it the declarations would not be routed through the operator frontend.
const emitsPackagedHost =
  routeRegistry.includes("createFileRoute") &&
  // biome-ignore lint/suspicious/noTemplateCurlyInString: matches the generator's literal source template.
  routeRegistry.includes("operatorFrontend.routes.${contribution}!.${member}")

const routeHosts = Object.fromEntries(
  Object.entries(AUTH_ROUTE_HOSTS).map(([file, routeKey]) => {
    const declared = new RegExp(`route:\\s*"(/\\(auth\\)[^"]*)",\\s*member:\\s*"${routeKey}"`).exec(
      authModule,
    )
    const hosted =
      emitsPackagedHost && declared !== null && routeFilePath(declared[1]) === `(auth)/${file}`
    return [
      file,
      hosted ? `createFileRoute operatorFrontend routes.localAuth!.${routeKey}` : undefined,
    ]
  }),
)
const result = checkOperatorAuthPresentationAuthority({
  routeHosts,
  adapter: readFileSync(join(root, "packages/operator-standard/src/standard-frontend.tsx"), "utf8"),
  packageRoutes: readFileSync(join(root, "packages/auth-react/src/local-auth-routes.tsx"), "utf8"),
})

if (result.failures.length > 0) {
  console.error(
    `Operator auth presentation authority check failed:\n- ${result.failures.join("\n- ")}`,
  )
  process.exit(1)
}

console.log(`Operator auth presentation authority: OK (${result.hostLines}/70 host lines)`)
