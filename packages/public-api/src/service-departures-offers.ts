import { centsToAmount } from "./service-departures-pricing-context.js"
import type {
  PublicApiAppliedOffer,
  PublicApiOfferMutationResult,
  PublicApiPromotionalOffer,
} from "./validation.js"

export interface PublicApiDeparturePricePreviewOfferResolvers {
  listApplicableOffers?: (input: {
    productId: string
    departureId?: string
    locale?: string
  }) => Promise<PublicApiPromotionalOffer[]> | PublicApiPromotionalOffer[]
  applyOffer?: (input: {
    slug: string
    body: {
      productId: string
      departureId?: string | null
      pax: number
      audience: "customer"
      market: string
      basePriceCents: number
      currency: string
      locale?: string
    }
  }) => Promise<PublicApiOfferMutationResult | null> | PublicApiOfferMutationResult | null
  redeemOffer?: (input: {
    body: {
      code: string
      productId: string
      departureId?: string | null
      pax: number
      audience: "customer"
      market: string
      basePriceCents: number
      currency: string
      locale?: string
    }
  }) => Promise<PublicApiOfferMutationResult | null> | PublicApiOfferMutationResult | null
}

function computeOfferDiscountCents(
  offer: PublicApiPromotionalOffer,
  basePriceCents: number,
): number {
  if (basePriceCents <= 0) return 0
  if (offer.discountType === "percentage") {
    const percent = Number(offer.discountValue)
    return Number.isFinite(percent) ? Math.round((basePriceCents * percent) / 100) : 0
  }

  const discountCents = Number.parseInt(offer.discountValue, 10)
  return Number.isFinite(discountCents) ? Math.min(discountCents, basePriceCents) : 0
}

function buildAppliedOfferFromDto(input: {
  offer: PublicApiPromotionalOffer
  discountAppliedCents: number
  basePriceCents: number
  currencyCode: string
}): PublicApiAppliedOffer {
  const discountPercent =
    input.offer.discountType === "percentage" ? Number(input.offer.discountValue) : null
  const discountAmountCents =
    input.offer.discountType === "fixed_amount"
      ? Number.parseInt(input.offer.discountValue, 10)
      : null

  return {
    offerId: input.offer.id,
    offerName: input.offer.name,
    discountAppliedCents: input.discountAppliedCents,
    discountedPriceCents: Math.max(0, input.basePriceCents - input.discountAppliedCents),
    currency: input.currencyCode,
    discountKind: input.offer.discountType,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : null,
    discountAmountCents: Number.isFinite(discountAmountCents) ? discountAmountCents : null,
    appliedCode: null,
    stackable: input.offer.stackable,
  }
}

function evaluateAvailableOfferImpacts(input: {
  offers: PublicApiPromotionalOffer[]
  basePriceCents: number
  currencyCode: string
  paxTotal: number
}) {
  const candidates = input.offers.map((offer) => {
    const standaloneDiscount = computeOfferDiscountCents(offer, input.basePriceCents)
    const reason =
      offer.minTravelers != null && input.paxTotal < offer.minTravelers
        ? "min_pax"
        : offer.discountType === "fixed_amount" && offer.currency !== input.currencyCode
          ? "currency"
          : standaloneDiscount <= 0
            ? "no_discount"
            : null

    return { offer, standaloneDiscount, reason }
  })

  const applicable = candidates.filter((candidate) => candidate.reason == null)
  const stackable = applicable
    .filter((candidate) => candidate.offer.stackable)
    .sort((a, b) => (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0))
  const nonStackable = applicable.filter((candidate) => !candidate.offer.stackable)

  let bestNonStackable: (typeof nonStackable)[number] | null = null
  for (const candidate of nonStackable) {
    if (
      bestNonStackable == null ||
      candidate.standaloneDiscount > bestNonStackable.standaloneDiscount
    ) {
      bestNonStackable = candidate
    }
  }

  let runningBase = input.basePriceCents
  const selectedStackable = stackable
    .map((candidate) => {
      const discount = computeOfferDiscountCents(candidate.offer, runningBase)
      runningBase = Math.max(0, runningBase - discount)
      return { ...candidate, selectedDiscount: discount }
    })
    .filter((candidate) => candidate.selectedDiscount > 0)
  const stackableDiscount = input.basePriceCents - runningBase

  const selected =
    bestNonStackable && bestNonStackable.standaloneDiscount >= stackableDiscount
      ? [{ ...bestNonStackable, selectedDiscount: bestNonStackable.standaloneDiscount }]
      : selectedStackable

  const selectedByOfferId = new Map(selected.map((candidate) => [candidate.offer.id, candidate]))
  const applied = selected.map((candidate) =>
    buildAppliedOfferFromDto({
      offer: candidate.offer,
      discountAppliedCents: candidate.selectedDiscount,
      basePriceCents: input.basePriceCents,
      currencyCode: input.currencyCode,
    }),
  )
  const discountTotalCents = applied.reduce((sum, offer) => sum + offer.discountAppliedCents, 0)
  const eligibleButNotSelected = applicable.filter(
    (candidate) => !selectedByOfferId.has(candidate.offer.id),
  )
  const conflict =
    eligibleButNotSelected.length > 0
      ? {
          policy: selected.every((candidate) => candidate.offer.stackable)
            ? "stackable_compose"
            : "best_discount_wins",
          autoAppliedOfferIds: selected
            .filter((candidate) => candidate.offer.slug == null)
            .map((candidate) => candidate.offer.id),
          manualOfferId: null,
          selectedOfferIds: selected.map((candidate) => candidate.offer.id),
          message: selected.every((candidate) => candidate.offer.stackable)
            ? "Stackable offers compose when they beat the best standalone discount."
            : "The best discount wins when non-stackable offers compete.",
        }
      : null

  return {
    available: candidates.map((candidate) => {
      const selectedCandidate = selectedByOfferId.get(candidate.offer.id)
      const selectedDiscount = selectedCandidate?.selectedDiscount ?? 0
      const conflictReason =
        candidate.reason == null && !selectedCandidate && selected.length > 0 ? "conflict" : null
      const discountAppliedCents =
        selectedCandidate?.selectedDiscount ?? candidate.standaloneDiscount

      return {
        offer: candidate.offer,
        status: selectedCandidate ? "applied" : conflictReason ? "conflict" : "not_applicable",
        reason: candidate.reason ?? conflictReason,
        selected: Boolean(selectedCandidate),
        discountAppliedCents,
        discountedPriceCents: Math.max(
          0,
          input.basePriceCents -
            (selectedCandidate ? selectedDiscount : candidate.standaloneDiscount),
        ),
      }
    }),
    applied,
    conflict,
    discountTotalCents,
  }
}

