// agent-quality: file-size exception -- owner: promotions; storefront offer resolution stays co-located until a dedicated split preserves behavior and tests.
/**
 * Storefront resolvers — populate the previously-empty
 * `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug`
 * endpoints in `@voyant-travel/public-api` with real data.
 *
 * Wire via:
 *
 *   const publicApiModule = createPublicApiModule({
 *     offers: createPromotionsPublicApiResolvers(),
 *   })
 *
 * Per docs/architecture/promotions-architecture.md §8.
 *
 * V1 limitations:
 *   - Storefront calls don't carry an audience / market in the request
 *     context, so the resolver only filters by `products` + `global`
 *     scopes (the catalog plane handles audience-scoped projection).
 *     `markets` and `audiences` scoped offers don't appear in this
 *     listing endpoint.
 *   - Locale-aware offer names: the schema doesn't store translations
 *     yet (single-locale offer names per §12.1); `locale` is accepted
 *     but ignored. A `promotional_offer_translations` table mirrors
 *     `destinations_translations` if/when needed.
 *   - `applicableDepartureIds`: always empty per §12.7 — departure-
 *     scoped offers aren't modelled in v1.
 *   - Only auto-applied offers (no code) appear in `listApplicableOffers`;
 *     code-gated offers are still queryable via `getOfferBySlug`.
 */

import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"

import { type PromotionalOffer, promotionalOfferProducts, promotionalOffers } from "./schema.js"
import {
  type CodeStatus,
  createDrizzleOfferDataSource,
  evaluateOffersForProduct,
} from "./service-evaluator.js"
import type { PromotionalOfferScope } from "./validation.js"

export interface PublicApiRequestContext {
  db?: AnyDrizzleDb
  eventBus?: unknown
  env?: unknown
  context?: unknown
}

export interface PublicApiPromotionalOffer {
  id: string
  name: string
  slug: string | null
  description: string | null
  discountType: "percentage" | "fixed_amount"
  discountValue: string
  currency: string | null
  applicableProductIds: string[]
  applicableDepartureIds: string[]
  validFrom: string | null
  validTo: string | null
  minTravelers: number | null
  imageMobileUrl: string | null
  imageDesktopUrl: string | null
  stackable: boolean
  createdAt: string
  updatedAt: string
}

export interface PublicApiOfferApplyInput {
  productId: string
  departureId?: string | null
  bookingId?: string | null
  sessionId?: string | null
  locale?: string
  pax: number
  audience: "staff" | "customer" | "partner" | "supplier"
  market: string
  basePriceCents: number
  currency: string
}

export interface PublicApiOfferRedeemInput extends PublicApiOfferApplyInput {
  code: string
}

export interface PublicApiAppliedOffer {
  offerId: string
  offerName: string
  discountAppliedCents: number
  discountedPriceCents: number
  currency: string
  discountKind: "percentage" | "fixed_amount"
  discountPercent: number | null
  discountAmountCents: number | null
  appliedCode: string | null
  stackable: boolean
}

export interface PublicApiOfferMutationResult {
  status: "applied" | "not_applicable" | "invalid" | "conflict"
  reason:
    | "offer_not_found"
    | "offer_expired"
    | "offer_not_yet_valid"
    | "code_not_found"
    | "code_required"
    | "code_expired"
    | "code_not_yet_valid"
    | "scope"
    | "min_pax"
    | "eligibility"
    | "currency"
    | "no_discount"
    | "booking_mismatch"
    | "session_mismatch"
    | "conflict"
    | null
  offer: PublicApiPromotionalOffer | null
  target: {
    bookingId: string | null
    sessionId: string | null
    productId: string
    departureId: string | null
  }
  pricing: {
    basePriceCents: number
    currency: string
    discountAppliedCents: number
    discountedPriceCents: number
  }
  appliedOffers: PublicApiAppliedOffer[]
  conflict: {
    policy: "best_discount_wins" | "stackable_compose"
    autoAppliedOfferIds: string[]
    manualOfferId: string | null
    selectedOfferIds: string[]
    message: string
  } | null
}

