import {
  canonicalDeploymentProvider,
  type VoyantDeploymentEnvRequirement,
  type VoyantDeploymentProviderRole,
  type VoyantDeploymentProviders,
  type VoyantDeploymentResourceRequirement,
} from "./deployment-types.js"

export function resourceRequirementsFor(
  role: VoyantDeploymentProviderRole,
  providers: VoyantDeploymentProviders,
): VoyantDeploymentResourceRequirement[] {
  return resourceRequirementsForProvider(role, providers[role])
}

export function resourceRequirementsForProvider(
  role: VoyantDeploymentProviderRole,
  provider: string,
): VoyantDeploymentResourceRequirement[] {
  provider = canonicalDeploymentProvider(role, provider)
  if (provider === "none") {
    return [
      {
        resourceKey: resourceKeyFor(role, provider),
        roles: [role],
        provider,
        required: false,
        env: [],
      },
    ]
  }

  const notes = notesForProvider(role, provider)
  return [
    {
      resourceKey: resourceKeyFor(role, provider),
      roles: [role],
      provider,
      required: true,
      env: envForProvider(role, provider),
      ...(notes ? { notes } : {}),
    },
  ]
}

function envForProvider(
  role: VoyantDeploymentProviderRole,
  provider: string,
): readonly VoyantDeploymentEnvRequirement[] {
  if (role === "database" && provider === "postgres") {
    return [
      secret(
        "DATABASE_URL",
        "Primary Postgres connection URL used by migrations and fallback DB clients.",
        true,
        ["DATABASE_URL_DIRECT"],
        "postgres-url",
      ),
      secret(
        "DATABASE_URL_DIRECT",
        "Direct Postgres URL for the resident Node pool.",
        false,
        [],
        "postgres-url",
      ),
      secret(
        "DATABASE_URL_REPLICAS",
        "Comma-separated read replica URLs for the HTTP data plane.",
        false,
      ),
    ]
  }
  if (role === "storage" && provider === "s3-compatible") {
    return [
      variable("S3_REGION", "S3 signing region."),
      variable("STORAGE_MEDIA_BUCKET", "Object bucket for public media."),
      variable("STORAGE_DOCUMENTS_BUCKET", "Object bucket for private/generated documents."),
      variable(
        "S3_ENDPOINT",
        "Optional endpoint for non-AWS S3-compatible object stores.",
        false,
        "http-url",
      ),
      secret("S3_ACCESS_KEY_ID", "Optional explicit S3-compatible access identifier.", false),
      secret("S3_SECRET_ACCESS_KEY", "Optional explicit S3-compatible secret access key.", false),
      secret("S3_SESSION_TOKEN", "Optional temporary S3 session token.", false),
    ]
  }
  if (role === "storage" && provider === "gateway") {
    return [
      variable(
        "STORAGE_GATEWAY_ENDPOINT",
        "Base URL of the managed asset-storage gateway.",
        true,
        "http-url",
      ),
      secret(
        "STORAGE_GATEWAY_TOKEN",
        "Workspace-scoped bearer token for the managed asset-storage gateway.",
        true,
      ),
    ]
  }
  if (
    (role === "cache" || role === "sharedState" || role === "rateLimit") &&
    provider === "redis"
  ) {
    return [
      secret(
        "REDIS_URL",
        "Redis URL used for cache, shared state, and rate limiting. Node runtimes accept redis://, rediss://, or an Upstash-compatible HTTP(S) REST URL with a token.",
        true,
        [],
        "redis-url",
      ),
      variable(
        "REDIS_NAMESPACE",
        "Immutable deployment namespace for framework-owned Redis cache, shared-state, and rate-limit keys.",
        false,
      ),
    ]
  }
  if (
    (role === "cache" || role === "sharedState" || role === "rateLimit") &&
    provider === "postgres"
  ) {
    return [
      secret(
        "DATABASE_URL",
        `Postgres URL used for ${role} shared-state storage.`,
        true,
        ["DATABASE_URL_DIRECT"],
        "postgres-url",
      ),
      secret(
        "DATABASE_URL_DIRECT",
        "Direct Postgres URL for the resident Node pool.",
        false,
        [],
        "postgres-url",
      ),
    ]
  }
  if (role === "search" && provider === "postgres") {
    return [
      secret(
        "DATABASE_URL",
        "Postgres URL used by the catalog search projection.",
        true,
        ["DATABASE_URL_DIRECT"],
        "postgres-url",
      ),
      secret(
        "DATABASE_URL_DIRECT",
        "Direct Postgres URL for the resident catalog search pool.",
        false,
        [],
        "postgres-url",
      ),
    ]
  }
  if (role === "search" && (provider === "typesense" || provider === "algolia")) {
    return provider === "typesense"
      ? [
          variable("TYPESENSE_HOST", "Typesense host URL."),
          secret("TYPESENSE_API_KEY", "Typesense API key."),
          variable(
            "TYPESENSE_COLLECTION_PREFIX",
            "Optional collection-name prefix for multi-tenant shared clusters.",
            false,
          ),
        ]
      : [
          variable("ALGOLIA_APP_ID", "Algolia application id."),
          secret("ALGOLIA_API_KEY", "Algolia API key."),
        ]
  }
  if (role === "email") {
    if (provider === "voyant-cloud") {
      return [
        secret("VOYANT_API_KEY", "Voyant Cloud API key for hosted email delivery."),
        variable("EMAIL_FROM", "Default email sender."),
        variable("EMAIL_REPLY_TO", "Optional comma-separated reply-to addresses.", false),
      ]
    }
    if (provider === "smtp") {
      return [
        variable("SMTP_HOST", "SMTP server hostname."),
        variable("SMTP_PORT", "SMTP server port."),
        secret("SMTP_USER", "SMTP authentication user."),
        secret("SMTP_PASSWORD", "SMTP authentication password."),
        variable("EMAIL_FROM", "Default email sender."),
        variable("EMAIL_REPLY_TO", "Optional comma-separated reply-to addresses.", false),
      ]
    }
    return [
      secret(`${provider.toUpperCase().replace("-", "_")}_API_KEY`, `${provider} email API key.`),
      variable("EMAIL_FROM", "Default email sender."),
      variable("EMAIL_REPLY_TO", "Optional comma-separated reply-to addresses.", false),
    ]
  }
  if (role === "sms") {
    if (provider === "voyant-cloud") {
      return [secret("VOYANT_API_KEY", "Voyant Cloud API key for hosted SMS delivery.")]
    }
    if (provider === "twilio") {
      return [
        secret("TWILIO_ACCOUNT_SID", "Twilio account SID."),
        secret("TWILIO_AUTH_TOKEN", "Twilio auth token."),
        variable("TWILIO_FROM", "Twilio sender phone number."),
      ]
    }
  }
  if (role === "adminAuth" && provider === "voyant-cloud") {
    return [
      variable("VOYANT_CLOUD_DEPLOYMENT_ID", "Voyant Cloud deployment id."),
      variable("VOYANT_CLOUD_ADMIN_AUTH_START_URL", "Cloud admin auth start URL."),
      variable("VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL", "Cloud admin auth token exchange URL."),
      variable("VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL", "Cloud admin auth JWKS URL."),
      variable("VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL", "Cloud admin auth revalidation URL."),
      secret("VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN", "Cloud admin auth client token."),
      secret("SESSION_CLAIMS_ADMIN_SECRET", "Admin session-claims signing secret."),
      secret("BETTER_AUTH_ADMIN_SECRET", "Better Auth admin-realm secret."),
    ]
  }
  if (role === "adminAuth" && provider === "better-auth") {
    return [
      secret("BETTER_AUTH_ADMIN_SECRET", "Better Auth secret used to sign local admin sessions."),
      secret("SESSION_CLAIMS_ADMIN_SECRET", "Admin session-claims signing secret."),
    ]
  }
  if (role === "customerAuth" && provider === "better-auth") {
    return [
      secret(
        "BETTER_AUTH_CUSTOMER_SECRET",
        "Better Auth secret used only for storefront customer sessions.",
      ),
      secret("SESSION_CLAIMS_CUSTOMER_SECRET", "Customer session-claims signing secret."),
      secret(
        "VOYANT_CHECKOUT_CAPABILITY_SECRET",
        "Checkout and guest-booking capability signing secret.",
      ),
    ]
  }
  if (role === "customerAuth" && provider === "disabled") {
    return [
      secret(
        "VOYANT_CHECKOUT_CAPABILITY_SECRET",
        "Checkout and guest-booking capability signing secret.",
      ),
    ]
  }
  if (role === "realtime" && provider === "voyant-cloud") {
    return [
      secret("VOYANT_API_KEY", "Voyant Cloud API key for hosted realtime delivery."),
      variable("VOYANT_CLOUD_API_URL", "Optional Voyant Cloud API base URL.", false, "http-url"),
      variable("VOYANT_CLOUD_USER_AGENT", "Optional Voyant Cloud client user agent.", false),
    ]
  }
  if (role === "scheduledJobs" && provider === "cloud-scheduler") {
    return [
      secret(
        "ORIGIN_TRUST_SECRET",
        "Shared x-voyant-origin-trust secret for scheduled HTTP calls.",
      ),
    ]
  }
  if (role === "outboundWebhooks" && provider === "postgres") {
    return [
      secret(
        "DATABASE_URL",
        "Postgres URL used by the durable outbound webhook enqueue provider.",
        true,
        ["DATABASE_URL_DIRECT"],
        "postgres-url",
      ),
      secret(
        "DATABASE_URL_DIRECT",
        "Direct Postgres URL for durable outbound webhook enqueueing.",
        false,
        [],
        "postgres-url",
      ),
    ]
  }
  if (role === "payments") {
    if (provider === "managed") {
      return [
        variable(
          "VOYANT_PAYMENTS_CONTROL_PLANE_URL",
          "Base URL of the managed payments control plane that serves the provider registry and brokers processor connections.",
          true,
          "http-url",
        ),
        secret(
          "VOYANT_PAYMENTS_CONTROL_PLANE_TOKEN",
          "Trust token authenticating this deployment to the managed payments control plane. Processor credentials are held by the control plane under KMS and never rest in the Operator.",
        ),
      ]
    }
    if (provider === "voyant-pay") {
      return [
        secret("VOYANT_PAYMENTS_API_KEY", "Voyant Pay API key."),
        variable("VOYANT_PAYMENTS_API_URL", "Optional Voyant Pay API base URL.", false, "http-url"),
      ]
    }
  }
  return []
}

