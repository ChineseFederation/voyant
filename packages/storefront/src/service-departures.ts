import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  getStorefrontSlotsResourceAvailability,
  listItineraryDayMedia,
  listItineraryDayServices,
  listItineraryDays,
} from "./service-boundary-sql.js"
import {
  buildAvailabilityState,
  buildResourceManifest,
  countSlots,
  listDefaultItineraryIdsByProductIds,
  listMeetingPointsByProductIds,
  listSlots,
  normalizeIso,
  normalizeLocalDate,
  resolveDepartureCapacity,
  type SlotResourceAvailability,
  type SlotRow,
  summarizeProductAvailability,
  todayLocalDate,
} from "./service-departures-core.js"
import {
  buildDepartureStatus,
  buildRatePlans,
  resolvePricingContext,
} from "./service-departures-pricing.js"
import type {
  StorefrontDepartureListQuery,
  StorefrontProductAvailabilitySummaryQuery,
} from "./validation.js"

export {
  buildTravelerRequestedUnits,
  getStorefrontProductExtensions,
  previewStorefrontDeparturePrice,
} from "./service-departures-pricing.js"

async function buildDeparture(
  db: PostgresJsDatabase,
  slot: SlotRow,
  defaultItineraryByProduct: Map<string, string>,
  meetingPointByProduct?: Map<string, string>,
  resourceAvailability?: SlotResourceAvailability[],
) {
  const context = await resolvePricingContext(db, slot.productId, slot.optionId, slot.id)
  const itineraryId = slot.itineraryId ?? defaultItineraryByProduct.get(slot.productId) ?? null
  const resources = resourceAvailability ?? []
  const { capacity, remaining } = resolveDepartureCapacity(slot)

  return {
    id: slot.id,
    productId: slot.productId,
    itineraryId: itineraryId ?? slot.id,
    optionId: slot.optionId,
    dateLocal: normalizeLocalDate(slot.dateLocal),
    startAt: normalizeIso(slot.startsAt),
    endAt: normalizeIso(slot.endsAt),
    timezone: slot.timezone,
    startTime:
      slot.startTimeId == null
        ? null
        : {
            id: slot.startTimeId,
            label: slot.startTimeLabel,
            startTimeLocal: slot.startTimeLocal ?? "00:00",
            durationMinutes: slot.durationMinutes,
          },
    meetingPoint: meetingPointByProduct?.get(slot.productId) ?? null,
    capacity,
    remaining,
    departureStatus: buildDepartureStatus(slot, context),
    nights: slot.nights,
    days: slot.days,
    ratePlans: buildRatePlans(context),
    resourceManifest: buildResourceManifest(resources),
  }
}

export async function getStorefrontDeparture(db: PostgresJsDatabase, departureId: string) {
  const [slot] = await listSlots(db, { slotId: departureId, limit: 1 })
  if (!slot) {
    return null
  }

  const [meetingPointByProduct, defaultItineraryByProduct, resourceAvailability] =
    await Promise.all([
      listMeetingPointsByProductIds(db, [slot.productId]),
      listDefaultItineraryIdsByProductIds(db, [slot.productId]),
      getStorefrontSlotsResourceAvailability(db, [slot.id]),
    ])

  return buildDeparture(
    db,
    slot,
    defaultItineraryByProduct,
    meetingPointByProduct,
    resourceAvailability.get(slot.id) ?? [],
  )
}

export async function listStorefrontProductDepartures(
  db: PostgresJsDatabase,
  productId: string,
  query: StorefrontDepartureListQuery,
) {
  const filters = {
    productId,
    optionId: query.optionId,
    status: query.status,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  }
  const [slots, total] = await Promise.all([
    listSlots(db, {
      ...filters,
      limit: query.limit,
      offset: query.offset,
    }),
    countSlots(db, filters),
  ])
  const [meetingPointByProduct, defaultItineraryByProduct, resourceAvailability] =
    await Promise.all([
      listMeetingPointsByProductIds(db, [productId]),
      listDefaultItineraryIdsByProductIds(db, [productId]),
      getStorefrontSlotsResourceAvailability(
        db,
        slots.map((slot) => slot.id),
      ),
    ])
  const data = await Promise.all(
    slots.map((slot) =>
      buildDeparture(
        db,
        slot,
        defaultItineraryByProduct,
        meetingPointByProduct,
        resourceAvailability.get(slot.id) ?? [],
      ),
    ),
  )

  return {
    data,
    total,
    limit: query.limit,
    offset: query.offset,
  }
}