export interface PublicApiOfferResolvers {
  listApplicableOffers?: (
    input: {
      productId: string
      departureId?: string
      locale?: string
    } & PublicApiRequestContext,
  ) => Promise<PublicApiPromotionalOffer[]> | PublicApiPromotionalOffer[]
  getOfferBySlug?: (
    input: {
      slug: string
      locale?: string
    } & PublicApiRequestContext,
  ) => Promise<PublicApiPromotionalOffer | null> | PublicApiPromotionalOffer | null
  applyOffer?: (
    input: {
      slug: string
      body: PublicApiOfferApplyInput
    } & PublicApiRequestContext,
  ) => Promise<PublicApiOfferMutationResult> | PublicApiOfferMutationResult
  redeemOffer?: (
    input: {
      body: PublicApiOfferRedeemInput
    } & PublicApiRequestContext,
  ) => Promise<PublicApiOfferMutationResult> | PublicApiOfferMutationResult
}

export function createPromotionsPublicApiResolvers(): PublicApiOfferResolvers {
  return {
    async listApplicableOffers(input) {
      const db = resolveDb(input)
      if (!db) return []

      const now = new Date()
      // Active + currently-valid + auto-applied (no code) offers.
      const baseRows = await db
        .select()
        .from(promotionalOffers)
        .where(
          and(
            eq(promotionalOffers.active, true),
            isNull(promotionalOffers.code),
            or(isNull(promotionalOffers.validFrom), lte(promotionalOffers.validFrom, now)),
            or(isNull(promotionalOffers.validUntil), gte(promotionalOffers.validUntil, now)),
          ),
        )

      if (baseRows.length === 0) return []

      // Restrict to offers that match the product: either `global` scope
      // (always matches) OR a product-shaped scope whose materialized
      // link table contains this product.
      const productLinkRows = await db
        .select({ offerId: promotionalOfferProducts.offerId })
        .from(promotionalOfferProducts)
        .where(
          and(
            eq(promotionalOfferProducts.productId, input.productId),
            inArray(
              promotionalOfferProducts.offerId,
              baseRows.map((r) => r.id),
            ),
          ),
        )
      const offersMatchingProduct = new Set(productLinkRows.map((r) => r.offerId))

      const productLinkLookups = await loadApplicableProductIds(
        db,
        baseRows.map((r) => r.id),
      )

      const out: PublicApiPromotionalOffer[] = []
      for (const offer of baseRows) {
        if (!matchesProduct(offer.scope, offersMatchingProduct.has(offer.id))) continue
        out.push(toPublicApiDto(offer, productLinkLookups.get(offer.id) ?? []))
      }
      return out
    },

    async getOfferBySlug(input) {
      const db = resolveDb(input)
      if (!db) return null

      const offer = await findActiveOfferBySlug(db, input.slug)
      if (!offer) return null

      const links = await loadApplicableProductIds(db, [offer.id])
      return toPublicApiDto(offer, links.get(offer.id) ?? [])
    },

    async applyOffer(input) {
      const db = resolveDb(input)
      if (!db) return notConfiguredResult(input.body)

      const offer = await findActiveOfferBySlug(db, input.slug)
      if (!offer) {
        return emptyResult(input.body, "invalid", "offer_not_found", null)
      }

      if (offer.code != null) {
        return emptyResult(input.body, "invalid", "code_required", await dtoForOffer(db, offer))
      }

      const validity = currentValidityStatus(offer, new Date())
      if (validity !== null) {
        return emptyResult(input.body, "invalid", validity, await dtoForOffer(db, offer))
      }

      return evaluatePublicApiMutation(db, input.body, {
        manualOffer: offer,
        code: undefined,
        offer: await dtoForOffer(db, offer),
      })
    },

    async redeemOffer(input) {
      const db = resolveDb(input)
      if (!db) return notConfiguredResult(input.body)

      const offer = await findActiveOfferByCode(db, input.body.code)
      return evaluatePublicApiMutation(db, input.body, {
        manualOffer: offer,
        code: input.body.code,
        offer: offer ? await dtoForOffer(db, offer) : null,
      })
    },
  }
}

function resolveDb(input: PublicApiRequestContext): AnyDrizzleDb | undefined {
  return input.db ?? undefined
}

