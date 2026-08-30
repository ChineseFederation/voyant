import { actionLedgerHonoModule } from "@voyantjs/action-ledger"
import { availabilityHonoModule } from "@voyantjs/availability"
import { bookingRequirementsHonoModule } from "@voyantjs/booking-requirements"
import { bookingsSupplierExtension, createBookingsHonoModule } from "@voyantjs/bookings"
import { createCatalogSearchHonoModule } from "@voyantjs/catalog"
import { type EmbeddingProvider, executeSemanticSearch } from "@voyantjs/catalog-rag"
import { type CheckoutPaymentStarter, createCheckoutHonoModule } from "@voyantjs/checkout"
import { createCrmHonoModule, crmBookingExtension, crmService } from "@voyantjs/crm"
import { createCustomerPortalHonoModule } from "@voyantjs/customer-portal"
import { distributionBookingExtension, distributionHonoModule } from "@voyantjs/distribution"
import { externalRefsHonoModule } from "@voyantjs/external-refs"
import { extrasHonoModule } from "@voyantjs/extras"
import { bookingsCreateExtension, createFinanceHonoModule } from "@voyantjs/finance"
import { createApp, createPublicDocumentDeliveryHonoModule } from "@voyantjs/hono"
import { identityHonoModule } from "@voyantjs/identity"
import { createLegalHonoModule } from "@voyantjs/legal"
import { marketsHonoModule } from "@voyantjs/markets"
import {
  createDefaultBookingDocumentAttachment,
  createNotificationsHonoModule,
} from "@voyantjs/notifications"
import { createNetopiaCheckoutStarter, netopiaHonoBundle } from "@voyantjs/plugin-netopia"
import { pricingHonoModule } from "@voyantjs/pricing"
import { productsBookingExtension, productsHonoModule } from "@voyantjs/products"
import { promotionsHonoModule } from "@voyantjs/promotions"
import { createPromotionsStorefrontResolvers } from "@voyantjs/promotions/service-storefront"
import { resourcesHonoModule } from "@voyantjs/resources"
import { sellabilityHonoModule } from "@voyantjs/sellability"
import { createStorefrontHonoModule } from "@voyantjs/storefront"
import { createStorefrontVerificationHonoModule } from "@voyantjs/storefront-verification"
import { suppliersHonoModule } from "@voyantjs/suppliers"
import { transactionsBookingExtension, transactionsHonoModule } from "@voyantjs/transactions"
import { createTravelComposerHonoModule } from "@voyantjs/travel-composer"
import { mountWorkflowRunsAdminRoutes, WorkflowRunnerRegistry } from "@voyantjs/workflow-runs"
import { resolveNotificationProviders } from "../lib/notifications"
import { mountActionLedgerHealthRoutes } from "./action-ledger-health"
import authHandler, {
  hasAuthPermission,
  resolveAuthRequest,
  validateApiTokenAccess,
} from "./auth/handler"
import {
  bookingScheduleBundle,
  mountBookingPaymentScheduleRoutes,
  mountPublicPaymentPolicyRoutes,
} from "./booking-schedule"
import { mountBookingTaxPreviewRoutes } from "./booking-tax-preview"
import { mountCatalogBookingRoutes } from "./catalog-booking"
import { catalogBridgeBundle } from "./catalog-bridge"
import { mountCatalogCheckoutRoutes } from "./catalog-checkout"
import { createCatalogCheckoutBundle } from "./catalog-checkout-finalize-runtime"
import { rebuildBookingItemTaxLines } from "./catalog-checkout-materialization"
import { mountCatalogContentRoutes } from "./catalog-content"
import { channelPushBundle, mountChannelPushAdminRoutes } from "./channel-push"
import { mountOperatorContractDocumentRoutes } from "./contract-document-routes"
import { AUTO_GENERATE_CONTRACT_OPTIONS } from "./contract-document-runtime"
import { mountFlightRoutes } from "./flights"
import { createInvitationsRoutes } from "./invitations"
import { mountOperatorLazyAdditionalRoutes } from "./lazy-additional-routes"
import { buildCatalogContext } from "./lib/catalog-context"
import { dbFromEnvForApp } from "./lib/db"
import { createDocumentStorage } from "./lib/storage"
import { mountCatalogMcpRoutes } from "./mcp"
import { mountOperatorMediaUploadRoutes } from "./media-upload-routes"
import {
  createOperatorDocumentStorage,
  createOperatorInvoiceExchangeRateResolver,
  createOperatorInvoiceSettlementPollers,
  createOperatorWorkflowDriver,
  generateContractPdfForBooking,
  operatorPostgresDb,
  readOperatorDocumentContentBase64,
  resolveOperatorContractDocumentGenerator,
  resolveOperatorDb,
  resolveOperatorDocumentDownloadUrl,
} from "./operator-runtime-adapter"
import {
  resolveBankTransferDetails,
  resolvePublicCheckoutBaseUrlFromBindings,
} from "./payment-config"
import { mountProductDuplicateRoutes } from "./product-duplicate"
import { mountOperatorSettingsRoutes } from "./settings"
import { smartbillOperatorBundle } from "./smartbill"
import {
  createOperatorTravelComposerRoutesOptions,
  travelComposerPaymentBundle,
} from "./travel-composer-runtime"
import tuyuAdministratorBridge from "./tuyu-admin-bridge"

