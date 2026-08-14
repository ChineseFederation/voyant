export type VoyantCallerType = "session" | "api_key" | "internal" | "app"

/**
 * Who the request represents. Routes under `/v1/admin/*` expect `"staff"`;
 * `/v1/public/*` expects customer/partner/supplier actors.
 *
 * When unset, middleware treats the request as `"staff"` to preserve
 * backwards compatibility with internal-only deployments.
 */
export type Actor = "staff" | "customer" | "partner" | "supplier"

/**
 * Which storefront access key a request presented, classified by prefix alone.
 *
 * `publishable` (`vpk_`) is meant to ship inside a browser bundle or a native
 * app, so it must be assumed public: origin binding is a browser control, not a
 * secrecy guarantee. `secret` (`vsk_`) is server-only and carries the
 * storefront's full, scoped trust.
 *
 * The classification is a CEILING, not an authentication result — a request
 * that merely looks like `vsk_…` still has to authenticate. Naming the kind
 * before authentication is what lets one middleware decide, for every route,
 * whether a browser-resident credential may reach it at all.
 */
export type VoyantStorefrontKeyKind = "publishable" | "secret"

/** Immutable host context carried by an online token minted for an app extension. */
export interface VoyantAppContextConstraint {
  entity: { type: string; id: string } | null
  slot: string | null
}

export interface VoyantAuthContext {
  userId?: string
  sessionId?: string
  /** Explicit admin/customer security realm for session identities. */
  realm?: "admin" | "customer"
  /** True only when auth admitted this request as an anonymous public guest. */
  isAnonymousRequest?: boolean
  organizationId?: string | null
  /** Provider-neutral storefront buyer context selected for this request. */
  buyerAccountId?: string | null
  buyerAccountKind?: "personal" | "business"
  /** Better Auth organization membership container; never a CRM Organization id. */
  authOrganizationId?: string | null
  /** Canonical Relationships Organization id for a business buyer. */
  relationshipOrganizationId?: string | null
  /** Canonical Relationships Person id for the customer identity, including B2B-only users. */
  relationshipPersonId?: string | null
  /** Server-derived Storefront sales-channel context for public storefront requests. */
  storefrontChannel?: {
    storefrontId: string
    channelId: string
    channelStatus?: string | null
  }
  buyerMembershipId?: string | null
  buyerMembershipRole?: string | null
  callerType?: VoyantCallerType
  actor?: Actor
  /**
   * The audience this grant represents (`staff`/`customer`/`partner`/`supplier`).
   * Carried on the api-key grant / token claims, not inferred from scopes, and
   * resolved into the catalog `ResolverScope` at request time. When unset,
   * middleware falls back to `actor`.
   */
  audience?: Actor
  scopes?: string[] | null
  isInternalRequest?: boolean
  apiTokenId?: string
  apiKeyId?: string
  /** Auditable subtype for a trusted delegated principal (for example `max`). */
  principalSubtype?: string
  appId?: string
  appInstallationId?: string
  appReleaseId?: string
  appCredentialGeneration?: number
  /** Stable managed workload-environment identity resolved from app credential state. */
  appWorkloadEnvironmentId?: string
  /** Host contract generation bound to the resolved app credential. */
  appContractGeneration?: number
  appTokenMode?: "offline" | "online"
  appViewerId?: string
  appContextConstraint?: VoyantAppContextConstraint
  /**
   * Kind of storefront access key presented on this request, when one was.
   * Set from the token prefix before any credential is verified, so guards can
   * refuse a browser-resident key on a route that must never accept one.
   */
  storefrontKeyKind?: VoyantStorefrontKeyKind
  email?: string | null
}

/**
 * The `userId` auth mints for a storefront guest.
 *
 * It says "admitted as a public shopper", not "this person". Auth needs *a*
 * principal on the context to admit the request at all, so it uses a fixed
 * placeholder — which means every guest on every deployment carries the same
 * one.
 *
 * That is safe only for as long as nothing treats it as an identity. It is a
 * non-empty string, so every `if (userId)` and every "look this customer up by
 * reference" reads it as a real, stable person and collapses every guest into
 * one. Pass it through {@link identifiedUserId} at any boundary that binds to a
 * customer.
 */
export const ANONYMOUS_STOREFRONT_USER_ID = "anonymous-storefront"

/**
 * The user id when the request represents somebody, and `null` when it does not.
 *
 * Blank and the anonymous-storefront placeholder both mean "nobody in
 * particular" and collapse to `null`, so a caller cannot accidentally bind a
 * customer record, a stored instrument or a session owner to a shared
 * placeholder.
 */
export function identifiedUserId(userId: string | null | undefined): string | null {
  const normalized = userId?.trim()
  return !normalized || normalized === ANONYMOUS_STOREFRONT_USER_ID ? null : normalized
}

export interface VoyantPermission {
  resource: string
  action: string
}

export type VoyantVariables = VoyantAuthContext & {
  db: unknown
}
