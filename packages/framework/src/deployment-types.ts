export type VoyantDeploymentMode = "managed-cloud" | "self-hosted" | "local"

/** Whether one Redis keyspace is dedicated to this deployment or shared by several. */
export type VoyantRedisBindingIsolation = "dedicated" | "shared"

/** Whether Redis is reached over a trusted private network or an untrusted network. */
export type VoyantRedisBindingNetwork = "trusted" | "untrusted"

/**
 * Security properties of the concrete Redis binding.
 *
 * These are deliberately independent: sharing requires key namespacing, while
 * an untrusted network requires transport security. Neither property follows
 * from who operates the deployment.
 */
export interface VoyantRedisBindingConstraints {
  isolation: VoyantRedisBindingIsolation
  network: VoyantRedisBindingNetwork
}

export type VoyantDeploymentProviderRole =
  | "database"
  | "storage"
  | "cache"
  | "sharedState"
  | "rateLimit"
  | "search"
  | "email"
  | "sms"
  | "adminAuth"
  | "customerAuth"
  | "realtime"
  | "scheduledJobs"
  | "outboundWebhooks"
  | "payments"

export interface VoyantDeploymentProviders {
  database: "postgres"
  storage: "s3-compatible" | "gateway" | "memory" | "custom"
  cache: "redis" | "postgres" | "platform" | "memory"
  sharedState: "redis" | "postgres" | "platform" | "memory"
  rateLimit: "redis" | "postgres" | "platform" | "memory"
  search: "postgres" | "typesense" | "algolia" | "custom" | "none"
  email: "voyant-cloud" | "resend" | "sendgrid" | "smtp" | "none"
  sms: "voyant-cloud" | "twilio" | "none"
  adminAuth: "voyant-cloud" | "better-auth"
  customerAuth: "better-auth" | "disabled"
  realtime: "voyant-cloud" | "local" | "custom" | "none"
  scheduledJobs: "cloud-scheduler" | "node-cron" | "none"
  outboundWebhooks: "postgres" | "host" | "none"
  payments:
    | "managed"
    | "voyant-pay"
    /** @deprecated Legacy deployment value; normalized to `voyant-pay`. */
    | "voyant-payments"
    | "netopia"
    | "custom"
    | "none"
}

export type VoyantDeploymentEnvValueFormat = "postgres-url" | "redis-url" | "http-url"

export interface VoyantDeploymentEnvRequirement {
  name: string
  aliases?: readonly string[]
  format?: VoyantDeploymentEnvValueFormat
  kind: "secret" | "variable" | "binding"
  required: boolean
  description: string
}

export interface VoyantDeploymentResourceRequirement {
  resourceKey: string
  roles: readonly VoyantDeploymentProviderRole[]
  provider: string
  required: boolean
  env: readonly VoyantDeploymentEnvRequirement[]
  notes?: string
}

export const DEFAULT_MANAGED_CLOUD_PROVIDERS = {
  database: "postgres",
  storage: "s3-compatible",
  cache: "redis",
  sharedState: "postgres",
  rateLimit: "redis",
  search: "postgres",
  email: "voyant-cloud",
  sms: "voyant-cloud",
  adminAuth: "voyant-cloud",
  customerAuth: "better-auth",
  realtime: "voyant-cloud",
  scheduledJobs: "cloud-scheduler",
  outboundWebhooks: "postgres",
  payments: "none",
} as const satisfies VoyantDeploymentProviders

export const DEPLOYMENT_PROVIDER_CONTRACTS = {
  database: ["postgres"],
  storage: ["s3-compatible", "gateway", "memory", "custom"],
  cache: ["redis", "postgres", "platform", "memory"],
  sharedState: ["redis", "postgres", "platform", "memory"],
  rateLimit: ["redis", "postgres", "platform", "memory"],
  search: ["postgres", "typesense", "algolia", "custom", "none"],
  email: ["voyant-cloud", "resend", "sendgrid", "smtp", "none"],
  sms: ["voyant-cloud", "twilio", "none"],
  adminAuth: ["voyant-cloud", "better-auth"],
  customerAuth: ["better-auth", "disabled"],
  realtime: ["voyant-cloud", "local", "custom", "none"],
  scheduledJobs: ["cloud-scheduler", "node-cron", "none"],
  outboundWebhooks: ["postgres", "host", "none"],
  payments: ["managed", "voyant-pay", "voyant-payments", "netopia", "custom", "none"],
} as const satisfies Record<VoyantDeploymentProviderRole, readonly string[]>

/** Normalize legacy provider values at deployment input boundaries. */
export function canonicalDeploymentProvider(
  role: VoyantDeploymentProviderRole | string,
  provider: string,
): string {
  return role === "payments" && provider === "voyant-payments" ? "voyant-pay" : provider
}

export const DEPLOYMENT_PROVIDER_ROLES = Object.keys(
  DEPLOYMENT_PROVIDER_CONTRACTS,
) as VoyantDeploymentProviderRole[]
