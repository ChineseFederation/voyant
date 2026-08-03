import { resolveResponseCachePosture, type VoyantResponseCachePosture } from "./deployment-types.js"

export type VoyantNodeObjectStorageProvider = "memory" | "s3-compatible" | "gateway" | "custom"
export type VoyantNodeKvProvider = "memory" | "postgres" | "redis"

export interface VoyantNodeProviderPlan {
  storage: VoyantNodeObjectStorageProvider
  cache: VoyantNodeKvProvider
  sharedState: VoyantNodeKvProvider
  rateLimit: VoyantNodeKvProvider
}

const KV_PROVIDER_ROLES = ["cache", "sharedState", "rateLimit"] as const

export function resolveVoyantNodeProviderPlan(
  providers: Readonly<Record<string, string>>,
): VoyantNodeProviderPlan {
  return {
    storage: objectStorageProvider(providers, "storage"),
    cache: kvProvider(providers, "cache"),
    sharedState: kvProvider(providers, "sharedState"),
    rateLimit: kvProvider(providers, "rateLimit"),
  }
}

export function validateVoyantNodeProviderPlanEnv(
  plan: VoyantNodeProviderPlan,
  env: Record<string, unknown>,
): string[] {
  const required = new Set<string>()
  let requiresPostgresUrl = false
  if (plan.storage === "s3-compatible") {
    required.add("S3_REGION")
    required.add("STORAGE_MEDIA_BUCKET")
    required.add("STORAGE_DOCUMENTS_BUCKET")
  }
  if (plan.storage === "gateway") {
    required.add("STORAGE_GATEWAY_ENDPOINT")
    required.add("STORAGE_GATEWAY_TOKEN")
  }

  for (const role of KV_PROVIDER_ROLES) {
    if (plan[role] === "redis") required.add("REDIS_URL")
    if (plan[role] === "postgres") requiresPostgresUrl = true
  }

  const issues = Array.from(required)
    .filter((name) => !present(env[name]))
    .map((name) => `env ${name} is required by the Node provider plan`)
  if (requiresPostgresUrl && !present(env.DATABASE_URL) && !present(env.DATABASE_URL_DIRECT)) {
    issues.push("env DATABASE_URL or DATABASE_URL_DIRECT is required by the Node provider plan")
  }
  return issues
}

export interface VoyantNodeDeploymentPostureInput {
  plan: VoyantNodeProviderPlan
  /** Declared response-cache posture, or undefined when the deployment declared none. */
  responseCache?: VoyantResponseCachePosture
  /** Whether the composed graph mounts any public route surface. */
  mountsPublicRoutes: boolean
}

/**
 * Describe the deployment postures a route author cannot see from the header
 * they wrote.
 *
 * These are reports, not failures: every posture below is supported, and a
 * single-instance deployment behind its own reverse proxy may want each one.
 * What is not supported is the deployment being unable to tell.
 */
export function voyantNodeDeploymentPostureReports(
  input: VoyantNodeDeploymentPostureInput,
): string[] {
  const reports: string[] = []
  const posture = resolveResponseCachePosture(input.responseCache)

  if (input.mountsPublicRoutes && input.plan.cache === "postgres" && posture.edge === "none") {
    reports.push(
      'Public routes are mounted with deployment.providers.cache = "postgres" and no declared edge tier. ' +
        "Shared public responses will be read from and written to the same Postgres the routes query, so the tier meant to shield the database is the database. " +
        "The only tier in front of it is a per-process in-memory cache whose entries are capped at 60 seconds, so a route declaring a longer s-maxage still reaches Postgres once per process per minute. " +
        'Either select a response cache that is not the database (deployment.providers.cache = "redis"), or put a standards-compliant HTTP cache in front of the origin and declare it (deployment.responseCache = { edge: "declared" }). ' +
        "See docs/adr/0021-http-response-cache-tiers.md section 7.",
    )
  }

  if (input.plan.rateLimit === "memory") {
    reports.push(
      'deployment.providers.rateLimit = "memory" keeps rate-limit counters in this process only. ' +
        "This runtime cannot observe how many instances or processes serve the deployment; if it is more than one, each enforces the configured limit on its own counter and the effective limit is that many times the declared one. " +
        'Select "redis" or "postgres" for a shared counter, or run exactly one instance.',
    )
  }

  if (input.plan.sharedState === "memory") {
    reports.push(
      'deployment.providers.sharedState = "memory" keeps state in this process only, so nothing is shared despite the name. ' +
        "This runtime cannot observe how many instances or processes serve the deployment; if it is more than one, each holds its own copy and no write crosses them. " +
        'Select "redis" or "postgres" for cross-process state, or run exactly one instance.',
    )
  }

  return reports
}

function objectStorageProvider(
  providers: Readonly<Record<string, string>>,
  role: "storage",
): VoyantNodeObjectStorageProvider {
  const provider = requireProvider(providers, role)
  if (provider === "none" || provider === "memory") return "memory"
  if (provider === "s3-compatible" || provider === "gateway" || provider === "custom") {
    return provider
  }
  throw new Error(
    `deployment graph providers.${role}=${provider} is not supported by the Node runtime`,
  )
}

function kvProvider(
  providers: Readonly<Record<string, string>>,
  role: (typeof KV_PROVIDER_ROLES)[number],
): VoyantNodeKvProvider {
  const provider = requireProvider(providers, role)
  if (provider === "none" || provider === "memory") return "memory"
  if (provider === "redis" || provider === "postgres") return provider
  throw new Error(
    `deployment graph providers.${role}=${provider} is not supported by the Node runtime`,
  )
}

function requireProvider(providers: Readonly<Record<string, string>>, role: string): string {
  const provider = providers[role]
  if (typeof provider === "string" && provider.length > 0) return provider
  throw new Error(`deployment graph providers.${role} must be a non-empty string`)
}

function present(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined
}
