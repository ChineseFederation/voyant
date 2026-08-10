import type {
  ReserveRequest,
  SourceAdapter,
  SourceAdapterContext,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import type {
  Guest,
  StayConfirmInput,
  StayHold,
  StayOffer,
  StaySearchQuery,
  VoyantConnectClient,
} from "@voyant-travel/connect-sdk"

import { recordValue, stringValue } from "./utils.js"

/** Exact search -> quote check -> hold -> confirm lifecycle for sourced stays. */
export function withConnectStayBookingLifecycle(
  base: SourceAdapter,
  client: VoyantConnectClient,
): SourceAdapter {
  return {
    ...base,
    async reserve(ctx, request) {
      if (request.parameters.connectRoute !== "stays") {
        if (!base.reserve) {
          throw new ReservationDispatchError(
            "Voyant Connect booking forwarding is unavailable",
            "not_sent",
            "booking_forwarding_unavailable",
          )
        }
        return base.reserve(ctx, request)
      }
      return reserveStay(client, ctx, request)
    },
  }
}

async function reserveStay(
  client: VoyantConnectClient,
  ctx: SourceAdapterContext,
  request: ReserveRequest,
) {
  const connectionId = requiredConnectionId(ctx)
  const resolvedSearch = staySearchQuery(request)
  if (!resolvedSearch) return failed(request.entity_id, "stay_selection_incomplete")

  let offer: StayOffer | undefined
  try {
    const response = await client.stays.search(connectionId, resolvedSearch.query)
    offer = response.offers.find(
      (candidate) =>
        candidate.connectionId === connectionId &&
        candidate.accommodationId === (request.source_ref ?? request.entity_id) &&
        matchesRooms(candidate, resolvedSearch.pins),
    )
  } catch (error) {
    throw notSent(error, "stay_quote_unavailable")
  }
  if (!offer || Date.parse(offer.expiresAt) <= Date.now()) {
    return failed(request.entity_id, "stay_offer_unavailable")
  }
  const quote = expectedPrice(request.parameters)
  if (!quote || !samePrice(offer, quote)) return failed(request.entity_id, "stay_price_changed")

  let hold: StayHold
  try {
    hold = await client.stays.lock(connectionId, offer)
  } catch (error) {
    throw notSent(error, "stay_hold_failed")
  }
  if (
    hold.status !== "active" ||
    Date.parse(hold.expiresAt) <= Date.now() ||
    !sameSelection(offer, hold.offerSnapshot) ||
    !samePrice(hold.offerSnapshot, quote)
  ) {
    await release(client, connectionId, hold.id)
    return failed(request.entity_id, "stay_hold_changed")
  }

  const confirmation = confirmationInput(request, hold.id, hold.offerSnapshot)
  if (!confirmation) {
    await release(client, connectionId, hold.id)
    return failed(request.entity_id, "stay_party_incomplete")
  }
  try {
    const booking = await client.stays.confirm(connectionId, confirmation, {
      idempotencyKey: request.idempotency_key,
    })
    return {
      upstream_ref: `stay:${booking.id}`,
      status: booking.status === "confirmed" ? ("confirmed" as const) : ("held" as const),
      upstream_payload: booking as unknown as Record<string, unknown>,
    }
  } catch (error) {
    // Confirmation may have reached the supplier. Never release or retry it
    // blindly; Catalog's existing supplier-operation reconciliation owns it.
    throw new ReservationDispatchError(
      message(error, "Voyant Connect stay confirmation is in doubt"),
      "possibly_sent",
      "stay_confirmation_in_doubt",
    )
  }
}

function staySearchQuery(request: ReserveRequest): {
  query: StaySearchQuery
  pins: Array<{ roomTypeId: string; ratePlanId: string }>
} | null {
  const p = request.parameters
  const checkIn = stringValue(p.checkIn)
  const checkOut = stringValue(p.checkOut)
  const rooms = Array.isArray(p.rooms)
    ? p.rooms.flatMap((value) => {
        const room = recordValue(value)
        const roomTypeId = stringValue(room?.roomTypeId)
        const ratePlanId = stringValue(room?.ratePlanId)
        const occupancy = stayOccupancy(room?.occupancy)
        return roomTypeId && ratePlanId && occupancy ? [{ roomTypeId, ratePlanId, occupancy }] : []
      })
    : []
  if (!checkIn || !checkOut || rooms.length === 0) return null
  return {
    query: {
      accommodationIds: [request.source_ref ?? request.entity_id],
      checkIn,
      checkOut,
      rooms: rooms.map(({ occupancy }) => occupancy),
      ...(request.scope?.locale ? { locale: request.scope.locale } : {}),
      limit: 100,
    },
    pins: rooms.map(({ roomTypeId, ratePlanId }) => ({ roomTypeId, ratePlanId })),
  }
}

function matchesRooms(
  offer: StayOffer,
  pins: Array<{ roomTypeId: string; ratePlanId: string }>,
): boolean {
  if (pins.length !== offer.rooms.length) return false
  return pins.every(
    (pin, index) =>
      offer.rooms[index]?.roomTypeId === pin.roomTypeId &&
      offer.rooms[index]?.ratePlanId === pin.ratePlanId,
  )
}

function confirmationInput(
  request: ReserveRequest,
  holdId: string,
  offer: StayOffer,
): StayConfirmInput | null {
  const party = recordValue(request.party)
  const contact = recordValue(party?.contact)
  const email = stringValue(contact?.email)
  const phone = stringValue(contact?.phone)
  const passengers = Array.isArray(party?.passengers)
    ? party.passengers.flatMap((value) => {
        const guest = mapGuest(value)
        return guest ? [guest] : []
      })
    : []
  if (!email || passengers.length === 0) return null
  let offset = 0
  const guestsByRoom = offer.rooms.map((room) => {
    const count =
      room.occupancy.adults + (room.occupancy.children ?? 0) + (room.occupancy.infants ?? 0)
    const guests = passengers.slice(offset, offset + count)
    offset += count
    return guests
  })
  if (offset !== passengers.length || guestsByRoom.some((guests) => guests.length === 0))
    return null
  return {
    holdId,
    leadGuest: passengers.find((guest) => guest.email === email) ?? passengers[0]!,
    contact: { email, ...(phone ? { phone } : {}) },
    guestsByRoom,
  }
}

function mapGuest(value: unknown): Guest | null {
  const row = recordValue(value)
  const firstName = stringValue(row?.firstName)
  const lastName = stringValue(row?.lastName)
  if (!firstName || !lastName) return null
  const category = row?.travelerCategory
  return {
    type: category === "child" || category === "infant" ? category : "adult",
    firstName,
    lastName,
    ...(stringValue(row?.email) ? { email: stringValue(row?.email) } : {}),
    ...(stringValue(row?.phone) ? { phone: stringValue(row?.phone) } : {}),
  }
}

function stayOccupancy(value: unknown): StaySearchQuery["rooms"][number] | null {
  const row = recordValue(value)
  const adults = positiveInteger(row?.adults)
  if (!adults) return null
  const children = nonnegativeInteger(row?.children)
  const infants = nonnegativeInteger(row?.infants)
  return {
    adults,
    ...(children ? { children } : {}),
    ...(infants ? { infants } : {}),
  }
}

function expectedPrice(parameters: Record<string, unknown>) {
  const row = recordValue(parameters.bookingQuote)
  const currency = stringValue(row?.currency)
  const totalAmountMinor = row?.totalAmountMinor
  return currency && typeof totalAmountMinor === "number" && Number.isInteger(totalAmountMinor)
    ? { currency, totalAmountMinor }
    : null
}

function samePrice(offer: StayOffer, expected: { currency: string; totalAmountMinor: number }) {
  return (
    offer.totals.total.currency === expected.currency &&
    offer.totals.total.amountMinor === expected.totalAmountMinor
  )
}

function sameSelection(left: StayOffer, right: StayOffer) {
  return (
    left.connectionId === right.connectionId &&
    left.accommodationId === right.accommodationId &&
    JSON.stringify(left.rooms) === JSON.stringify(right.rooms)
  )
}

function requiredConnectionId(ctx: SourceAdapterContext) {
  const value = stringValue(ctx.connection_id)
  if (!value || value === "engine") {
    throw new ReservationDispatchError(
      "Voyant Connect stay connection unavailable",
      "not_sent",
      "stay_connection_unavailable",
    )
  }
  return value
}

async function release(client: VoyantConnectClient, connectionId: string, holdId: string) {
  try {
    await client.stays.releaseLock(connectionId, holdId)
  } catch {
    // Confirmation is still blocked. The expired/changed hold remains visible
    // to provider reconciliation even when best-effort release fails.
  }
}

function failed(entityId: string, reason: string) {
  return {
    upstream_ref: `stay-offer:${entityId}`,
    status: "failed" as const,
    upstream_payload: { reason },
  }
}

function notSent(error: unknown, errorClass: string) {
  return new ReservationDispatchError(message(error, errorClass), "not_sent", errorClass)
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function nonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}
