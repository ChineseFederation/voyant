/**
 * Local public-API customer-auth resolver.
 *
 * Implements the `resolveCustomerAuthContext` seam of
 * {@link createOperatorAuthNodeRuntime} for a self-host runtime: instead of
 * fetching a merchant policy from Voyant Cloud, it resolves the presented
 * access key via {@link publicApiRuntimePort}, enforces the operator-declared
 * origin allowlist, and projects the deployment's customer-auth methods,
 * trusted origins, buyer-account policy and decrypted provider secrets into a
 * `CustomerAuthRuntimeContext`.
 *
 * The BFF must forward its browser origin explicitly (never derived from
 * Host/X-Forwarded-Host) plus the key, exactly like the managed broker.
 */
import { classifyPublicApiKeyToken, PUBLIC_API_KEY_HEADER } from "@voyant-travel/core"
import type { CustomerBuyerAccountPolicy } from "./customer-buyer-accounts.js"
import type { CustomerAuthRuntimeContext } from "./node-runtime.js"
import { enabledCustomerSocialProviders, isPublicApiOriginAllowed } from "./public-api-origins.js"
import type {
  PublicApiKeyDto,
  PublicApiResolveContext,
  PublicApiRuntimeProvider,
  ResolvedPublicApiChannel,
} from "./public-api-runtime-port.js"
import type { CustomerAuthMethods } from "./server.js"

/**
 * Default header a public-API BFF uses to declare its browser origin.
 *
 * Renamed from `x-voyant-storefront-origin` with the entity (voyant#4624).
 * Breaking, and deliberately not dual-accepted: the issue offers accepting both
 * spellings as a courtesy rather than a requirement, and a second accepted
 * spelling for a security-relevant header is a second thing to get wrong.
 */
export const PUBLIC_API_ORIGIN_HEADER = "x-voyant-public-origin"
/** Standard browser header a direct (non-BFF) cross-origin client sends. */
export const STANDARD_ORIGIN_HEADER = "origin"
/**
 * Default header carrying the publishable/secret access key.
 *
 * Re-exported rather than redeclared: this file and `@voyant-travel/core` had
 * independently written `"x-api-key"`, and two copies of a header name are two
 * places to change it. Core owns the value; auth keeps the export so its own
 * consumers do not have to reach past it.
 */
export { PUBLIC_API_KEY_HEADER }

const WILDCARD_ORIGIN_PREFIX = "https://*."

/**
 * First exact (non-wildcard) origin a key declares. A wildcard entry names a
 * family of hosts rather than an address, so it cannot stand in as the
 * canonical origin a server-to-server caller failed to send.
 */
function firstExactOrigin(allowedOrigins: readonly string[]): string | null {
  return allowedOrigins.find((origin) => !origin.startsWith(WILDCARD_ORIGIN_PREFIX)) ?? null
}

/**
 * Resolve the browser origin for a request. The BFF forwards its origin
 * explicitly via {@link PUBLIC_API_ORIGIN_HEADER} and that always wins; a
 * direct (non-BFF) cross-origin client carries no BFF header, so fall back to
 * the standard `Origin` header the browser attaches.
 */
export function resolvePublicApiRequestOrigin(
  request: Request,
  originHeader: string = PUBLIC_API_ORIGIN_HEADER,
): string | null {
  const bffOrigin = request.headers.get(originHeader)?.trim()
  if (bffOrigin) return bffOrigin
  const browserOrigin = request.headers.get(STANDARD_ORIGIN_HEADER)?.trim()
  return browserOrigin || null
}