function matchesProduct(scope: PromotionalOfferScope, inLinkTable: boolean): boolean {
  switch (scope.kind) {
    case "global":
      return true
    case "products":
    case "categories":
    case "destinations":
      return inLinkTable
    // markets / audiences scopes don't render via this endpoint in v1
    // (no audience / market in the request context). They're still
    // honored by the catalog projection (PR3) when products are indexed.
    case "markets":
    case "audiences":
    // Fare/cabin-grade scopes need booking-line context and are evaluated
    // by the checkout path rather than this product-listing endpoint.
    case "fare_codes":
    case "cabin_grades":
      return false
  }
}

async function loadApplicableProductIds(
  db: AnyDrizzleDb,
  offerIds: string[],
): Promise<Map<string, string[]>> {
  if (offerIds.length === 0) return new Map()
  const rows = await db
    .select({
      offerId: promotionalOfferProducts.offerId,
      productId: promotionalOfferProducts.productId,
    })
    .from(promotionalOfferProducts)
    .where(inArray(promotionalOfferProducts.offerId, offerIds))
  const out = new Map<string, string[]>()
  for (const row of rows) {
    const list = out.get(row.offerId) ?? []
    list.push(row.productId)
    out.set(row.offerId, list)
  }
  return out
}

function toPublicApiDto(
  offer: PromotionalOffer,
  applicableProductIds: string[],
): PublicApiPromotionalOffer {
  return {
    id: offer.id,
    name: offer.name,
    slug: offer.slug,
    description: offer.description,
    discountType: offer.discountType,
    // The DTO carries `discountValue` as a string for both flavors.
    // Percentage offers store the percent ("20"); fixed_amount offers
    // store the cents amount as a string ("500" for $5.00).
    discountValue:
      offer.discountType === "percentage"
        ? (offer.discountPercent ?? "0")
        : String(offer.discountAmountCents ?? 0),
    currency: offer.currency,
    applicableProductIds,
    // V1: departure-scoped offers aren't modelled (per §12.7).
    applicableDepartureIds: [],
    validFrom: offer.validFrom?.toISOString() ?? null,
    validTo: offer.validUntil?.toISOString() ?? null,
    minTravelers:
      typeof offer.conditions === "object" && offer.conditions != null
        ? (offer.conditions.minPax ?? null)
        : null,
    // V1: no merchandising images on offers (per §2 non-goals).
    imageMobileUrl: null,
    imageDesktopUrl: null,
    stackable: offer.stackable,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  }
}

async function findActiveOfferBySlug(
  db: AnyDrizzleDb,
  slug: string,
): Promise<PromotionalOffer | null> {
  const rows = await db
    .select()
    .from(promotionalOffers)
    .where(and(eq(promotionalOffers.slug, slug), eq(promotionalOffers.active, true)))
    .limit(1)
  return rows[0] ?? null
}

async function findActiveOfferByCode(
  db: AnyDrizzleDb,
  code: string,
): Promise<PromotionalOffer | null> {
  const rows = await db
    .select()
    .from(promotionalOffers)
    .where(and(eq(promotionalOffers.active, true), eq(promotionalOffers.code, code.toLowerCase())))
    .limit(1)
  return rows[0] ?? null
}

async function dtoForOffer(
  db: AnyDrizzleDb,
  offer: PromotionalOffer,
): Promise<PublicApiPromotionalOffer> {
  const links = await loadApplicableProductIds(db, [offer.id])
  return toPublicApiDto(offer, links.get(offer.id) ?? [])
}

function currentValidityStatus(
  offer: PromotionalOffer,
  now: Date,
): "offer_expired" | "offer_not_yet_valid" | null {
  if (offer.validUntil != null && offer.validUntil < now) return "offer_expired"
  if (offer.validFrom != null && offer.validFrom > now) return "offer_not_yet_valid"
  return null
}

type MutationBody = PublicApiOfferApplyInput | PublicApiOfferRedeemInput

function emptyResult(
  input: MutationBody,
  status: PublicApiOfferMutationResult["status"],
  reason: NonNullable<PublicApiOfferMutationResult["reason"]>,
  offer: PublicApiPromotionalOffer | null,
): PublicApiOfferMutationResult {
  return {
    status,
    reason,
    offer,
    target: targetFromInput(input),
    pricing: {
      basePriceCents: input.basePriceCents,
      currency: input.currency,
      discountAppliedCents: 0,
      discountedPriceCents: input.basePriceCents,
    },
    appliedOffers: [],
    conflict: null,
  }
}

