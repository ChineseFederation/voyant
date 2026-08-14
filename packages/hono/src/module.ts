import type { Extension, Module } from "@voyant-travel/core"
import type { Hono } from "hono"

import type { LazyApiRoutes, LazyRoutesLoader } from "./lazy-routes.js"
import type { VoyantAuthIntegration } from "./types.js"

export interface ApiModule {
  module: Module
  /** Staff-facing routes — mounted at `/v1/admin/{module.name}`. */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  adminRoutes?: Hono<any>
  /** Customer/partner/supplier-facing routes — mounted at `/v1/public/{module.name}`. */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  publicRoutes?: Hono<any>
  /**
   * Inbound webhook routes — e.g. a payment-processor callback POSTed by an
   * external system with no session. Mounted at `/v1/{module.name}` (so existing
   * processor-registered callback URLs are preserved), and their concrete paths
   * are AUTOMATICALLY added to the anonymous allow-list (ADR-0008) — no
   * `anonymous` declaration or `publicPaths` entry needed. The handler is
   * responsible for verifying the provider signature. Distinct from `routes`
   * (deprecated catch-all) and from `publicRoutes` (session-bearing customer
   * surface): a webhook is unauthenticated by construction and verified in-band.
   * Only concrete paths are auto-allow-listed; parameterized/wildcard webhook
   * paths must additionally be declared via `anonymous`.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  webhookRoutes?: Hono<any>
  /**
   * Lazy variant of `adminRoutes` — the route bundle is dynamically imported on
   * first request and cached per isolate. Mounted at `/v1/admin/{module.name}`
   * with the request context bridged in, so it behaves identically to eager
   * `adminRoutes`. Use for heavy route families to protect Worker cold start.
   */
  lazyAdminRoutes?: LazyRoutesLoader
  /** Lazy variant of `publicRoutes` — mounted at `/v1/public/{publicPath ?? module.name}`. */
  lazyPublicRoutes?: LazyRoutesLoader
  /**
   * Deployment-local lazy family spanning explicit absolute path matchers (for
   * route bundles that don't fit a single admin/public surface). The loader
   * returns ABSOLUTE routes; the framework mounts + caches them with the request
   * context bridged in. Context-preserving replacement for `mountLazyRouteApp`.
   */
  lazyRoutes?: LazyApiRoutes
  /**
   * Optional override for the public mount path relative to `/v1/public`.
   *
   * Defaults to `{module.name}`. Use `"/"` to mount a module directly at the
   * public root and omit the extra module segment.
   */
  publicPath?: string
  /**
   * Declares which of this module's PUBLIC routes are reachable without a
   * session (ADR-0008). `true` = the whole public mount is anonymous; a string
   * array = specific sub-paths relative to the public mount (e.g.
   * `["/contact-exists"]` on a module mounted at `/v1/public/customer-portal`
   * opens `/v1/public/customer-portal/contact-exists`). The framework assembles
   * the global anonymous allow-list from these declarations, so the
   * "reachable-without-auth" decision lives next to the route rather than in a
   * hand-maintained `publicPaths` list. Anonymous public requests are marked as
   * guests and do not receive a synthetic actor. Only affects the public
   * surface — admin routes always require a `staff` actor.
   */
  anonymous?: boolean | readonly string[]
  /**
   * Declares which of this module's PUBLIC routes a PUBLISHABLE (`vpk_`)
   * storefront key may call. `true` = the whole public mount; a string array =
   * sub-paths relative to the public mount, exactly like {@link anonymous}.
   *
   * Undeclared means secret-key-only. The two declarations answer different
   * questions and neither implies the other: `anonymous` says "no customer
   * session needed", `publishable` says "a credential that ships in a browser
   * bundle may reach this". A catalog read is usually both; committing a
   * booking is publishable but not anonymous; an operator-wide export may be
   * neither.
   */
  publishable?: boolean | readonly string[]
  /**
   * Public sub-paths that capture person data with nothing challenging the
   * submitter — a lead form, a newsletter sign-up, a booking inquiry. Same
   * mount-relative shape as {@link anonymous}.
   *
   * These are reachable with a publishable key ONLY on a deployment that has an
   * intake guard configured (`publicIntakeGuarded`); without one they are
   * secret-key-only. Kept separate from `publishable` because the answer turns
   * on a deployment fact rather than on the route: the framework supplies the
   * seam and the fail-closed default, the deployment supplies the guard.
   */
  guardedIntake?: boolean | readonly string[]
  /**
   * Set by a module that has been handed a working intake guard, so the
   * capability line can unlock its `guardedIntake` paths without the deployment
   * also having to remember a separate flag. Composed with the app-level
   * `publicIntakeGuarded` by OR — either signal is a deployment saying it
   * guards public intake.
   */
  publicIntakeGuarded?: boolean
  /** Anonymous paths that also attempt live customer-session resolution. */
  optionalCustomerAuth?: boolean | readonly string[]
  /**
   * Public sub-paths whose POST reads are keyed on the request body as well as
   * the URL, making them eligible for the shared response cache (ADR 0021 §2).
   *
   * Paths are relative to the public mount, the same as `anonymous`. Eligibility
   * is declared here rather than by a response header because the middleware has
   * to canonicalize the request body before the route runs; the cache policy
   * itself still lives on the response, so an edge tier reads the same
   * declaration. A declared path whose response is not marked
   * `public, s-maxage=…` is still never stored.
   */
  bodyKeyedCache?: readonly string[]
  /**
   * Concrete admin endpoints whose credential is validated by the route itself
   * instead of by the staff-session middleware. Each declaration is matched by
   * exact HTTP method and exact path; it never opens sibling or child routes.
   *
   * This is intentionally narrower than `anonymous`: use it only for protocol
   * endpoints such as an OAuth token exchange where client authentication is
   * part of the request body or Authorization header. The handler remains
   * responsible for validating that client credential.
   */
  clientAuthenticated?: readonly ClientAuthenticatedRoute[]
  /**
   * Trusted package-owned additions to the host authentication pipeline.
   * Augmentations are composed after any host app-token resolver and do not
   * replace staff session handling or any other host auth hook.
   */
  authAugmentation?: ApiAuthAugmentation
  /**
   * Absolute API path prefixes whose requests must be served by the
   * transaction-capable db client (ADR-0008). For modules whose
   * transaction-needing routes are NOT under the name-based surface — e.g. a
   * lazy family mounted at `/v1/admin/catalog/quote` rather than
   * `/v1/admin/{name}` — and where only a SUBSET of the family's routes
   * transact (so the boolean `module.requiresTransactionalDb` would be too
   * broad). For the common case (all of a module's routes transact) prefer
   * `module.requiresTransactionalDb`. Folded into the transactional-prefix map
   * so the deployment doesn't hand-maintain `dbTransactionalPaths`.
   */
  transactionalPaths?: readonly string[]
}

