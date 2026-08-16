import { sellabilityService } from "@voyant-travel/commerce"
import { and, asc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productExtrasRef } from "./product-extra-ref.js"
import { getPublicApiSlotResourceAvailability } from "./service-boundary-sql.js"
import {
  buildAvailabilityState,
  buildResourceManifest,
  listSlots,
  normalizeIso,
  normalizeLocalDate,
  resolveDepartureCapacity,
} from "./service-departures-core.js"
import {
  buildOfferPreview,
  type PublicApiDeparturePricePreviewOfferResolvers,
} from "./service-departures-offers.js"
import {
  amountToCents,
  buildDepartureStatus,
  buildTravelerRequestedUnits,
  centsToAmount,
  convertedAmount,
  getPreferredCurrency,
  type PricingContext,
  resolvePricingContext,
  selectUnitAmount,
  selectUnitTier,
} from "./service-departures-pricing-context.js"
import type { PublicApiDeparturePricePreviewInput } from "./validation.js"

type ResolvedPricingComponent = {
  kind: string
  title: string
  quantity: number
  pricingMode: string
  sellAmountCents: number
  unitId: string | null
  unitName: string | null
  unitType: string | null
  requestRef: string | null
  tierId: string | null
}

function computeFallbackLineItems(args: {
  context: PricingContext
  adults: number
  children: number
  infants: number
  rooms: Array<{ unitId: string; occupancy: number; quantity: number }>
}) {
  const lineItems: Array<{ name: string; total: number; quantity: number; unitPrice: number }> = []
  const currencyCode = getPreferredCurrency(args.context)
  let total = 0

  if (args.rooms.length > 0) {
    for (const room of args.rooms) {
      const unitRule = args.context.unitRules.find((row) => row.unitId === room.unitId)
      if (!unitRule) {
        continue
      }

      const amountCents = selectUnitAmount(
        args.context,
        unitRule,
        Math.max(1, room.occupancy * room.quantity),
      )
      const unitAmount = centsToAmount(amountCents) ?? 0
      const quantity =
        unitRule.pricingMode === "per_person"
          ? Math.max(1, room.occupancy * room.quantity)
          : Math.max(1, room.quantity)
      const totalAmount = Number((unitAmount * quantity).toFixed(2))
      total += totalAmount
      const unit = args.context.units.find((row) => row.id === room.unitId)
      lineItems.push({
        name: unit?.name ?? room.unitId,
        total: totalAmount,
        quantity,
        unitPrice: unitAmount,
      })
    }
  } else {
    const requested = buildTravelerRequestedUnits({
      units: args.context.units,
      adults: args.adults,
      children: args.children,
      infants: args.infants,
    })

    for (const request of requested) {
      const unitRule = request.unitId
        ? args.context.unitRules.find((row) => row.unitId === request.unitId)
        : args.context.unitRules[0]
      if (!unitRule) {
        continue
      }

      const unitAmount =
        centsToAmount(selectUnitAmount(args.context, unitRule, request.quantity)) ?? 0
      const totalAmount = Number((unitAmount * request.quantity).toFixed(2))
      total += totalAmount
      const unit = request.unitId
        ? args.context.units.find((row) => row.id === request.unitId)
        : null
      lineItems.push({
        name: unit?.name ?? args.context.option?.name ?? "Traveler",
        total: totalAmount,
        quantity: request.quantity,
        unitPrice: unitAmount,
      })
    }
  }

  if (lineItems.length === 0 && args.context.product?.sellAmountCents != null) {
    const pax = Math.max(1, args.adults + args.children + args.infants)
    const unitAmount = centsToAmount(args.context.product.sellAmountCents) ?? 0
    const totalAmount = Number((unitAmount * pax).toFixed(2))
    total += totalAmount
    lineItems.push({
      name: args.context.option?.name ?? "Base",
      total: totalAmount,
      quantity: pax,
      unitPrice: unitAmount,
    })
  }

  return {
    currencyCode,
    total: Number(total.toFixed(2)),
    lineItems,
  }
}

function buildResolvedLineItems(
  components: ResolvedPricingComponent[],
  conversionRate?: number | null,
) {
  return components.map((component) => {
    const total = convertedAmount(component.sellAmountCents, conversionRate) ?? 0
    const quantity = Math.max(1, component.quantity)

    return {
      name: component.title,
      total,
      quantity,
      unitPrice: Number((total / quantity).toFixed(2)),
    }
  })
}

