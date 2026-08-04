import type { OfferPreviewResultV1 } from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq } from "drizzle-orm"

import {
  assertCatalogComponentBookingDraftReady,
  bookingDraftFromComponent,
  isCatalogBackedTripComponent,
} from "./catalog-component-adapter.js"
import type { TripComponent, TripEnvelope } from "./schema.js"
import { tripComponents, tripEnvelopes } from "./schema.js"
import {
  aggregateComponentPricing,
  assertTripComponentCanBeUpdated,
  pricingSnapshotFromBreakdown,
  taxLinesFromBreakdown,
} from "./service-helpers.js"
import { createComponentEvent, minComponentPriceExpiry } from "./service-internals.js"
import { getTrip } from "./service-trips.js"
import type { PriceTripDeps, PriceTripResult } from "./service-types.js"
import { TripsInvariantError } from "./service-types.js"
import type { PriceTripInput, TripComponentStatus } from "./validation.js"

export async function priceTrip(
  db: AnyDrizzleDb,
  input: PriceTripInput,
  deps: PriceTripDeps,
): Promise<PriceTripResult> {
  const trip = await getTrip(db, input.envelopeId)
  if (!trip) {
    throw new TripsInvariantError(`Trip envelope ${input.envelopeId} was not found`)
  }

  const warnings = new Set<string>()
  const failures: PriceTripResult["failures"] = []
  const pricedComponents: TripComponent[] = []

  for (const component of trip.components) {
    if (component.status === "removed" || component.status === "cancelled") {
      pricedComponents.push(component)
      continue
    }

    if (isCatalogBackedTripComponent(component)) {
      const bookingDraft = bookingDraftFromComponent(
        component,
        deps.componentBookingDraftOverrides?.[component.id],
      )
      assertCatalogComponentBookingDraftReady(component, bookingDraft)
      const quote = await deps.quoteCatalogComponent({
        component,
        bookingDraft,
        scope: input.scope,
      })
      const updated = await applyQuoteToComponent(db, component, quote)
      pricedComponents.push(updated)
      if (!quote.available || !quote.pricing) {
        const reason = quote.unavailableReason ?? "quote_unavailable"
        warnings.add(reason)
        failures.push({ componentId: component.id, reason })
      }
      continue
    }

    const updated = await applyPlaceholderPricing(db, component)
    pricedComponents.push(updated)
    for (const warning of updated.warningCodes) warnings.add(warning)
    if (!updated.pricingSnapshot) {
      failures.push({ componentId: component.id, reason: "manual_price_missing" })
    }
  }

  const aggregate = aggregateComponentPricing(pricedComponents, input.scope.currency)
  for (const warning of aggregate.warnings ?? []) warnings.add(warning)
  const pricing = { ...aggregate, warnings: [...warnings] }

  const [envelope] = (await db
    .update(tripEnvelopes)
    .set({
      status: "priced",
      aggregateCurrency: pricing.currency,
      aggregateSubtotalAmountCents: pricing.subtotalAmountCents,
      aggregateTaxAmountCents: pricing.taxAmountCents,
      aggregateTotalAmountCents: pricing.totalAmountCents,
      aggregatePricingSnapshot: pricing,
      currentPriceExpiresAt: minComponentPriceExpiry(pricedComponents),
      updatedAt: new Date(),
    })
    .where(eq(tripEnvelopes.id, input.envelopeId))
    .returning()) as TripEnvelope[]

  if (!envelope) {
    throw new Error("priceTrip: envelope update returned no rows")
  }

  return {
    envelope,
    components: pricedComponents,
    pricing,
    warnings: [...warnings],
    failures,
  }
}

/**
 * Fold a non-binding Offer Preview onto the component.
 *
 * `priceExpiresAt` is cleared rather than carried: a preview mints no
 * identifier and confers no price protection (`binding: false`), so there is
 * nothing that could expire. The binding price and its expiry are minted by the
 * accepted-Proposal Booking Session, not here.
 */
export async function applyQuoteToComponent(
  db: AnyDrizzleDb,
  component: TripComponent,
  quote: OfferPreviewResultV1,
): Promise<TripComponent> {
  const pricingSnapshot = quote.pricing ? pricingSnapshotFromBreakdown(quote.pricing) : undefined
  const warningCodes = quote.unavailableReason ? [quote.unavailableReason] : []
  const nextStatus: TripComponentStatus =
    quote.available && quote.pricing ? "priced" : "unavailable"

  assertTripComponentCanBeUpdated(component, { status: nextStatus })

  const [updated] = (await db
    .update(tripComponents)
    .set({
      status: nextStatus,
      componentCurrency: pricingSnapshot?.currency ?? null,
      componentSubtotalAmountCents: pricingSnapshot?.subtotalAmountCents ?? null,
      componentTaxAmountCents: pricingSnapshot?.taxAmountCents ?? null,
      componentTotalAmountCents: pricingSnapshot?.totalAmountCents ?? null,
      pricingSnapshot,
      taxLines: quote.pricing ? taxLinesFromBreakdown(quote.pricing) : [],
      priceExpiresAt: null,
      warningCodes,
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()) as TripComponent[]

  if (!updated) {
    throw new Error(`applyQuoteToComponent: update returned no row for ${component.id}`)
  }

  await createComponentEvent(db, {
    envelopeId: updated.envelopeId,
    componentId: updated.id,
    eventType: "priced",
    fromStatus: component.status,
    toStatus: updated.status,
    payload: {
      binding: quote.binding,
      available: quote.available,
      unavailableReason: quote.unavailableReason,
    },
  })

  return updated
}

async function applyPlaceholderPricing(
  db: AnyDrizzleDb,
  component: TripComponent,
): Promise<TripComponent> {
  const warningCodes = component.pricingSnapshot
    ? ["manual_placeholder_price"]
    : ["manual_price_missing"]
  const nextStatus: TripComponentStatus = component.pricingSnapshot ? "priced" : "unavailable"

  assertTripComponentCanBeUpdated(component, { status: nextStatus })

  const [updated] = (await db
    .update(tripComponents)
    .set({
      status: nextStatus,
      warningCodes,
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()) as TripComponent[]

  if (!updated) {
    throw new Error(`applyPlaceholderPricing: update returned no row for ${component.id}`)
  }

  await createComponentEvent(db, {
    envelopeId: updated.envelopeId,
    componentId: updated.id,
    eventType: "priced",
    fromStatus: component.status,
    toStatus: updated.status,
    payload: { placeholder: true },
  })

  return updated
}