export interface ClientAuthenticatedRoute {
  method: "POST"
  /** Concrete path relative to `/v1/admin/{module.name}`. */
  path: string
}

export interface ApiAuthAugmentation {
  resolveAppToken: NonNullable<VoyantAuthIntegration["resolveAppToken"]>
}

export interface ApiExtension {
  extension: Extension
  /** Staff-facing routes — mounted at `/v1/admin/{extension.module}`. */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  adminRoutes?: Hono<any>
  /** Customer/partner/supplier-facing routes — mounted at `/v1/public/{extension.module}`. */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  publicRoutes?: Hono<any>
  /**
   * Inbound webhook routes — mounted at `/v1/{extension.module}`, concrete paths
   * auto-added to the anonymous allow-list (ADR-0008). See `ApiModule.webhookRoutes`.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; existing suppression is intentional pending typed cleanup.
  webhookRoutes?: Hono<any>
  /** Lazy variant of `adminRoutes` — mounted at `/v1/admin/{extension.module}` (see ApiModule). */
  lazyAdminRoutes?: LazyRoutesLoader
  /** Lazy variant of `publicRoutes` — mounted at `/v1/public/{publicPath ?? extension.module}`. */
  lazyPublicRoutes?: LazyRoutesLoader
  /** Deployment-local lazy family at explicit absolute paths (see ApiModule). */
  lazyRoutes?: LazyApiRoutes
  /**
   * Optional override for the public mount path relative to `/v1/public`.
   *
   * Defaults to `{extension.module}`. Use `"/"` to mount an extension directly
   * at the public root and omit the extra module segment.
   */
  publicPath?: string
  /**
   * Declares which of this extension's PUBLIC routes are reachable without a
   * session (ADR-0008). Same semantics as {@link ApiModule.anonymous}, relative
   * to the extension's public mount.
   */
  anonymous?: boolean | readonly string[]
  /**
   * Publishable-key reachability — same semantics as
   * {@link ApiModule.publishable}, relative to the extension's public mount.
   */
  publishable?: boolean | readonly string[]
  /**
   * Unchallenged person-data intake — same semantics as
   * {@link ApiModule.guardedIntake}, relative to the extension's public mount.
   */
  guardedIntake?: boolean | readonly string[]
  /** Anonymous paths that also attempt live customer-session resolution. */
  optionalCustomerAuth?: boolean | readonly string[]
  /**
   * Public sub-paths whose POST reads are keyed on the request body as well as
   * the URL, making them eligible for the shared response cache (ADR 0021 §2).
   *
   * Paths are relative to the public mount, the same as `anonymous`. Eligibility
   * is declared here rather than by a response header because the middleware has
   * to canonicalize the request body before the route runs; the cache policy
   * itself still lives on the response, so an edge tier reads the same
   * declaration. A declared path whose response is not marked
   * `public, s-maxage=…` is still never stored.
   */
  bodyKeyedCache?: readonly string[]
  /**
   * Absolute transactional path prefixes — same semantics as
   * {@link ApiModule.transactionalPaths}.
   */
  transactionalPaths?: readonly string[]
}