function notesForProvider(
  role: VoyantDeploymentProviderRole,
  provider: string,
): string | undefined {
  if (role === "scheduledJobs" && provider === "cloud-scheduler") {
    return "Cloud Scheduler should POST /__voyant/scheduled?schedule=<stable-id> with x-voyant-origin-trust."
  }
  return undefined
}

function resourceKeyFor(role: VoyantDeploymentProviderRole, provider: string): string {
  if (provider === "redis") return "redis"
  if (
    provider === "postgres" &&
    (role === "cache" || role === "sharedState" || role === "rateLimit")
  ) {
    return "postgres-shared-state"
  }
  if (role === "storage" && (provider === "s3-compatible" || provider === "gateway")) {
    return "object-storage"
  }
  return `${role}:${provider}`
}

function secret(
  name: string,
  description: string,
  required = true,
  aliases: readonly string[] = [],
  format?: VoyantDeploymentEnvRequirement["format"],
): VoyantDeploymentEnvRequirement {
  return {
    name,
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(format ? { format } : {}),
    kind: "secret",
    required,
    description,
  }
}

function variable(
  name: string,
  description: string,
  required = true,
  format?: VoyantDeploymentEnvRequirement["format"],
): VoyantDeploymentEnvRequirement {
  return { name, ...(format ? { format } : {}), kind: "variable", required, description }
}