export async function buildOfferPreview(input: {
  resolvers?: PublicApiDeparturePricePreviewOfferResolvers
  productId: string
  departureId: string
  basePriceCents: number
  currencyCode: string
  paxTotal: number
  requestedOffers: Array<{ slug: string }>
  offerCode?: string | null
  locale?: string
  market: string
}) {
  const availableOffers =
    (await input.resolvers?.listApplicableOffers?.({
      productId: input.productId,
      departureId: input.departureId,
      locale: input.locale,
    })) ?? []
  const autoPreview = evaluateAvailableOfferImpacts({
    offers: availableOffers,
    basePriceCents: input.basePriceCents,
    currencyCode: input.currencyCode,
    paxTotal: input.paxTotal,
  })
  const target = {
    productId: input.productId,
    departureId: input.departureId,
    pax: input.paxTotal,
    audience: "customer" as const,
    market: input.market,
    basePriceCents: input.basePriceCents,
    currency: input.currencyCode,
    ...(input.locale ? { locale: input.locale } : {}),
  }
  const requested = []

  for (const offer of input.requestedOffers) {
    requested.push({
      kind: "slug" as const,
      value: offer.slug,
      result:
        (await input.resolvers?.applyOffer?.({
          slug: offer.slug,
          body: target,
        })) ?? null,
    })
  }

  if (input.offerCode) {
    requested.push({
      kind: "code" as const,
      value: input.offerCode,
      result:
        (await input.resolvers?.redeemOffer?.({
          body: { ...target, code: input.offerCode },
        })) ?? null,
    })
  }

  const bestRequested = requested
    .map((entry) => entry.result)
    .filter((result): result is PublicApiOfferMutationResult => Boolean(result))
    .filter((result) => result.status === "applied" || result.status === "conflict")
    .sort((a, b) => b.pricing.discountAppliedCents - a.pricing.discountAppliedCents)[0]
  const applied =
    bestRequested && bestRequested.pricing.discountAppliedCents > autoPreview.discountTotalCents
      ? bestRequested.appliedOffers
      : autoPreview.applied
  const conflict =
    bestRequested && bestRequested.pricing.discountAppliedCents > autoPreview.discountTotalCents
      ? bestRequested.conflict
      : autoPreview.conflict
  const discountTotalCents =
    bestRequested && bestRequested.pricing.discountAppliedCents > autoPreview.discountTotalCents
      ? bestRequested.pricing.discountAppliedCents
      : autoPreview.discountTotalCents

  return {
    available: autoPreview.available,
    requested,
    applied,
    conflict,
    discountTotal: centsToAmount(discountTotalCents) ?? 0,
    discountTotalCents,
    totalAfterDiscount: centsToAmount(Math.max(0, input.basePriceCents - discountTotalCents)) ?? 0,
    currencyCode: input.currencyCode,
  }
}
