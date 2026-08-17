/**
 * Deployment-supplied options for the catalog-checkout cluster.
 *
 * The checkout business logic (materialization, tax, start-service,
 * acceptance signature) lives in `@voyant-travel/commerce`. The two
 * genuinely deployment-specific dependencies are injected here as
 * structural functions so the package never statically imports the
 * deployment, and — crucially — never imports `@voyant-travel/inventory`
 * (which already depends on `@voyant-travel/commerce`; a static import
 * would cycle).
 *
 *   - `resolveBookingTaxSettings` — reads the operator's tax-mode /
 *     tax-policy-profile row. The deployment owns the settings table.
 *   - `getOwnedProductName` — resolves an owned product's title for the
 *     line-item fallback. The package can't import inventory's
 *     `productsService.getProductById` without cycling, so the
 *     deployment hands it in.
 *   - `resolveBankTransferInstructions` — reads the operator profile +
 *     payment-instruction rows for the bank-transfer checkout path.
 */

import type { BookingTaxSettings, PaymentPolicy, PaymentPolicySource } from "@voyant-travel/finance"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/**
 * Bank-transfer instructions surfaced on the bank_transfer_instructions
 * checkout result. The deployment composes these from its operator
 * profile / payment-instruction rows + env fallbacks.
 */
export interface CheckoutBankTransferInstructions {
  beneficiary: string
  iban: string
  bankName: string
}

export interface CheckoutAcceptedPaymentPolicy {
  policy: PaymentPolicy
  source: PaymentPolicySource
}

export interface CommerceAcceptanceDraftInput {
  booking: {
    id: string
    bookingNumber: string
    personId: string | null
    organizationId: string | null
  }
  acceptance: {
    templateId: string
    templateSlug: string
    acceptedAt: string
    acceptedMarketing: boolean
    renderedHtml: string
  }
  requestMeta: { clientIp?: string; userAgent?: string }
}

export interface CheckoutPublicationGuard {
  isProductPublished(input: {
    db: PostgresJsDatabase
    bookingId: string
    productId: string
    channelId: string
  }): Promise<boolean>
}

/**
 * Options shared by the checkout materialization + start-service. All
 * structural — no deployment imports, no platform bindings.
 */
export interface CheckoutModuleOptions {
  /**
   * Read the operator's booking tax settings (tax-price mode + policy
   * profile). Modelled on the operator's `resolveBookingTaxSettings`;
   * structural so commerce doesn't import the deployment settings table.
   */
  resolveBookingTaxSettings(db: PostgresJsDatabase): Promise<BookingTaxSettings>
  /**
   * Resolve an owned product's display name for the line-item title
   * fallback. INJECTED because `@voyant-travel/inventory` depends on
   * `@voyant-travel/commerce` — a static import would cycle. Returns the
   * product name, or null when not an owned product / not found.
   */
  getOwnedProductName(
    db: PostgresJsDatabase,
    entityModule: string,
    entityId: string,
  ): Promise<string | null>
}

/**
 * Options for the checkout-start service (`startCatalogCheckout`). Extends
 * the shared module options with the bank-transfer instruction reader the
 * bank_transfer path needs.
 */
export interface CheckoutStartOptions extends CheckoutModuleOptions {
  /**
   * Resolve the bank-transfer instructions for the bank_transfer payment
   * intent. The deployment reads its operator profile / payment
   * instructions and applies env fallbacks.
   */
  resolveBankTransferInstructions(
    db: PostgresJsDatabase,
    env: Record<string, string | undefined>,
  ): Promise<CheckoutBankTransferInstructions>
  /**
   * Resolve the payment terms the customer accepted during checkout. The
   * checkout service snapshots the resolved policy + computed schedule into
   * the activity log for audit, without creating official
   * `booking_payment_schedules` rows before payment confirmation.
   */
  resolveAcceptedPaymentPolicy?(params: {
    db: PostgresJsDatabase
    booking: {
      id: string
      sellAmountCents: number | null
      sellCurrency: string
      startDate: string | null
      customerPaymentPolicy: PaymentPolicy | null
    }
  }): Promise<CheckoutAcceptedPaymentPolicy | null>
  persistAcceptanceDraftContract?(
    db: PostgresJsDatabase,
    input: CommerceAcceptanceDraftInput,
  ): Promise<void>
  /**
   * Rechecks Distribution-owned effective product publication for a bound
   * storefront/channel before checkout can start. Injected so Commerce stays
   * provider-neutral and does not import Distribution.
   */
  publication?: CheckoutPublicationGuard
  /**
   * Start the card-payment provider session for the `card` checkout intent.
   * INJECTED so commerce never imports a specific payment provider (which
   * would pull a provider package into the retail-spine closure). The
   * deployment owns the provider choice (e.g. Netopia) and the
   * provider-specific placeholder billing.
   *
   * Returns `{ redirectUrl }` to redirect the customer to the provider, or
   * `null`/`undefined` when no card provider is configured — in which case
   * the checkout falls back to the `card_pending` confirmation-page poll.
   */
  startCardPayment?(params: {
    db: PostgresJsDatabase
    sessionId: string
    billing: { email: string; firstName: string; lastName: string }
    description: string
    returnUrl?: string
  }): Promise<{ redirectUrl: string | null } | null>
  /**
   * The tax treatment to stamp on a third-party premium line, per source.
   *
   * Injected because commerce does not know what an ancillary is. Travel
   * insurance is VAT-exempt in most of the EU and taxed elsewhere; the module
   * that binds the source knows which, and the treatment travels on the row
   * rather than being resolved from the operator's own tax policy — a
   * pass-through line is not the operator's supply. Absent, or returning
   * `null`, means the line simply carries no tax row.
   */
  resolveAncillaryTaxTreatmentCode?(source: {
    sourceId: string
    kind: string
  }): string | null | undefined
}