export interface LocalPublicApiCustomerAuthResolverConfig<Env> {
  provider: PublicApiRuntimeProvider
  /**
   * Open the request-time resolve context (db + bindings) for this runtime.
   * The self-host host wires this to its database lifecycle; `dispose` is
   * always awaited, success or failure.
   */
  openResolveContext: (
    env: Env,
    request: Request,
  ) => Promise<{ context: PublicApiResolveContext; dispose?: () => Promise<void> }>
  /** Request-time channel reader — the key's channel, or Direct. */
  resolveChannelForKey?: (
    context: PublicApiResolveContext,
    channelId: string | null,
  ) => Promise<ResolvedPublicApiChannel | null>
  originHeader?: string
  keyHeader?: string
}

/**
 * Reason a public-API customer-auth resolution failed. Every variant is a
 * client-side auth failure (bad/absent credentials or a disallowed origin), not
 * a server fault, so the auth handler maps these to 401/403 — never 500.
 */
export type PublicApiCustomerAuthFailureReason =
  | "missing_origin"
  | "missing_key"
  | "unknown_key"
  | "origin_not_allowed"
  | "missing_channel"

/**
 * Thrown when the presented credentials/origin cannot be resolved. Carries an
 * HTTP status and a stable machine code so the auth handler can translate it
 * into a clean 401 (or 403 for a known key from a disallowed origin) instead of
 * a 500. The message is intentionally non-leaky — it never echoes the key.
 */
export class PublicApiCustomerAuthResolutionError extends Error {
  readonly reason: PublicApiCustomerAuthFailureReason
  /** HTTP status the auth handler should surface (401 unauthorized / 403 forbidden). */
  readonly status: 401 | 403
  /** Stable client-facing error code. */
  readonly code: "unauthorized" | "forbidden"

  constructor(reason: PublicApiCustomerAuthFailureReason, message: string) {
    super(message)
    this.name = "PublicApiCustomerAuthResolutionError"
    this.reason = reason
    this.status = reason === "origin_not_allowed" || reason === "missing_channel" ? 403 : 401
    this.code =
      reason === "origin_not_allowed" || reason === "missing_channel" ? "forbidden" : "unauthorized"
  }
}

function toSocialProviders(
  secrets: Partial<Record<"google" | "facebook" | "apple", Record<string, string>>>,
): CustomerAuthMethods["socialProviders"] {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {}
  for (const [provider, credential] of Object.entries(secrets)) {
    const clientId = credential?.clientId
    const clientSecret = credential?.clientSecret
    if (!clientId || !clientSecret) continue
    providers[provider] = { clientId, clientSecret }
  }
  return providers as CustomerAuthMethods["socialProviders"]
}

/**
 * Build the `resolveCustomerAuthContext` function a self-host runtime passes to
 * {@link createOperatorAuthNodeRuntime}.
 */
