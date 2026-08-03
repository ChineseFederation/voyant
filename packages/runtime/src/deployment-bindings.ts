import {
  canonicalDeploymentProvider,
  DEPLOYMENT_PROVIDER_CONTRACTS,
  type VoyantDeploymentMode,
  type VoyantRedisBindingConstraints,
  type VoyantResponseCachePosture,
} from "@voyant-travel/framework"

export const VOYANT_DEPLOYMENT_BINDINGS_ENV = "VOYANT_DEPLOYMENT_BINDINGS_JSON" as const

export interface GeneratedRuntimeDeploymentBindings {
  mode?: VoyantDeploymentMode
  providers: Readonly<Record<string, string>>
  /** Declared response-cache posture, carried verbatim from the generated graph. */
  responseCache?: VoyantResponseCachePosture
}

export interface ResolvedRuntimeDeploymentBindings {
  /** Retained only for old generated artifacts and external metadata readers. */
  mode?: VoyantDeploymentMode
  providers: Readonly<Record<string, string>>
  redis: VoyantRedisBindingConstraints
  /** Undefined when the deployment declared none; the runtime reads that as no edge tier. */
  responseCache?: VoyantResponseCachePosture
  source: "generated" | "runtime"
}

/**
 * Resolve boot-time provider authority without changing the compiled module graph.
 *
 * New images may overlay generated provider selections through one JSON env value:
 *
 *   {"providers":{"cache":"redis"},"redis":{"isolation":"shared","network":"untrusted"}}
 *
 * Omitting the env preserves old generated-artifact behavior, including the old
 * managed-cloud Redis policy. An explicit runtime selection that uses Redis must
 * declare both Redis properties so a platform binding cannot silently inherit a
 * self-hosted/dedicated default from the image it happens to run.
 */
export function resolveRuntimeDeploymentBindings(
  generated: GeneratedRuntimeDeploymentBindings,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedRuntimeDeploymentBindings {
  const encoded = env[VOYANT_DEPLOYMENT_BINDINGS_ENV]?.trim()
  if (!encoded) {
    return {
      ...(generated.mode ? { mode: generated.mode } : {}),
      providers: normalizeProviders(generated.providers, "generated deployment providers"),
      redis: legacyRedisConstraints(generated.mode),
      ...(generated.responseCache ? { responseCache: generated.responseCache } : {}),
      source: "generated",
    }
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(encoded)
  } catch {
    throw new Error(`${VOYANT_DEPLOYMENT_BINDINGS_ENV} must contain valid JSON.`)
  }
  if (!isPlainRecord(decoded)) {
    throw new Error(`${VOYANT_DEPLOYMENT_BINDINGS_ENV} must contain a JSON object.`)
  }
  assertExactKeys(decoded, ["providers", "redis"], VOYANT_DEPLOYMENT_BINDINGS_ENV)

  const generatedProviders = normalizeProviders(
    generated.providers,
    "generated deployment providers",
  )
  const providerOverrides =
    decoded.providers === undefined
      ? {}
      : normalizeProviders(decoded.providers, `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.providers`)
  const providers = { ...generatedProviders, ...providerOverrides }
  const bindsRedis = ["cache", "sharedState", "rateLimit"].some(
    (role) => providers[role] === "redis",
  )
  if (bindsRedis && decoded.redis === undefined) {
    throw new Error(
      `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis is required when a runtime-selected provider uses Redis. Declare isolation and network explicitly.`,
    )
  }
  if (!bindsRedis && decoded.redis !== undefined) {
    throw new Error(
      `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis is only valid when cache, sharedState, or rateLimit selects Redis.`,
    )
  }

  return {
    ...(generated.mode ? { mode: generated.mode } : {}),
    providers,
    redis: decoded.redis ? parseRedisConstraints(decoded.redis) : dedicatedRedisConstraints(),
    ...(generated.responseCache ? { responseCache: generated.responseCache } : {}),
    source: "runtime",
  }
}

function normalizeProviders(value: unknown, label: string): Record<string, string> {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain string record.`)
  const providers: Record<string, string> = {}
  for (const [role, rawProvider] of Object.entries(value)) {
    if (!role.trim()) throw new Error(`${label} keys must be non-empty strings.`)
    if (role === "auth") {
      throw new Error(
        `${label}.auth is not supported; select adminAuth and customerAuth explicitly.`,
      )
    }
    if (typeof rawProvider !== "string" || !rawProvider.trim()) {
      throw new Error(`${label}.${role} must be a non-empty string.`)
    }
    const provider = canonicalDeploymentProvider(role, rawProvider.trim())
    if (isKnownProviderRole(role)) {
      const accepted = DEPLOYMENT_PROVIDER_CONTRACTS[role] as readonly string[]
      if (!accepted.includes(provider)) {
        throw new Error(
          `${label}.${role} is not supported. Expected one of: ${accepted.join(", ")}.`,
        )
      }
    }
    Object.defineProperty(providers, role, {
      configurable: true,
      enumerable: true,
      value: provider,
      writable: true,
    })
  }
  return providers
}

function parseRedisConstraints(value: unknown): VoyantRedisBindingConstraints {
  if (!isPlainRecord(value)) {
    throw new Error(`${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis must be a JSON object.`)
  }
  assertExactKeys(value, ["isolation", "network"], `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis`)
  if (value.isolation !== "dedicated" && value.isolation !== "shared") {
    throw new Error(
      `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis.isolation must be "dedicated" or "shared".`,
    )
  }
  if (value.network !== "trusted" && value.network !== "untrusted") {
    throw new Error(
      `${VOYANT_DEPLOYMENT_BINDINGS_ENV}.redis.network must be "trusted" or "untrusted".`,
    )
  }
  return { isolation: value.isolation, network: value.network }
}

function legacyRedisConstraints(
  mode: VoyantDeploymentMode | undefined,
): VoyantRedisBindingConstraints {
  return mode === "managed-cloud"
    ? { isolation: "shared", network: "untrusted" }
    : dedicatedRedisConstraints()
}

function dedicatedRedisConstraints(): VoyantRedisBindingConstraints {
  return { isolation: "dedicated", network: "trusted" }
}

function isKnownProviderRole(role: string): role is keyof typeof DEPLOYMENT_PROVIDER_CONTRACTS {
  return Object.hasOwn(DEPLOYMENT_PROVIDER_CONTRACTS, role)
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length > 0) {
    throw new Error(
      `${label} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
    )
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