const notificationsHonoModule = createNotificationsHonoModule({
  resolveProviders: resolveNotificationProviders,
  resolvePublicCheckoutBaseUrl: resolvePublicCheckoutBaseUrlFromBindings,
  resolveDocumentAttachmentResolver: (bindings) => async (document) => {
    if (document.storageKey) {
      const contentBase64 = await readOperatorDocumentContentBase64(bindings, document.storageKey)
      if (contentBase64) {
        return {
          filename: document.name,
          contentBase64,
          contentType: document.mimeType ?? undefined,
        }
      }

      const path = await resolveOperatorDocumentDownloadUrl(bindings, document.storageKey)
      if (path) {
        return {
          filename: document.name,
          path,
          contentType: document.mimeType ?? undefined,
        }
      }
    }

    return createDefaultBookingDocumentAttachment(document)
  },
  // Auto-dispatch the booking-confirmation bundle when a booking flips to
  // `confirmed`. The subscriber runs in the same process as the emitter via
  // the in-process event bus; errors are logged, not rethrown, so a flaky
  // mailer can't block the confirm request.
  //
  // KNOWN LEAK: `resolveDb` is called per-booking-confirmation by the
  // module's subscriber and leaks a Neon WebSocket Pool until isolate
  // teardown (the factory contract is `(bindings) => VoyantDb`, with no
  // dispose hook). Volume is low (1 per confirmed booking), so this
  // doesn't move the operational needle today. Fixing it properly
  // requires widening the module-factory contract in `@voyantjs/bookings`
  // to accept the `DisposableDb` shape — tracked alongside the rest of
  // the audit in #510.
  resolveDb: resolveOperatorDb,
  autoConfirmAndDispatch: {
    enabled: true,
    templateSlug: "booking-confirmation",
  },
})

const catalogSearchHonoModule = createCatalogSearchHonoModule({
  resolveRuntime: (c) => {
    const ctx = buildCatalogContext(c)
    return {
      indexer: ctx.catalog.indexer,
      embeddings: ctx.catalog.embeddings,
      defaultScope: ctx.defaultScope,
    }
  },
  executeSearch: ({ adapter, embeddings, slice, request }) =>
    executeSemanticSearch({
      adapter,
      embeddings: embeddings as EmbeddingProvider | undefined,
      slice,
      request,
    }),
})
const storefrontVerificationHonoModule = createStorefrontVerificationHonoModule({
  resolveProviders: resolveNotificationProviders,
  email: {
    subject: "Your verification code",
  },
})
const storefrontHonoModule = createStorefrontHonoModule({
  // Wire the promotions resolver into the storefront's previously-empty
  // `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug`
  // endpoints. Per docs/architecture/promotions-architecture.md §8.
  offers: createPromotionsStorefrontResolvers(),
})

// Netopia is the only configured `pay-by-link` provider in this template.
// Container bootstrap (via `netopiaHonoBundle`) caches the resolved runtime
// options, so the starter only needs the `payload` from the request — env
// resolution happens lazily inside the starter's `startProvider`.
const netopiaCheckoutStarter = createNetopiaCheckoutStarter()

