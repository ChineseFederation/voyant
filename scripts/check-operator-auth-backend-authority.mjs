import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const applicationPath = "apps/operator/src/api/auth/handler.ts"
const retiredCookiePolicyPath = "apps/operator/src/api/auth/cookie-domain.ts"
const runtimePath = "packages/auth/src/node-runtime.ts"
const application = existsSync(join(root, applicationPath))
  ? readFileSync(join(root, applicationPath), "utf8")
  : ""
const failures = []
const applicationLines = application.split("\n").length

if (application && applicationLines > 65) {
  failures.push(`${applicationPath} grew to ${applicationLines} lines; ratchet is 65`)
}

if (existsSync(join(root, retiredCookiePolicyPath))) {
  failures.push(`${retiredCookiePolicyPath} must stay deleted; cookie policy belongs to auth`)
}

for (const token of [
  "createAdminBetterAuth(",
  "createCustomerBetterAuth(",
  "createCloudAdminAuthStart(",
  "revalidateVoyantCloudAdminAuthSession(",
  'auth.all("/auth/',
  'auth.get("/auth/',
  "CLOUD_BETTER_AUTH_ALLOWLIST",
]) {
  if (application.includes(token)) {
    failures.push(`${applicationPath} must not own package auth runtime token ${token}`)
  }
}

if (!existsSync(join(root, runtimePath))) {
  failures.push(`${runtimePath} is required`)
} else {
  const runtime = readFileSync(join(root, runtimePath), "utf8")
  for (const token of [
    "createOperatorAuthNodeRuntime",
    "buildBetterAuthCookieAdvancedOptions",
    "createAdminBetterAuth(",
    "createCustomerBetterAuth(",
    "createCloudAdminAuthStart(",
    "revalidateVoyantCloudAdminAuthSession(",
    'auth.all("/auth/admin/*"',
  ]) {
    if (!runtime.includes(token)) failures.push(`${runtimePath} must contain ${token}`)
  }
  for (const forbidden of ["apps/operator", 'from "@/']) {
    if (runtime.includes(forbidden)) {
      failures.push(`${runtimePath} must not depend on ${forbidden}`)
    }
  }
  if (runtime.includes('auth.all("/auth/*"')) {
    failures.push(`${runtimePath} must not expose the removed root Better Auth route`)
  }
}

if (failures.length > 0) {
  console.error(`Operator auth backend authority check failed:\n- ${failures.join("\n- ")}`)
  process.exit(1)
}

console.log(`Operator auth backend authority: OK (${applicationLines}/65 application lines)`)