export function createLocalPublicApiCustomerAuthResolver<Env>(
  config: LocalPublicApiCustomerAuthResolverConfig<Env>,
): (env: Env, request: Request) => Promise<CustomerAuthRuntimeContext> {
  const originHeader = config.originHeader ?? PUBLIC_API_ORIGIN_HEADER
  const keyHeader = config.keyHeader ?? PUBLIC_API_KEY_HEADER

  return async (env, request) => {
    const token = request.headers.get(keyHeader)?.trim()
    if (!token) {
      throw new PublicApiCustomerAuthResolutionError(
        "missing_key",
        `Local public-API customer auth requires a key (${keyHeader}).`,
      )
    }
    // The key kind decides whether an origin is required, so it has to be read
    // before the origin check rather than after the database lookup.
    const keyKind = classifyPublicApiKeyToken(token)
    const requestOrigin = resolvePublicApiRequestOrigin(request, originHeader)
    // A publishable key is origin-bound: it ships in a browser bundle, so the
    // declared-origin check is the only thing narrowing where it may be used.
    // A secret key is server-only and a genuine server-to-server caller has no
    // origin to send — requiring one made `vsk_` usable ONLY from a BFF
    // forwarding a synthetic header, which is the symmetry voyant#4625 names.
    if (!requestOrigin && keyKind !== "secret") {
      throw new PublicApiCustomerAuthResolutionError(
        "missing_origin",
        `Local public-API customer auth with a publishable key requires ${originHeader} (BFF) or a standard Origin header.`,
      )
    }

    const { context, dispose } = await config.openResolveContext(env, request)
    try {
      const key = await config.provider.resolveApiKeyByToken(context, token)
      if (!key) {
        throw new PublicApiCustomerAuthResolutionError(
          "unknown_key",
          "The presented public API key is unknown or revoked.",
        )
      }
      // An origin that IS presented is always checked, whichever kind sent it:
      // a BFF relaying a real browser origin must still be relaying one this
      // key declared. Only the requirement differs by kind, never the check.
      if (requestOrigin && !isPublicApiOriginAllowed(requestOrigin, key.allowedOrigins)) {
        throw new PublicApiCustomerAuthResolutionError(
          "origin_not_allowed",
          "The request origin is not a declared allowed origin for this key.",
        )
      }
      // Every URL the customer-auth runtime builds (callbacks, invitation
      // accept links, the public API base) needs a canonical origin. A direct
      // server-to-server caller sent none, so fall back to the key's own first
      // declared exact origin — the address its customers actually use.
      const origin = requestOrigin ?? firstExactOrigin(key.allowedOrigins)
      if (!origin) {
        throw new PublicApiCustomerAuthResolutionError(
          "missing_origin",
          "A secret-key customer-auth request needs the key to declare at least one exact allowed origin.",
        )
      }

      const settings = await config.provider.getCustomerAccountSettings(context)
      const enabledProviders = enabledCustomerSocialProviders(settings.methods)
      const secrets = await config.provider.resolveProviderCredentials(context, enabledProviders)
      // A key resolves to the deployment's Direct channel unless it names
      // another, so reaching either branch below means the deployment has no
      // active Direct channel at all — a migration that has not run, not an
      // operator who forgot to configure something.
      if (!config.resolveChannelForKey) {
        throw new PublicApiCustomerAuthResolutionError(
          "missing_channel",
          "This runtime resolves no sales channel for the public surface.",
        )
      }
      const channel = await config.resolveChannelForKey(context, key.channelId)
      if (channel?.channelStatus !== "active") {
        throw new PublicApiCustomerAuthResolutionError(
          "missing_channel",
          "The deployment has no active Direct channel to serve the public surface from.",
        )
      }

      const methods: CustomerAuthMethods = {
        emailCode: settings.methods.emailCode,
        emailPassword: settings.methods.emailPassword,
        socialProviders: toSocialProviders(secrets),
      }

      // Trust every declared exact origin plus the concrete request origin
      // (which covers a `https://*.host` wildcard match, since the browser sends
      // the resolved sub-domain). Wildcard entries themselves are surfaced via
      // `allowedOrigins` for dynamic CORS but kept out of `trustedOrigins`,
      // which the runtime validates as canonical origins.
      const exactAllowedOrigins = key.allowedOrigins.filter(
        (candidate) => !candidate.startsWith(WILDCARD_ORIGIN_PREFIX),
      )
      const trustedOrigins = [...new Set([origin, ...exactAllowedOrigins])]

      return {
        baseURL: origin,
        publicApiBaseURL: `${origin}/api`,
        invitationAcceptBaseURL: origin,
        trustedOrigins,
        allowedOrigins: [...key.allowedOrigins],
        methods,
        accountPolicy: settings.accountPolicy as CustomerBuyerAccountPolicy,
        publicChannel: {
          channelId: channel.channelId,
          channelStatus: channel.channelStatus,
        },
      }
    } finally {
      await dispose?.()
    }
  }
}

/**
 * What augmenting a customer-auth context with the sales channel concluded.
 * Every non-`resolved` variant leaves the public surface without a channel, and
 * they are deliberately distinguishable: "no key", "no channel" and "channel
 * inactive" have different fixes, and a blanket 403 that names none of them is
 * what made #4323 take days instead of minutes.
 */
