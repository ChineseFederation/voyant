/**
 * Local storefront customer-auth resolver.
 *
 * Implements the `resolveCustomerAuthContext` seam of
 * {@link createOperatorAuthNodeRuntime} for a self-host runtime: instead of
 * fetching a merchant policy from Voyant Cloud, it resolves the storefront from
 * the presented access key via {@link storefrontRuntimePort}, enforces the
 * operator-declared origin allowlist, and projects the storefront's methods,
 * trusted origins, buyer-account policy, and decrypted provider secrets into a
 * `CustomerAuthRuntimeContext`.
 *
 * The BFF must forward the storefront origin explicitly (never derived from
 * Host/X-Forwarded-Host) plus the storefront key, exactly like the managed
 * broker.
 */
import type { CustomerBuyerAccountPolicy } from "./customer-buyer-accounts.js"
import type { CustomerAuthRuntimeContext } from "./node-runtime.js"
import type { CustomerAuthMethods } from "./server.js"
import {
  enabledStorefrontSocialProviders,
  isStorefrontOriginAllowed,
} from "./storefront-origins.js"
import type {
  StorefrontChannelBindingDto,
  StorefrontResolveContext,
  StorefrontRuntimeProvider,
} from "./storefront-runtime-port.js"

/** Default header the storefront BFF uses to declare its browser origin. */
export const STOREFRONT_ORIGIN_HEADER = "x-voyant-storefront-origin"
/** Standard browser header a direct (non-BFF) cross-origin client sends. */
export const STANDARD_ORIGIN_HEADER = "origin"
/** Default header carrying the storefront's publishable/secret access key. */
export const STOREFRONT_KEY_HEADER = "x-api-key"

const WILDCARD_ORIGIN_PREFIX = "https://*."

/**
 * Resolve the storefront browser origin for a request. The BFF forwards its
 * origin explicitly via {@link STOREFRONT_ORIGIN_HEADER} and that always wins;
 * a direct (non-BFF) cross-origin client carries no BFF header, so fall back to
 * the standard `Origin` header the browser attaches. Same-origin server
 * requests keep sending the BFF header exactly as before.
 */
export function resolveStorefrontRequestOrigin(
  request: Request,
  originHeader: string = STOREFRONT_ORIGIN_HEADER,
): string | null {
  const bffOrigin = request.headers.get(originHeader)?.trim()
  if (bffOrigin) return bffOrigin
  const browserOrigin = request.headers.get(STANDARD_ORIGIN_HEADER)?.trim()
  return browserOrigin || null
}

export interface LocalStorefrontCustomerAuthResolverConfig<Env> {
  provider: StorefrontRuntimeProvider
  /**
   * Open the request-time resolve context (db + bindings) for this runtime.
   * The self-host host wires this to its database lifecycle; `dispose` is
   * always awaited, success or failure.
   */
  openResolveContext: (
    env: Env,
    request: Request,
  ) => Promise<{ context: StorefrontResolveContext; dispose?: () => Promise<void> }>
  /** Optional request-time Storefront -> Channel binding reader. */
  resolveStorefrontChannelBinding?: (
    context: StorefrontResolveContext,
    storefrontId: string,
  ) => Promise<StorefrontChannelBindingDto | null>
  originHeader?: string
  keyHeader?: string
}

/**
 * Reason a storefront customer-auth resolution failed. Every variant is a
 * client-side auth failure (bad/absent credentials or a disallowed origin), not
 * a server fault, so the auth handler maps these to 401/403 — never 500.
 */
export type StorefrontCustomerAuthFailureReason =
  | "missing_origin"
  | "missing_key"
  | "unknown_key"
  | "origin_not_allowed"
  | "missing_channel_binding"

/**
 * Thrown by the local storefront customer-auth resolver when the presented
 * credentials/origin cannot be resolved to a storefront. Carries an HTTP status
 * and a stable machine code so the auth handler can translate it into a clean
 * 401 (or 403 for a known key from a disallowed origin) instead of a 500. The
 * message is intentionally non-leaky — it never echoes the presented key.
 */
export class StorefrontCustomerAuthResolutionError extends Error {
  readonly reason: StorefrontCustomerAuthFailureReason
  /** HTTP status the auth handler should surface (401 unauthorized / 403 forbidden). */
  readonly status: 401 | 403
  /** Stable client-facing error code. */
  readonly code: "unauthorized" | "forbidden"