function buildRequestedUnitRows(args: {
  context: PricingContext
  requestedUnits: Array<{ unitId?: string; requestRef?: string; quantity: number }>
  components: ResolvedPricingComponent[]
  currencyCode: string
  conversionRate?: number | null
}) {
  return args.requestedUnits.map((request) => {
    const unit = request.unitId ? args.context.units.find((row) => row.id === request.unitId) : null
    const unitRule = request.unitId
      ? args.context.unitRules.find((row) => row.unitId === request.unitId)
      : args.context.unitRules[0]
    const tier = selectUnitTier(unitRule, args.context.tiers, request.quantity)
    const component =
      args.components.find(
        (row) => row.kind === "unit" && request.requestRef && row.requestRef === request.requestRef,
      ) ??
      args.components.find(
        (row) => row.kind === "unit" && request.unitId && row.unitId === request.unitId,
      )
    const quantity = Math.max(1, request.quantity)
    const total =
      component != null
        ? (convertedAmount(component.sellAmountCents, args.conversionRate) ?? 0)
        : Number(
            (
              (convertedAmount(
                tier?.sellAmountCents ?? unitRule?.sellAmountCents,
                args.conversionRate,
              ) ?? 0) * quantity
            ).toFixed(2),
          )
    const unitAmount = Number((total / quantity).toFixed(2))

    return {
      unitId: request.unitId ?? null,
      requestRef: request.requestRef ?? request.unitId ?? null,
      name: unit?.name ?? args.context.option?.name ?? "Traveler",
      unitType: unit?.unitType ?? null,
      quantity,
      pricingMode: component?.pricingMode ?? unitRule?.pricingMode ?? null,
      unitPrice: unitAmount,
      total,
      currencyCode: args.currencyCode,
      tierId: component?.tierId ?? tier?.id ?? null,
    }
  })
}

function buildRoomRows(args: {
  context: PricingContext
  rooms: Array<{ unitId: string; requestRef: string; occupancy: number; quantity: number }>
  components: ResolvedPricingComponent[]
  currencyCode: string
  conversionRate?: number | null
}) {
  return args.rooms.map((room) => {
    const unit = args.context.units.find((row) => row.id === room.unitId)
    const unitRule = args.context.unitRules.find((row) => row.unitId === room.unitId)
    const pax = Math.max(1, room.occupancy * room.quantity)
    const quantity = unitRule?.pricingMode === "per_person" ? pax : Math.max(1, room.quantity)
    const tier = selectUnitTier(unitRule, args.context.tiers, pax)
    const component =
      args.components.find((row) => row.kind === "unit" && row.requestRef === room.requestRef) ??
      args.components.find((row) => row.kind === "unit" && row.unitId === room.unitId)
    const total =
      component != null
        ? (convertedAmount(component.sellAmountCents, args.conversionRate) ?? 0)
        : Number(
            (
              (convertedAmount(
                tier?.sellAmountCents ?? unitRule?.sellAmountCents,
                args.conversionRate,
              ) ?? 0) * quantity
            ).toFixed(2),
          )
    const unitAmount = Number((total / quantity).toFixed(2))

    return {
      unitId: room.unitId,
      name: unit?.name ?? room.unitId,
      occupancy: room.occupancy,
      quantity: room.quantity,
      pax,
      pricingMode: component?.pricingMode ?? unitRule?.pricingMode ?? null,
      unitPrice: unitAmount,
      total,
      currencyCode: args.currencyCode,
      tierId: component?.tierId ?? tier?.id ?? null,
    }
  })
}