export type PublicApiChannelResolutionOutcome =
  | "host_provided"
  | "resolved"
  | "key_not_resolved"
  | "channel_missing"
  | "channel_inactive"
  | "lookup_failed"

export interface PublicApiChannelDiagnostic {
  outcome: PublicApiChannelResolutionOutcome
  /** Request origin the key was (or would have been) matched on. */
  origin: string | null
  keyId?: string
  channelId?: string
  channelStatus?: string
  error?: unknown
}

export interface ResolvedPublicApiChannelConfig<Env>
  extends Omit<LocalPublicApiCustomerAuthResolverConfig<Env>, "resolveChannelForKey"> {
  /** Request-time channel reader (deployment database). */
  resolveChannelForKey: (
    context: PublicApiResolveContext,
    channelId: string | null,
  ) => Promise<ResolvedPublicApiChannel | null>
  /** Observability sink; called exactly once per resolution. */
  onDiagnostic?: (diagnostic: PublicApiChannelDiagnostic) => void
}

/**
 * Resolve the key a request speaks for, without re-authenticating it. The
 * presented key selects one exactly; a deployment whose keys are minted
 * elsewhere still declares its origins locally, so fall back to the origin —
 * the same signal keyless CORS preflight is authorized on.
 */
async function resolveKeyForChannel<Env>(
  config: ResolvedPublicApiChannelConfig<Env>,
  context: PublicApiResolveContext,
  request: Request,
  origin: string | null,
): Promise<PublicApiKeyDto | null> {
  const token = request.headers.get(config.keyHeader ?? PUBLIC_API_KEY_HEADER)?.trim()
  if (token) {
    const resolved = await config.provider.resolveApiKeyByToken(context, token)
    if (resolved) return resolved
  }
  if (!origin) return null
  return (await config.provider.resolveApiKeysByOrigin(context, origin))[0] ?? null
}

/**
 * Decorate a `resolveCustomerAuthContext` so the resulting context always
 * carries a sales channel when one exists.
 *
 * The local resolver above derives `publicChannel` itself. A managed deployment
 * supplies its own resolver instead, which brokers credentials through a
 * control plane that has no channel concept — so the context came back without
 * a channel and every `/v1/public/*` catalog read 403ed on a guard that profile
 * could never satisfy ([#4323](https://github.com/voyant-travel/voyant/issues/4323)).
 * Reading it here keeps the two auth profiles from diverging on whether a
 * public surface can obtain a channel.
 *
 * Best effort by construction: a context that already carries a channel is
 * returned untouched, and a failure to resolve one returns the host's context
 * unchanged — the downstream guards still apply — while reporting which state
 * it was in.
 */
export function withResolvedPublicApiChannel<Env>(
  resolveCustomerAuthContext: (
    env: Env,
    request: Request,
  ) => CustomerAuthRuntimeContext | Promise<CustomerAuthRuntimeContext>,
  config: ResolvedPublicApiChannelConfig<Env>,
): (env: Env, request: Request) => Promise<CustomerAuthRuntimeContext> {
  const originHeader = config.originHeader ?? PUBLIC_API_ORIGIN_HEADER
  const report = (diagnostic: PublicApiChannelDiagnostic) => {
    try {
      config.onDiagnostic?.(diagnostic)
    } catch {
      // a diagnostic sink must never break authentication
    }
  }

  return async (env, request) => {
    const context = await resolveCustomerAuthContext(env, request)
    const origin = resolvePublicApiRequestOrigin(request, originHeader)
    if (context.publicChannel) {
      report({
        outcome: "host_provided",
        origin,
        channelId: context.publicChannel.channelId,
        ...(context.publicChannel.channelStatus
          ? { channelStatus: context.publicChannel.channelStatus }
          : {}),
      })
      return context
    }

    const { context: resolveContext, dispose } = await config.openResolveContext(env, request)
    try {
      const key = await resolveKeyForChannel(config, resolveContext, request, origin)
      if (!key) {
        report({ outcome: "key_not_resolved", origin })
        return context
      }
      const channel = await config.resolveChannelForKey(resolveContext, key.channelId)
      if (!channel) {
        report({ outcome: "channel_missing", origin, keyId: key.id })
        return context
      }
      if (channel.channelStatus !== "active") {
        report({
          outcome: "channel_inactive",
          origin,
          keyId: key.id,
          channelId: channel.channelId,
          channelStatus: channel.channelStatus,
        })
        return context
      }
      report({
        outcome: "resolved",
        origin,
        keyId: key.id,
        channelId: channel.channelId,
        channelStatus: channel.channelStatus,
      })
      return {
        ...context,
        publicChannel: {
          channelId: channel.channelId,
          channelStatus: channel.channelStatus,
        },
      }
    } catch (error) {
      // The host already authenticated this request; a channel lookup that
      // faults must not turn a working sign-in into a 500.
      report({ outcome: "lookup_failed", origin, error })
      return context
    } finally {
      await dispose?.()
    }
  }
}