  constructor(reason: StorefrontCustomerAuthFailureReason, message: string) {
    super(message)
    this.name = "StorefrontCustomerAuthResolutionError"
    this.reason = reason
    this.status =
      reason === "origin_not_allowed" || reason === "missing_channel_binding" ? 403 : 401
    this.code =
      reason === "origin_not_allowed" || reason === "missing_channel_binding"
        ? "forbidden"
        : "unauthorized"
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
 * {@link createOperatorAuthNodeRuntime}. Keeps the existing seam intact — this
 * is simply the local (port-backed) option alongside the env default and the
 * managed cloud fetch.
 */
export function createLocalStorefrontCustomerAuthResolver<Env>(
  config: LocalStorefrontCustomerAuthResolverConfig<Env>,
): (env: Env, request: Request) => Promise<CustomerAuthRuntimeContext> {
  const originHeader = config.originHeader ?? STOREFRONT_ORIGIN_HEADER
  const keyHeader = config.keyHeader ?? STOREFRONT_KEY_HEADER

  return async (env, request) => {
    const origin = resolveStorefrontRequestOrigin(request, originHeader)
    if (!origin) {
      throw new StorefrontCustomerAuthResolutionError(
        "missing_origin",
        `Local storefront customer auth requires ${originHeader} (BFF) or a standard Origin header.`,
      )
    }
    const token = request.headers.get(keyHeader)?.trim()
    if (!token) {
      throw new StorefrontCustomerAuthResolutionError(
        "missing_key",
        `Local storefront customer auth requires a storefront key (${keyHeader}).`,
      )
    }

    const { context, dispose } = await config.openResolveContext(env, request)
    try {
      const resolved = await config.provider.resolveStorefrontByApiKey(context, token)
      if (!resolved) {
        throw new StorefrontCustomerAuthResolutionError(
          "unknown_key",
          "The presented storefront key is unknown or revoked.",
        )
      }
      const { storefront } = resolved
      if (!isStorefrontOriginAllowed(origin, storefront.allowedOrigins)) {
        throw new StorefrontCustomerAuthResolutionError(
          "origin_not_allowed",
          "The request origin is not a declared allowed origin for this storefront.",
        )
      }

      const enabledProviders = enabledStorefrontSocialProviders(storefront.methods)
      const secrets = await config.provider.resolveProviderCredentials(
        context,
        storefront.id,
        enabledProviders,
      )
      if (!config.resolveStorefrontChannelBinding) {
        throw new StorefrontCustomerAuthResolutionError(
          "missing_channel_binding",
          "The storefront is not bound to an active sales channel.",
        )
      }
      const channelBinding = await config.resolveStorefrontChannelBinding(context, storefront.id)
      if (!channelBinding || channelBinding.channelStatus !== "active") {
        throw new StorefrontCustomerAuthResolutionError(
          "missing_channel_binding",
          "The storefront is not bound to an active sales channel.",
        )
      }

      const methods: CustomerAuthMethods = {
        emailCode: storefront.methods.emailCode,
        emailPassword: storefront.methods.emailPassword,
        socialProviders: toSocialProviders(secrets),
      }

      // Trust every declared exact origin plus the concrete request origin (which
      // covers a `https://*.host` wildcard match, since the browser sends the
      // resolved sub-domain). Wildcard entries themselves are surfaced via
      // `allowedOrigins` for dynamic CORS but kept out of `trustedOrigins`, which
      // the runtime validates as canonical origins.
      const exactAllowedOrigins = storefront.allowedOrigins.filter(
        (candidate) => !candidate.startsWith(WILDCARD_ORIGIN_PREFIX),
      )
      const trustedOrigins = [...new Set([origin, ...exactAllowedOrigins])]

      return {
        baseURL: origin,
        publicApiBaseURL: `${origin}/api`,
        invitationAcceptBaseURL: origin,
        trustedOrigins,
        allowedOrigins: [...storefront.allowedOrigins],
        methods,
        accountPolicy: storefront.accountPolicy as CustomerBuyerAccountPolicy,
        storefrontChannel: {
          storefrontId: channelBinding.storefrontId,
          channelId: channelBinding.channelId,
          channelStatus: channelBinding.channelStatus,
        },
      }
    } finally {
      await dispose?.()
    }
  }
}

/**
 * Build the request-time dynamic-CORS origin authorizer a self-host runtime
 * passes to {@link createOperatorAuthNodeRuntime} as `resolveCustomerCorsOrigin`.
 *
 * Returns the exact request origin to echo in `Access-Control-Allow-Origin` when
 * a storefront authorizes it, or `null` when it does not (the caller then omits
 * CORS headers so the browser blocks the cross-origin response).
 *
 * Two request shapes are handled:
 *  - Real/credentialed requests carry the publishable/secret key: the storefront
 *    is resolved by key and the origin checked against its declared origins.
 *  - CORS preflight (`OPTIONS`) carries no key or cookies, so the origin is
 *    matched against any storefront that declares it via
 *    {@link StorefrontRuntimeProvider.resolveStorefrontByOrigin}. This never
 *    echoes an origin that no storefront allows.
 */
export function createLocalStorefrontCorsOriginResolver<Env>(
  config: LocalStorefrontCustomerAuthResolverConfig<Env>,
): (env: Env, request: Request) => Promise<string | null> {
  const originHeader = config.originHeader ?? STOREFRONT_ORIGIN_HEADER
  const keyHeader = config.keyHeader ?? STOREFRONT_KEY_HEADER

  return async (env, request) => {
    const origin = resolveStorefrontRequestOrigin(request, originHeader)
    if (!origin) return null

    const { context, dispose } = await config.openResolveContext(env, request)
    try {
      const token = request.headers.get(keyHeader)?.trim()
      if (token) {
        const resolved = await config.provider.resolveStorefrontByApiKey(context, token)
        if (!resolved) return null
        if (!isStorefrontOriginAllowed(origin, resolved.storefront.allowedOrigins)) return null
        if (!config.resolveStorefrontChannelBinding) return null
        const binding = await config.resolveStorefrontChannelBinding(
          context,
          resolved.storefront.id,
        )
        return binding?.channelStatus === "active" ? origin : null
      }
      // Keyless preflight: authorize purely by declared origin.
      const storefront = await config.provider.resolveStorefrontByOrigin(context, origin)
      if (!storefront || !config.resolveStorefrontChannelBinding) return null
      const binding = await config.resolveStorefrontChannelBinding(context, storefront.id)
      return binding?.channelStatus === "active" ? origin : null
    } finally {
      await dispose?.()
    }
  }
}