async function buildExtraImpacts(args: {
  db: PostgresJsDatabase
  productId: string
  context: PricingContext
  paxTotal: number
  extras: Array<{ extraId: string; quantity: number }>
  currencyCode: string
  conversionRate?: number | null
}) {
  const selectedQuantityByExtraId = new Map(
    args.extras.map((extra) => [extra.extraId, extra.quantity] as const),
  )
  const extras = await args.db
    .select({
      id: productExtrasRef.id,
      name: productExtrasRef.name,
      selectionType: productExtrasRef.selectionType,
      pricingMode: productExtrasRef.pricingMode,
      pricedPerPerson: productExtrasRef.pricedPerPerson,
      defaultQuantity: productExtrasRef.defaultQuantity,
      minQuantity: productExtrasRef.minQuantity,
    })
    .from(productExtrasRef)
    .where(and(eq(productExtrasRef.productId, args.productId), eq(productExtrasRef.active, true)))
    .orderBy(asc(productExtrasRef.sortOrder), asc(productExtrasRef.name))

  const ruleByExtraId = new Map(
    args.context.extraRules
      .filter((rule) => rule.productExtraId)
      .map((rule) => [rule.productExtraId as string, rule] as const),
  )

  return extras.map((extra) => {
    const rule = ruleByExtraId.get(extra.id)
    const selectedQuantity = selectedQuantityByExtraId.get(extra.id)
    const required = extra.selectionType === "required"
    const selected = selectedQuantity != null || required
    const pricingMode =
      rule?.pricingMode ?? (extra.pricedPerPerson ? "per_person" : extra.pricingMode)
    const unitAmount = convertedAmount(rule?.sellAmountCents, args.conversionRate) ?? 0
    const chargeable =
      pricingMode === "included" ||
      pricingMode === "free" ||
      pricingMode === "unavailable" ||
      pricingMode === "on_request"
        ? false
        : selected

    const baseQuantity = selected
      ? (selectedQuantity ?? extra.defaultQuantity ?? extra.minQuantity ?? 1)
      : 0
    const quantity =
      chargeable && pricingMode === "per_person"
        ? Math.max(1, args.paxTotal * Math.max(1, baseQuantity))
        : Math.max(0, baseQuantity)
    const total = chargeable ? Number((unitAmount * quantity).toFixed(2)) : 0

    return {
      extraId: extra.id,
      name: extra.name,
      required,
      selectable: extra.selectionType !== "unavailable",
      selected,
      pricingMode,
      quantity,
      unitPrice: unitAmount,
      total,
      currencyCode: args.currencyCode,
    }
  })
}

async function applyExtraLineItems(args: {
  db: PostgresJsDatabase
  productId: string
  context: PricingContext
  paxTotal: number
  extras: Array<{ extraId: string; quantity: number }>
  currencyCode: string
  conversionRate?: number | null
  lineItems: Array<{ name: string; total: number; quantity: number; unitPrice: number }>
  total: number
}) {
  const impacts = await buildExtraImpacts(args)
  const selectedImpacts = impacts.filter((extra) => extra.selected && extra.total > 0)
  const lineItems = [
    ...args.lineItems,
    ...selectedImpacts.map((extra) => ({
      name: extra.name,
      total: extra.total,
      quantity: Math.max(1, extra.quantity),
      unitPrice: extra.unitPrice,
    })),
  ]
  const total = selectedImpacts.reduce((sum, extra) => sum + extra.total, args.total)

  return {
    lineItems,
    total: Number(total.toFixed(2)),
    impacts,
  }
}

