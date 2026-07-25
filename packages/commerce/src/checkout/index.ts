/**
 * Catalog-checkout business-logic cluster, owned by `@voyant-travel/commerce`.
 *
 * The reusable orchestration (tax-line derivation, acceptance signature
 * promotion, checkout-start service, the
 * checkout-finalize saga driver, and the public checkout route) lives here.
 * Deployment-specific dependencies are injected via the options interfaces in
 * `./options.js`:
 *   - `resolveBookingTaxSettings` — operator tax-mode/profile reads.
 *   - `getOwnedProductName` — owned product title (injected to avoid a cycle
 *     through `@voyant-travel/inventory`, which depends on commerce).
 *   - `resolveBankTransferInstructions` — operator profile / payment rows.
 *
 * The package-owned subscriber is published on a dedicated subpath.
 * Deployments inject database lifecycle and Legal ports.
 */

export {
  type AcceptanceSignatureContract,
  type AcceptanceSignatureInput,
  type AcceptanceSignatureLegalPort,
  persistAcceptanceSignature,
} from "./acceptance-signature.js"
export { createCatalogCheckoutGraphExtension } from "./api-runtime.js"
export { type FinalizeCheckoutParams, finalizeCheckout } from "./finalize.js"
export {
  type DraftPayload,
  type MaterializationSnapshot,
  rebuildBookingItemTaxLines,
} from "./materialization.js"

export {
  extractBookingDates,
  extractItemDates,
  extractItemDescription,
  inferSnapshotTaxFacts,
  materializeBookingAllocations,
  materializeTravelerTravelDetails,
  resolveLineItemTitle,
  resolveSupplierFromSnapshot,
  resolveUpstreamCostCents,
  travelerBandToCategory,
} from "./materialization-support.js"
export { materializeBookingItemTaxLine } from "./materialization-tax.js"
export type {
  CheckoutAcceptedPaymentPolicy,
  CheckoutBankTransferInstructions,
  CheckoutModuleOptions,
  CheckoutStartOptions,
} from "./options.js"
export {
  type BookingMaintenanceRoutesOptions,
  createBookingMaintenanceApiExtension,
  createBookingMaintenanceRoutes,
  createBookingMaintenanceVoyantRuntime,
  createCatalogCheckoutApiExtension,
  createCatalogCheckoutRoutes,
} from "./routes.js"
export {
  bookingMaintenanceRuntimePort,
  CATALOG_CHECKOUT_API_RUNTIME_KEY,
  type CatalogCheckoutApiRuntime,
  catalogCheckoutApiRuntimePort,
} from "./runtime-ports.js"
export {
  type CatalogCheckoutStartContext,
  CatalogCheckoutStartError,
  type CatalogCheckoutStartResult,
  type CheckoutStartInput,
  type CheckoutStartRequestMeta,
  checkoutStartSchema,
  startCatalogCheckout,
} from "./start-service.js"