const checkoutHonoModule = createCheckoutHonoModule({
  resolveProviders: resolveNotificationProviders,
  resolvePaymentStarters: (): Record<string, CheckoutPaymentStarter> => ({
    netopia: netopiaCheckoutStarter,
  }),
  resolveBankTransferDetails,
  resolvePublicCheckoutBaseUrl: resolvePublicCheckoutBaseUrlFromBindings,
})
/**
 * Process-wide registry of workflow runners. Bundles register their
 * runners on bootstrap (see `createCatalogCheckoutBundle`) so the
 * `/v1/admin/workflow-runs/:id/{rerun,resume}` endpoints can dispatch
 * a workflow by name. The dashboard's "Rerun" / "Resume" buttons are
 * powered by this registry. Self-hosted workflow services should
 * register runners that call `createNodeSelfHostWorkflowClient(...)`
 * and forward resume calls with `ctx.resumeFromStep` and
 * `ctx.seedResults`.
 */
const workflowRunnerRegistry = new WorkflowRunnerRegistry()

const customerPortalHonoModule = createCustomerPortalHonoModule({
  resolveDocumentDownloadUrl: (bindings, storageKey) =>
    resolveOperatorDocumentDownloadUrl(bindings, storageKey),
})

// Wires the env-driven KMS provider into CRM admin routes so
// operator UIs can read/write decrypted PII (passport snapshots,
// dietary/accessibility blobs) through `/v1/admin/crm/people/...`.
const crmHonoModule = createCrmHonoModule()

// `resolveTravelSnapshot` lets the booking-traveler "with travel
// details" route auto-snapshot dietary/accessibility/primary-passport
// from the linked `crm.people` row when an operator picks an existing
// person. Bookings stays free of any direct CRM dep — the resolver
// is wired here at template assembly time and receives the same KMS
// provider the route already resolved.
const bookingsHonoModule = createBookingsHonoModule({
  resolveTravelSnapshot: (db, personId, { kms }) =>
    crmService.loadPersonTravelSnapshot(db, personId, { kms }),
  // Storefront booking session bootstrap + update flows hand the
  // billing contact and per-traveler snapshots to these resolvers. They
  // dedupe by normalized email/phone via `identity_contact_points` and
  // upsert a CRM person on miss; traveler snapshots without email/phone
  // stay booking-only until explicitly linked. See issues #961 / #1399.
  resolveBillingPerson: async (db, contact, ctx) => {
    const person = await crmService.upsertPersonFromContact(db, contact, {
      source: ctx.source,
      sourceRef: ctx.sourceRef,
    })
    return person?.id ?? null
  },
  resolveTravelerPerson: async (db, contact, ctx) => {
    const person = await crmService.upsertPersonFromContact(db, contact, {
      source: ctx.source,
      sourceRef: ctx.sourceRef,
      requireContactPoint: true,
    })
    return person?.id ?? null
  },
  resolveBillingPersonById: async (db, personId) =>
    (await crmService.getPersonById(db, personId)) != null,
  resolveBillingOrganizationById: async (db, organizationId) =>
    (await crmService.getOrganizationById(db, organizationId)) != null,
})

const financeModule = createFinanceHonoModule({
  resolveDocumentDownloadUrl: (bindings: unknown, storageKey: string) =>
    resolveOperatorDocumentDownloadUrl(bindings, storageKey),
  resolveInvoiceExchangeRateResolver: createOperatorInvoiceExchangeRateResolver,
  resolveInvoiceSettlementPollers: createOperatorInvoiceSettlementPollers,
  invoiceDueDateResolver: ({ issueDate, dueDate, bookingPaymentSchedule }) =>
    bookingPaymentSchedule && dueDate < issueDate ? issueDate : dueDate,
})
const legalModule = createLegalHonoModule({
  // KNOWN LEAK: same shape as the bookings `resolveDb` above — leaks a
  // Pool per legal-event subscriber call until the module factory's
  // contract widens to accept `DisposableDb`. Tracked in #510.
  resolveDb: resolveOperatorDb,
  resolveDocumentDownloadUrl: (bindings, storageKey) =>
    resolveOperatorDocumentDownloadUrl(bindings, storageKey),
  resolveDocumentStorage: createOperatorDocumentStorage,
  resolveDocumentGenerator: resolveOperatorContractDocumentGenerator,
  autoGenerateContractOnConfirmed: AUTO_GENERATE_CONTRACT_OPTIONS,
})

const publicDocumentDeliveryModule = createPublicDocumentDeliveryHonoModule<CloudflareBindings>({
  resolveStorage: createDocumentStorage,
})