export async function previewPublicApiDeparturePrice(
  db: PostgresJsDatabase,
  departureId: string,
  input: PublicApiDeparturePricePreviewInput,
  offerResolvers?: PublicApiDeparturePricePreviewOfferResolvers,
) {
  const [slot] = await listSlots(db, { slotId: departureId, limit: 1 })
  if (!slot) {
    return null
  }

  const context = await resolvePricingContext(db, slot.productId, slot.optionId, slot.id)
  const adults = Math.max(0, input.pax?.adults ?? 1)
  const children = Math.max(0, input.pax?.children ?? 0)
  const infants = Math.max(0, input.pax?.infants ?? 0)
  const rooms = input.rooms.map((room, index) => ({
    unitId: room.unitId,
    requestRef: `${room.unitId}:${index}`,
    occupancy: room.occupancy,
    quantity: room.quantity,
  }))
  const extras = input.extras.map((extra) => ({
    extraId: extra.extraId,
    quantity: extra.quantity,
  }))

  const requestedUnits =
    rooms.length > 0
      ? rooms.map((room) => ({
          unitId: room.unitId,
          requestRef: room.requestRef,
          quantity: Math.max(1, room.occupancy * room.quantity),
        }))
      : buildTravelerRequestedUnits({
          units: context.units,
          adults,
          children,
          infants,
        })

  const resolved = await sellabilityService.resolve(db, {
    productId: slot.productId,
    optionId: slot.optionId ?? undefined,
    slotId: departureId,
    currencyCode: input.currencyCode ?? undefined,
    requestedUnits,
    limit: 25,
  })

  const candidate =
    resolved.data.find(
      (row) => row.slot.id === departureId && (!slot.optionId || row.option.id === slot.optionId),
    ) ?? resolved.data[0]

  const conversionRate =
    candidate?.pricing.fx?.rateDecimal != null ? Number(candidate.pricing.fx.rateDecimal) : null
  const components = candidate ? (candidate.pricing.components as ResolvedPricingComponent[]) : []
  const seeded = candidate
    ? {
        currencyCode: candidate.pricing.currencyCode,
        total: Number((candidate.pricing.sellAmountCents / 100).toFixed(2)),
        lineItems: buildResolvedLineItems(components, conversionRate),
        notes: candidate.sellability.onRequest ? "on_request" : null,
      }
    : {
        ...computeFallbackLineItems({
          context,
          adults,
          children,
          infants,
          rooms,
        }),
        notes: null,
      }
  const roomPaxTotal = rooms.reduce(
    (sum, room) => sum + Math.max(1, room.occupancy * room.quantity),
    0,
  )
  const travelerPaxTotal = Math.max(1, adults + children + infants)
  const paxTotal = rooms.length > 0 ? Math.max(1, roomPaxTotal) : travelerPaxTotal

  const withExtras = await applyExtraLineItems({
    db,
    productId: slot.productId,
    context,
    paxTotal,
    extras,
    currencyCode: seeded.currencyCode,
    conversionRate,
    lineItems: seeded.lineItems,
    total: seeded.total,
  })
  const unitRows =
    rooms.length > 0
      ? []
      : buildRequestedUnitRows({
          context,
          requestedUnits,
          components,
          currencyCode: seeded.currencyCode,
          conversionRate,
        })
  const roomRows = buildRoomRows({
    context,
    rooms,
    components,
    currencyCode: seeded.currencyCode,
    conversionRate,
  })
  const subtotal = withExtras.total
  const offers = await buildOfferPreview({
    resolvers: offerResolvers,
    productId: slot.productId,
    departureId: slot.id,
    basePriceCents: amountToCents(subtotal),
    currencyCode: seeded.currencyCode,
    paxTotal,
    requestedOffers: input.offers,
    offerCode: input.offerCode,
    locale: input.locale,
    market: input.market,
  })
  const total = offers.totalAfterDiscount
  const extrasTotal = withExtras.impacts.reduce((sum, extra) => sum + extra.total, 0)
  const basePrice = Number((subtotal - extrasTotal).toFixed(2))
  const slotResources = await getPublicApiSlotResourceAvailability(db, slot.id)
  const resourceManifest = buildResourceManifest(slotResources)
  const { capacity: slotCapacity, remaining: slotRemaining } = resolveDepartureCapacity(slot)

  return {
    departureId: slot.id,
    productId: slot.productId,
    optionId: slot.optionId,
    currencyCode: seeded.currencyCode,
    basePrice,
    taxAmount: 0,
    total,
    notes: seeded.notes,
    lineItems: withExtras.lineItems,
    allocation: {
      slot: {
        id: slot.id,
        productId: slot.productId,
        optionId: slot.optionId,
        dateLocal: normalizeLocalDate(slot.dateLocal),
        startAt: normalizeIso(slot.startsAt),
        endAt: normalizeIso(slot.endsAt),
        timezone: slot.timezone,
        status: buildDepartureStatus(slot, context),
        availabilityState: buildAvailabilityState({
          status: buildDepartureStatus(slot, context),
          remaining: slotRemaining,
          capacity: slotCapacity,
          pastCutoff: slot.pastCutoff,
          tooEarly: slot.tooEarly,
        }),
        capacity: slotCapacity,
        remaining: slotRemaining,
        pastCutoff: slot.pastCutoff,
        tooEarly: slot.tooEarly,
        resourceManifest,
      },
      pax: {
        adults,
        children,
        infants,
        total: paxTotal,
      },
      requestedUnits: unitRows,
      rooms: roomRows,
    },
    units: unitRows,
    rooms: roomRows,
    extras: withExtras.impacts,
    offers,
    totals: {
      currencyCode: seeded.currencyCode,
      base: basePrice,
      extras: Number(extrasTotal.toFixed(2)),
      subtotal,
      discount: offers.discountTotal,
      tax: 0,
      total,
      perPerson: Number((total / paxTotal).toFixed(2)),
      perBooking: total,
    },
  }
}