function notConfiguredResult(input: MutationBody): PublicApiOfferMutationResult {
  return emptyResult(input, "invalid", "offer_not_found", null)
}

async function evaluatePublicApiMutation(
  db: AnyDrizzleDb,
  input: MutationBody,
  options: {
    manualOffer: PromotionalOffer | null
    code?: string
    offer: PublicApiPromotionalOffer | null
  },
): Promise<PublicApiOfferMutationResult> {
  const evaluation = await evaluateOffersForProduct(createDrizzleOfferDataSource(db), {
    productId: input.productId,
    slice: {
      audience: input.audience,
      market: input.market,
    },
    pax: input.pax,
    code: options.code,
    basePriceCents: input.basePriceCents,
    baseCurrency: input.currency,
  })

  const codeReason = codeStatusToReason(evaluation.codeStatus)
  if (codeReason != null) {
    return emptyResult(input, "invalid", codeReason, options.offer)
  }

  const appliedOffers = evaluation.applied.map(toPublicApiAppliedOffer)
  const manualOfferId = options.manualOffer?.id ?? null
  const selectedOfferIds = appliedOffers.map((offer) => offer.offerId)
  const manualSelected = manualOfferId ? selectedOfferIds.includes(manualOfferId) : false
  const autoAppliedOfferIds = appliedOffers
    .filter((offer) => offer.appliedCode == null && offer.offerId !== manualOfferId)
    .map((offer) => offer.offerId)
  const conflict = manualOfferId
    ? buildConflict({
        autoAppliedOfferIds,
        manualOfferId,
        selectedOfferIds,
        manualSelected,
      })
    : null

  if (evaluation.total.discountAppliedCents <= 0) {
    return {
      ...emptyResult(input, "not_applicable", "no_discount", options.offer),
      conflict,
    }
  }

  const status = manualOfferId && !manualSelected ? "conflict" : "applied"

  return {
    status,
    reason: status === "conflict" ? "conflict" : null,
    offer: options.offer,
    target: targetFromInput(input),
    pricing: {
      basePriceCents: input.basePriceCents,
      currency: input.currency,
      discountAppliedCents: evaluation.total.discountAppliedCents,
      discountedPriceCents: evaluation.total.discountedPriceCents,
    },
    appliedOffers,
    conflict,
  }
}

function codeStatusToReason(
  status: CodeStatus,
): NonNullable<PublicApiOfferMutationResult["reason"]> | null {
  if (status == null || status.kind === "code_valid") return null
  if (status.kind === "code_not_applicable") return status.reason
  return status.kind
}

function toPublicApiAppliedOffer(offer: PublicApiAppliedOffer): PublicApiAppliedOffer {
  return {
    offerId: offer.offerId,
    offerName: offer.offerName,
    discountAppliedCents: offer.discountAppliedCents,
    discountedPriceCents: offer.discountedPriceCents,
    currency: offer.currency,
    discountKind: offer.discountKind,
    discountPercent: offer.discountPercent,
    discountAmountCents: offer.discountAmountCents,
    appliedCode: offer.appliedCode,
    stackable: offer.stackable,
  }
}

function targetFromInput(input: MutationBody): PublicApiOfferMutationResult["target"] {
  return {
    bookingId: input.bookingId ?? null,
    sessionId: input.sessionId ?? null,
    productId: input.productId,
    departureId: input.departureId ?? null,
  }
}

function buildConflict(input: {
  autoAppliedOfferIds: string[]
  manualOfferId: string | null
  selectedOfferIds: string[]
  manualSelected: boolean
}): PublicApiOfferMutationResult["conflict"] {
  if (input.autoAppliedOfferIds.length === 0 && input.manualSelected) return null

  const policy = input.manualSelected ? "stackable_compose" : "best_discount_wins"
  return {
    policy,
    autoAppliedOfferIds: input.autoAppliedOfferIds,
    manualOfferId: input.manualOfferId,
    selectedOfferIds: input.selectedOfferIds,
    message:
      policy === "stackable_compose"
        ? "The manually applied offer composes with selected auto-applied offers because every selected offer is stackable."
        : "The best discount wins when a manually applied or code offer competes with non-stackable auto-applied offers.",
  }
}