export async function getStorefrontProductAvailabilitySummary(
  db: PostgresJsDatabase,
  productId: string,
  query: StorefrontProductAvailabilitySummaryQuery,
) {
  const requestedStatus = query.status
  const persistedStatus = requestedStatus === "on_request" ? "open" : requestedStatus
  const filters = {
    productId,
    optionId: query.optionId,
    status: persistedStatus,
    dateFrom: query.dateFrom ?? todayLocalDate(),
    dateTo: query.dateTo,
    includeCancelled: true,
  }
  const [slots, total] = await Promise.all([
    listSlots(db, {
      ...filters,
      limit: query.limit,
      offset: query.offset,
    }),
    countSlots(db, filters),
  ])
  const [meetingPointByProduct, defaultItineraryByProduct] = await Promise.all([
    listMeetingPointsByProductIds(db, [productId]),
    listDefaultItineraryIdsByProductIds(db, [productId]),
  ])
  const departures = (
    await Promise.all(
      slots.map(async (slot) => {
        const departure = await buildDeparture(
          db,
          slot,
          defaultItineraryByProduct,
          meetingPointByProduct,
        )
        const availabilityState = buildAvailabilityState({
          status: departure.departureStatus,
          remaining: departure.remaining,
          capacity: departure.capacity,
          pastCutoff: slot.pastCutoff,
          tooEarly: slot.tooEarly,
        })

        return {
          id: departure.id,
          productId: departure.productId,
          optionId: departure.optionId,
          dateLocal: departure.dateLocal,
          startAt: departure.startAt,
          endAt: departure.endAt,
          timezone: departure.timezone,
          status: departure.departureStatus,
          availabilityState,
          capacity: departure.capacity,
          remaining: departure.remaining,
          pastCutoff: slot.pastCutoff,
          tooEarly: slot.tooEarly,
        }
      }),
    )
  ).filter((departure) => !requestedStatus || departure.status === requestedStatus)

  const counts = departures.reduce(
    (acc, departure) => {
      acc.total += 1
      if (departure.status === "open") acc.open += 1
      if (departure.status === "closed") acc.closed += 1
      if (departure.status === "sold_out") acc.soldOut += 1
      if (departure.status === "cancelled") acc.cancelled += 1
      if (departure.status === "on_request") acc.onRequest += 1
      if (departure.availabilityState === "past_cutoff") acc.pastCutoff += 1
      if (departure.availabilityState === "too_early") acc.tooEarly += 1
      if (departure.availabilityState === "available") acc.available += 1
      return acc
    },
    {
      total: 0,
      open: 0,
      closed: 0,
      soldOut: 0,
      cancelled: 0,
      onRequest: 0,
      pastCutoff: 0,
      tooEarly: 0,
      available: 0,
    },
  )

  return {
    productId,
    availabilityState: summarizeProductAvailability(departures),
    counts,
    departures,
    total: requestedStatus === "on_request" ? departures.length : total,
    limit: query.limit,
    offset: query.offset,
  }
}

export async function getStorefrontDepartureItinerary(
  db: PostgresJsDatabase,
  input: { departureId: string; productId: string; languageTag?: string | null },
) {
  const [slot] = await listSlots(db, {
    productId: input.productId,
    slotId: input.departureId,
    limit: 1,
  })
  const defaultItineraryByProduct = await listDefaultItineraryIdsByProductIds(db, [input.productId])
  const itineraryId = slot?.itineraryId ?? defaultItineraryByProduct.get(input.productId)

  if (!itineraryId) {
    return null
  }

  const days = await listItineraryDays(db, itineraryId, input.languageTag)

  if (days.length === 0) {
    return null
  }

  const dayIds = days.map((day) => day.id)
  const [services, dayMedia] = await Promise.all([
    listItineraryDayServices(db, dayIds, input.languageTag),
    listItineraryDayMedia(db, { productId: input.productId, dayIds }),
  ])

  const servicesByDay = new Map<string, Array<(typeof services)[number]>>()
  for (const service of services) {
    const existing = servicesByDay.get(service.dayId) ?? []
    existing.push(service)
    servicesByDay.set(service.dayId, existing)
  }

  const mediaByDay = new Map<string, (typeof dayMedia)[number]>()
  for (const media of dayMedia) {
    if (!media.dayId || mediaByDay.has(media.dayId)) {
      continue
    }

    mediaByDay.set(media.dayId, media)
  }

  return {
    id: input.departureId,
    itineraryId,
    days: days.map((day) => ({
      id: day.id,
      title: day.title ?? `Day ${day.dayNumber}`,
      description: day.description ?? null,
      thumbnail: mediaByDay.get(day.id) ? { url: mediaByDay.get(day.id)?.url ?? "" } : null,
      segments: (servicesByDay.get(day.id) ?? []).map((service) => ({
        id: service.id,
        title: service.name,
        description: service.description ?? null,
      })),
    })),
  }
}