export const app = createApp<CloudflareBindings>({
  // `dbFromEnvForApp` returns `{ db, dispose }`; the Hono db middleware
  // schedules `dispose()` via `executionCtx.waitUntil` after the
  // response is sent, so each request gets its own Pool and closes it
  // before the isolate sleeps.
  db: (env) => dbFromEnvForApp(env),
  // Workflow runtime — Cloudflare edge composition. Per-run state lives
  // in the `WorkflowRunDO` Durable Object exported from `entry.ts`;
  // serialized manifests live in the `WORKFLOW_MANIFESTS` KV namespace.
  // Step bodies dispatch through `createInlineDispatcher` (set up inside
  // the DO), so workflow code lives in this same Worker.
  //
  // The `driver` field is a function-of-bindings: createApp invokes it
  // at lazy bootstrap time once env bindings are resolved. Uncomment
  // the durable_objects + kv_namespaces blocks in wrangler.jsonc and
  // run `wrangler kv namespace create WORKFLOW_MANIFESTS` to provision
  // the bindings; without them, bootstrap fails with a clear error.
  workflows: {
    driver: createOperatorWorkflowDriver,
  },
  publicPaths: [
    "/tuyu-admin",
    "/v1/public/customer-portal/contact-exists",
    "/v1/public/storefront-verification",
    "/v1/public/checkout",
    // Invitation redemption is reachable without a session.
    "/v1/public/invitations",
    // Payment-link landing page reads the session via TypeID (unguessable)
    // and the bank-transfer block from a config endpoint. Both must be
    // reachable without auth — the customer arrives from an emailed link.
    "/v1/public/finance/payment-sessions",
    "/v1/public/payment-link-config",
    "/v1/public/payment-link",
    // Storefront booking journey — quote / book / drafts run
    // unauthenticated against the customer surface. Per
    // booking-journey-architecture §10 Phase B (the journey is
    // auth-less or session-token-bound; this template takes the
    // auth-less posture and assigns `actor: "customer"`).
    "/v1/public/catalog",
    // Storefront post-card-payment status poll. The booking id is a
    // TypeID in the redirect URL; the response exposes only non-PII state.
    "/v1/public/bookings",
    // Storefront product / cruise / accommodations detail —
    // drives the `/shop/products/...` page's content fetch.
    "/v1/public/products",
    "/v1/public/cruises",
    "/v1/public/accommodations",
    // Storefront public CRM intake. Host deployments can wire captcha /
    // rate-limit checks through the storefront intake guard.
    "/v1/public/leads",
    "/v1/public/newsletter",
    // Storefront contract preview — the booking journey resolves the
    // active customer-scope template and renders its preview HTML
    // before the customer accepts. Both the slug-resolution lookup
    // and the by-slug preview render live under this prefix.
    "/v1/public/legal",
    "/v1/public/documents",
    // Operator profile + customer payment policy (sanitized subset).
    // The storefront contract preview reads operator name / address /
    // license + the deposit terms from here so it can render the
    // operator block and a deposit/balance schedule before the booking
    // exists.
    "/v1/public/operator-profile",
    // Cascade-aware policy resolver — storefront preview hits this
    // with `(entityModule, entityId)` + journey selections to get
    // the policy that will apply at booking time (supplier /
    // category / listing / operator default).
    "/v1/public/payment-policy",
    // Netopia webhook receiver. Netopia's servers POST here without a
    // session cookie or bearer; the plugin handler matches the inbound
    // payload to a payment session by orderID and validates the
    // processor's response shape. This is the URL set in
    // `NETOPIA_NOTIFY_URL`.
    "/v1/finance/providers/netopia/callback",
  ],
  modules: [
    actionLedgerHonoModule,
    crmHonoModule,
    availabilityHonoModule,
    identityHonoModule,
    externalRefsHonoModule,
    extrasHonoModule,
    bookingRequirementsHonoModule,
    pricingHonoModule,
    marketsHonoModule,
    transactionsHonoModule,
    resourcesHonoModule,
    sellabilityHonoModule,
    distributionHonoModule,
    suppliersHonoModule,
    productsHonoModule,
    promotionsHonoModule,
    catalogSearchHonoModule,
    bookingsHonoModule,
    financeModule,
    legalModule,
    publicDocumentDeliveryModule,
    notificationsHonoModule,
    storefrontHonoModule,
    customerPortalHonoModule,
    storefrontVerificationHonoModule,
    checkoutHonoModule,
    createTravelComposerHonoModule({
      ...createOperatorTravelComposerRoutesOptions(),
      publicRoutes: true,
    }),
  ],
  extensions: [
    bookingsSupplierExtension,
    bookingsCreateExtension,
    productsBookingExtension,
    crmBookingExtension,
    transactionsBookingExtension,
    distributionBookingExtension,
  ],
  plugins: [
    // bookingScheduleBundle subscribes to booking.confirmed BEFORE
    // legal's auto-generate-contract subscriber so the rendered
    // contract reads the freshly-written deposit/balance rows.
    bookingScheduleBundle,
    catalogBridgeBundle,
    createCatalogCheckoutBundle({
      workflowRunnerRegistry,
      generateContractPdf: ({ env, db, eventBus, bookingId }) =>
        generateContractPdfForBooking(env, db, eventBus, bookingId),
    }),
    travelComposerPaymentBundle,
    smartbillOperatorBundle,
    channelPushBundle,
    netopiaHonoBundle(),
  ],
  auth: {
    handler: () => ({
      fetch: async (request, env, ctx) =>
        authHandler.fetch(request, env, ctx as ExecutionContext | undefined),
    }),
    resolve: async ({ request, env }) => resolveAuthRequest(request, env),
    hasPermission: async ({ request, env }) => hasAuthPermission(request, env),
    validateApiKey: async ({ env, db, apiKey }) => validateApiTokenAccess(env, db, apiKey),
  },
  additionalRoutes: (hono) => {
    hono.route("/", tuyuAdministratorBridge)
    // Admin-issued invitation flow (single-tenant sign-up is otherwise gated
    // at the Better Auth layer).
    hono.route("/", createInvitationsRoutes())

    // Action ledger diagnostics. GET is read-only drift health; POST writes
    // a synthetic canary action and verifies the relay row is visible.
    mountActionLedgerHealthRoutes(hono)

    // Operator profile, payment instructions, and booking payment defaults.
    mountOperatorSettingsRoutes(hono)

    // Operator-owned product duplication, including cross-package product setup.
    mountProductDuplicateRoutes(hono)

    // Booking-level payment-policy override + schedule regeneration.
    // POST /v1/admin/bookings/:bookingId/payment-schedule/regenerate
    mountBookingPaymentScheduleRoutes(hono)

    // Real-time tax preview for the admin booking-create dialog.
    // POST /v1/admin/bookings/tax-preview
    mountBookingTaxPreviewRoutes(hono)

    // Rebuild `booking_item_tax_lines` from the catalog snapshot for a
    // booking. Repairs bookings created before the snapshot fallback in
    // `materializeBookingItemTaxLine` shipped — without this, invoices
    // generated from such bookings end up with 0 tax even though the
    // booking page shows the upstream tax from its catalog snapshot.
    // POST /v1/admin/bookings/:bookingId/rebuild-tax-lines
    hono.post("/v1/admin/bookings/:bookingId/rebuild-tax-lines", async (c) => {
      const bookingId = c.req.param("bookingId")
      try {
        const result = await rebuildBookingItemTaxLines(operatorPostgresDb(c.get("db")), bookingId)
        return c.json({ data: result })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return c.json({ error: message }, 500)
      }
    })

    mountOperatorContractDocumentRoutes(hono)

    // Storefront preview policy resolution. The customer-facing
    // booking journey calls this on mount + whenever the
    // sailing/cabin/rate-plan selection changes; the resolved policy
    // drives the deposit / balance preview in the contract dialog.
    // POST /v1/public/payment-policy/resolve
    mountPublicPaymentPolicyRoutes(hono)

    mountOperatorMediaUploadRoutes(hono)

    mountOperatorLazyAdditionalRoutes(hono)

    mountCatalogMcpRoutes(hono)
    mountCatalogBookingRoutes(hono)
    mountCatalogCheckoutRoutes(hono)
    mountCatalogContentRoutes(hono)
    mountChannelPushAdminRoutes(hono)
    mountFlightRoutes(hono)

    // Workflow runs admin surface — list/get + rerun/resume actions
    // feeding the standalone dashboard SPA in
    // apps/workflow-runs-dashboard. The registry is populated by
    // bundle bootstraps (e.g. catalog-checkout registers the
    // `checkout-finalize` runner).
    mountWorkflowRunsAdminRoutes(hono, {
      runners: workflowRunnerRegistry,
      resolveUserId: (c) => {
        // Hono Context — typed loosely so the package stays
        // transport-agnostic; pull the userId set by the auth
        // middleware. Returns null for runs triggered without an
        // active session (shouldn't happen on the admin surface).
        const ctx = c as { get: (key: string) => unknown }
        const userId = ctx.get("userId")
        return typeof userId === "string" ? userId : null
      },
    })
  },
})
