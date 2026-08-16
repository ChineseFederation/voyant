import { z } from "zod"

/**
 * Ancillary offers — things quoted live from a third party at purchase time.
 *
 * This is deliberately *not* `addonOfferV1`. An add-on is something the operator
 * has in its own catalog, priced ahead of time and sellable at any point. An
 * ancillary is quoted when the traveller is already in checkout, because its
 * price is not knowable until trip dates and traveller ages are, and the offer
 * is only good for a bounded window afterwards. Travel insurance is the first
 * of these; nothing here names it.
 *
 * The shapes are provider-neutral on purpose. Neither this file nor anything in
 * `commerce` may learn what an insurer is.
 */

export const ANCILLARY_ELIGIBILITY_STATUSES = ["eligible", "ineligible", "referral"] as const

export const ancillaryEligibilityV1 = z
  .object({
    status: z.enum(ANCILLARY_ELIGIBILITY_STATUSES),
    reasons: z
      .array(
        z
          .object({
            code: z.string(),
            /** Already localised; shown next to the offer it applies to. */
            message: z.string(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
export type AncillaryEligibilityV1 = z.infer<typeof ancillaryEligibilityV1>

/**
 * A document the traveller must be able to reach before buying, pinned to the
 * revision that is in force right now.
 */
export const ancillaryDisclosureV1 = z
  .object({
    kind: z.string(),
    label: z.string(),
    /** The provider's identifier for this revision. Captured, never re-derived. */
    versionId: z.string(),
    url: z.string().optional(),
    required: z.boolean(),
  })
  .strict()
export type AncillaryDisclosureV1 = z.infer<typeof ancillaryDisclosureV1>

/**
 * A field the provider needs about each traveller before it will commit.
 *
 * `sensitive` fields are collected only after the traveller has accepted an
 * offer, kept minimal on screen, and never logged.
 */
export const ancillaryTravelerFieldV1 = z
  .object({
    key: z.string(),
    label: z.string(),
    type: z.string(),
    required: z.boolean(),
    sensitive: z.boolean().default(false),
    options: z.array(z.object({ value: z.string(), label: z.string() }).strict()).optional(),
    helpText: z.string().optional(),
  })
  .strict()
export type AncillaryTravelerFieldV1 = z.infer<typeof ancillaryTravelerFieldV1>

/**
 * One priced offer from one provider.
 *
 * There is deliberately no `selected`, `recommended` or `default` field.
 * Nothing here may arrive pre-ticked, so the shape gives a provider nowhere to
 * express a default and gives a renderer nothing to honour.
 */
export const ancillaryOfferV1 = z
  .object({
    offerId: z.string(),
    /** The bound source that produced it (`commerce.ancillary-offer-source`). */
    sourceId: z.string(),
    providerId: z.string(),
    /** How the provider is named to the traveller. */
    providerLabel: z.string(),
    /** Free string — `"insurance"` today. Not an enum; commerce does not enumerate verticals. */
    kind: z.string(),
    title: z.string(),
    summary: z.string().nullable().optional(),
    /**
     * The provider's own tier or plan wording. **Display only** — never a sort
     * key and never a branch condition, because it means something different to
     * every provider.
     */
    planLabel: z.string().nullable().optional(),
    price: z
      .object({ amountMinor: z.number().int(), currency: z.string().regex(/^[A-Z]{3}$/) })
      .strict(),
    pricedPerPerson: z.boolean().default(false),
    /** Short comparable facts, already localised, in the order to render them. */
    highlights: z
      .array(z.object({ label: z.string(), value: z.string().optional() }).strict())
      .default([]),
    eligibility: ancillaryEligibilityV1,
    disclosures: z.array(ancillaryDisclosureV1).default([]),
    requiredTravelerFields: z.array(ancillaryTravelerFieldV1).default([]),
    /** The instant the provider stops honouring this price. */
    validUntil: z.string(),
    /** Opaque; the source re-resolves the live offer from it. */
    quoteRef: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
export type AncillaryOfferV1 = z.infer<typeof ancillaryOfferV1>

export const ANCILLARY_SOURCE_STATUSES = ["ok", "timeout", "error", "unavailable"] as const

/**
 * What happened at each source that was asked.
 *
 * Partial failure is normal: a slow or failing provider degrades the list
 * rather than blocking checkout, and this is where that shows up. A caller that
 * wants to explain a short list reads these; a caller that does not, ignores them.
 */
export const ancillarySourceDiagnosticV1 = z
  .object({
    sourceId: z.string(),
    providerId: z.string().optional(),
    status: z.enum(ANCILLARY_SOURCE_STATUSES),
    message: z.string().optional(),
    latencyMs: z.number().int().nonnegative().optional(),
  })
  .strict()
export type AncillarySourceDiagnosticV1 = z.infer<typeof ancillarySourceDiagnosticV1>

/**
 * Every offer of one kind, from every connected provider.
 *
 * Always a list, whatever the count. An operator may have zero, one or several
 * providers connected; one provider is a list whose entries happen to share a
 * provider. Only presentation branches on the count — the domain model and the
 * port never do, because building the fan-out later, after single-provider
 * assumptions have spread, is the expensive path.
 */
export const ancillaryOfferGroupV1 = z
  .object({
    kind: z.string(),
    label: z.string(),
    offers: z.array(ancillaryOfferV1).default([]),
    diagnostics: z.array(ancillarySourceDiagnosticV1).default([]),
  })
  .strict()
export type AncillaryOfferGroupV1 = z.infer<typeof ancillaryOfferGroupV1>

/**
 * What the traveller decided.
 *
 * Declining is a first-class decision, not the absence of one: the step cannot
 * be advanced by ignoring it, and a caller can tell "declined" apart from "not
 * asked yet".
 */
export const ancillarySelectionV1 = z
  .object({
    kind: z.string(),
    decision: z.enum(["accepted", "declined"]),
    offerId: z.string().optional(),
    sourceId: z.string().optional(),
    providerId: z.string().optional(),
    quoteRef: z.string().optional(),
    /** Only populated for an accepted offer. */
    travelers: z
      .array(
        z
          .object({ ref: z.string(), fields: z.record(z.string(), z.string()).default({}) })
          .strict(),
      )
      .default([]),
    selectedOptionIds: z.array(z.string()).default([]),
    acceptedDisclosures: z
      .array(z.object({ kind: z.string(), versionId: z.string(), acceptedAt: z.string() }).strict())
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision !== "accepted") return
    for (const key of ["offerId", "sourceId", "providerId", "quoteRef"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `an accepted ancillary selection must carry ${key}`,
        })
      }
    }
  })
export type AncillarySelectionV1 = z.infer<typeof ancillarySelectionV1>

/**
 * The neutral default order: purchasable first, then cheapest, then a stable
 * tie-break on provider name and offer id.
 *
 * Never sorted by what earns the operator the most. There is no commission or
 * margin field on an offer for such a sort to reach, and there must not be one.
 * `planLabel` is not consulted.
 */
export function orderAncillaryOffers(offers: readonly AncillaryOfferV1[]): AncillaryOfferV1[] {
  return [...offers].sort((left, right) => {
    const leftRank = left.eligibility.status === "eligible" ? 0 : 1
    const rightRank = right.eligibility.status === "eligible" ? 0 : 1
    if (leftRank !== rightRank) return leftRank - rightRank
    if (left.price.amountMinor !== right.price.amountMinor) {
      return left.price.amountMinor - right.price.amountMinor
    }
    const byProvider = left.providerLabel.localeCompare(right.providerLabel)
    if (byProvider !== 0) return byProvider
    return left.offerId.localeCompare(right.offerId)
  })
}

/** True when a traveller could actually buy this offer. */
export function isAncillaryOfferSelectable(offer: AncillaryOfferV1): boolean {
  return offer.eligibility.status === "eligible"
}

/**
 * The identity of an offer across the whole fan-out.
 *
 * `offerId` alone is not one. It is whatever the provider called its own quote,
 * and two insurers asked the same question at the same moment can both answer
 * `"Q-1"`. Keying a control, a lookup or a validation on `offerId` by itself
 * therefore resolves to whichever offer happens to be first, and the traveller
 * who picked the second provider gets the first provider's `sourceId`,
 * `providerId` and `quoteRef` stored against their selection — a policy bought
 * from an insurer they did not choose.
 *
 * So identity is the triple, and every consumer uses this one function for it.
 */
export function ancillaryOfferKey(
  offer: Pick<AncillaryOfferV1, "sourceId" | "providerId" | "offerId">,
): string {
  return `${offer.sourceId}::${offer.providerId}::${offer.offerId}`
}

/**
 * The same identity, read off a stored selection.
 *
 * Returns `null` for a selection that carries no offer — a decline, or one not
 * yet made — so a caller cannot accidentally match it against a real offer.
 */
export function ancillarySelectionKey(
  selection: Pick<AncillarySelectionV1, "offerId" | "sourceId" | "providerId">,
): string | null {
  if (!selection.offerId || !selection.sourceId || !selection.providerId) return null
  return `${selection.sourceId}::${selection.providerId}::${selection.offerId}`
}

/**
 * Whether the offer group needs comparison affordances.
 *
 * One connected provider is not a comparison, and presenting it as one invents
 * a contest that does not exist. Comparison chrome appears only when offers
 * actually come from more than one provider.
 */
export function hasMultipleAncillaryProviders(offers: readonly AncillaryOfferV1[]): boolean {
  return new Set(offers.map((offer) => offer.providerId)).size > 1
}
