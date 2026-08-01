import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  checkStorefrontPresentationAuthority,
  STOREFRONT_ROUTE_HOSTS,
} from "./lib/storefront-presentation-authority.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(join(root, path), "utf8")
const routeRegistry = read("packages/operator-standard/src/standard-route-files.ts")
const result = checkStorefrontPresentationAuthority({
  routeHosts: Object.fromEntries(
    Object.keys(STOREFRONT_ROUTE_HOSTS).map((file) => [
      file,
      routeRegistry.includes(`"(storefront)/${file}"`)
        ? `createFileRoute operatorFrontend routes.storefront.${STOREFRONT_ROUTE_HOSTS[file]}`
        : undefined,
    ]),
  ),
  hostAdapter: read("packages/operator-standard/src/standard-frontend.tsx"),
  messageAdapter: read("packages/operator-standard/src/standard-frontend.tsx"),
  intakeAdapter: "",
  packagePresentation: read("packages/storefront-react/src/storefront/presentation-routes.tsx"),
  packageIntake: read("packages/relationships/src/storefront-intake-runtime.ts"),
  relationshipsContributor: read("packages/relationships/src/runtime-contributor.ts"),
  graphDeclaration: read("packages/storefront/src/voyant.ts"),
})

if (existsSync(join(root, "apps/operator/src/api/runtime/storefront-intake-runtime.ts"))) {
  result.failures.push("application Storefront intake compatibility facade must stay deleted")
}

if (result.failures.length > 0) {
  console.error(
    `Storefront presentation authority check failed:\n- ${result.failures.join("\n- ")}`,
  )
  process.exit(1)
}

console.log(`Storefront presentation authority: OK (${result.hostLines}/80 host lines)`)