/**
 * Build the request-time dynamic-CORS origin authorizer a self-host runtime
 * passes to {@link createOperatorAuthNodeRuntime} as `resolveCustomerCorsOrigin`.
 *
 * Returns the exact request origin to echo in `Access-Control-Allow-Origin`
 * when a key authorizes it, or `null` when none does (the caller then omits
 * CORS headers so the browser blocks the cross-origin response).
 */
export function createLocalPublicApiCorsOriginResolver<Env>(
  config: LocalPublicApiCustomerAuthResolverConfig<Env>,
): (env: Env, request: Request) => Promise<string | null> {
  const originHeader = config.originHeader ?? PUBLIC_API_ORIGIN_HEADER
  const keyHeader = config.keyHeader ?? PUBLIC_API_KEY_HEADER

  return async (env, request) => {
    const origin = resolvePublicApiRequestOrigin(request, originHeader)
    if (!origin) return null

    const { context, dispose } = await config.openResolveContext(env, request)
    try {
      const token = request.headers.get(keyHeader)?.trim()
      if (token) {
        // Dynamic CORS exists to let a browser talk to this deployment with a
        // publishable key. A secret key is server-only, and server-to-server
        // callers are not subject to CORS at all — so echoing an origin for one
        // would only ever help a browser that has a `vsk_` in it, which is the
        // situation the grant should refuse to normalise (voyant#4625).
        if (classifyPublicApiKeyToken(token) === "secret") return null
        const key = await config.provider.resolveApiKeyByToken(context, token)
        if (!key) return null
        if (!isPublicApiOriginAllowed(origin, key.allowedOrigins)) return null
        if (!config.resolveChannelForKey) return null
        const channel = await config.resolveChannelForKey(context, key.channelId)
        return channel?.channelStatus === "active" ? origin : null
      }
      // Keyless preflight: authorize purely by declared origin.
      const candidates = await config.provider.resolveApiKeysByOrigin(context, origin)
      if (candidates.length === 0 || !config.resolveChannelForKey) return null
      // Compare the channels these keys RESOLVE to, not their stored ids. A key
      // with no channel and one explicitly bound to Direct are the same channel;
      // so is a key whose named channel has gone away and fell back to Direct.
      // Comparing raw ids would deny CORS for an ordinary two-key setup.
      const resolved = new Set<string>()
      for (const channelId of new Set(candidates.map((key) => key.channelId))) {
        const channel = await config.resolveChannelForKey(context, channelId)
        if (channel?.channelStatus !== "active") return null
        resolved.add(channel.channelId)
      }
      // Only genuine disagreement about which channel to serve is ambiguous.
      return resolved.size === 1 ? origin : null
    } finally {
      await dispose?.()
    }
  }
}
