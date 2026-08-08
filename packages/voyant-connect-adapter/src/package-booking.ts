import type {
  LiveResolveRequest,
  ReserveRequest,
  SourceAdapter,
  SourceAdapterContext,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import type {
  PackageConfirmInput,
  PackageHold,
  PackageOffer,
  PackageSearchQuery,
  Traveler,
  VoyantConnectClient,
} from "@voyant-travel/connect-sdk"

import { recordValue, stringValue } from "./utils.js"

interface ExpectedPackagePrice {
  currency: string
  totalAmountMinor: number
}

/**
 * Add Connect's Offer -> Hold -> Booking ladder to the generic Catalog source
 * adapter. Catalog remains the lifecycle owner: this wrapper only translates
 * one already-admitted sourced Product reservation into provider operations.
 */
export function withConnectPackageBookingLifecycle(
  base: SourceAdapter,
  client: VoyantConnectClient,
): SourceAdapter {
  return {
    ...base,
    async liveResolve(ctx, request) {
      if (request.parameters?.connectRoute === "packages") {
        return liveResolvePackage(client, ctx, request)
      }
      if (!base.liveResolve) return { values: {}, failed: missing(request.ids) }
      return base.liveResolve(ctx, request)
    },
    async reserve(ctx, request) {
      if (request.parameters.connectRoute !== "packages") {
        if (!base.reserve) {
          throw new ReservationDispatchError(
            "Voyant Connect booking forwarding is unavailable",
            "not_sent",
            "booking_forwarding_unavailable",
          )
        }
        return base.reserve(ctx, request)
      }
      return reservePackage(client, ctx, request)
    },
  }
}

async function reservePackage(
  client: VoyantConnectClient,
  ctx: SourceAdapterContext,
  request: ReserveRequest,
) {
  const connectionId = requiredConnectionId(ctx)
  let resolved: PackageOffer | null
  try {
    resolved = await resolveExactOffer(client, ctx, request)
  } catch (error) {
    throw new ReservationDispatchError(
      message(error, "Voyant Connect package revalidation failed"),
      "not_sent",
      "package_quote_unavailable",
    )
  }
  if (!resolved) {
    return failedPackageResult(request.entity_id, "package_offer_unavailable")
  }
  if (resolved.connectionId !== connectionId || Date.parse(resolved.expiresAt) <= Date.now()) {
    return failedPackageResult(request.entity_id, "package_offer_unavailable")
  }
  const expected = expectedPackagePrice(request.parameters)
  if (!expected || !samePrice(resolved, expected)) {
    return failedPackageResult(request.entity_id, "package_price_changed")
  }

  let hold: PackageHold
  try {
    hold = await client.packages.lock(connectionId, resolved)
  } catch (error) {
    throw new ReservationDispatchError(
      message(error, "Voyant Connect package hold failed"),
      "not_sent",
      "package_hold_failed",
    )
  }

  const heldOffer = hold.offerSnapshot
  if (
    hold.status !== "active" ||
    Date.parse(hold.expiresAt) <= Date.now() ||
    !samePackageSelection(resolved, heldOffer) ||
    !samePrice(heldOffer, expected)
  ) {
    await releaseFailedHold(client, connectionId, hold.id)
    return failedPackageResult(request.entity_id, "package_hold_changed")
  }

  const confirm = packageConfirmInput(request, hold.id)
  if (!confirm) {
    await releaseFailedHold(client, connectionId, hold.id)
    return failedPackageResult(request.entity_id, "package_party_incomplete")
  }

  try {
    const booking = await client.packages.confirm(connectionId, confirm, {
      idempotencyKey: request.idempotency_key,
    })
    return {
      upstream_ref: `package:${booking.id}`,
      status:
        booking.status === "confirmed"
          ? ("confirmed" as const)
          : booking.status === "pending"
            ? ("held" as const)
            : ("failed" as const),
      upstream_payload: booking as unknown as Record<string, unknown>,
    }
  } catch (error) {
    // The request may have reached Connect. Releasing here could cancel the
    // capacity behind a successfully-created booking, so Catalog must retain
    // its supplier operation in doubt and reconcile by the stable write key.
    throw new ReservationDispatchError(
      message(error, "Voyant Connect package confirmation is in doubt"),
      "possibly_sent",
      "package_confirmation_in_doubt",
    )
  }
}

async function resolveExactOffer(
  client: VoyantConnectClient,
  ctx: SourceAdapterContext,
  request: ReserveRequest,
): Promise<PackageOffer | null> {
  const liveRequest: LiveResolveRequest = {
    ids: [request.entity_id],
    ...(request.source_ref ? { source_refs: { [request.entity_id]: request.source_ref } } : {}),
    scope: request.scope ?? { locale: "en", market: "default", audience: "customer" },
    parameters: withoutBookingQuote(request.parameters),
  }
  const result = await liveResolvePackage(client, ctx, liveRequest)
  if (result.failed?.[request.entity_id]) return null
  const value = recordValue(result.values[request.entity_id])
  return packageOffer(value?.offer)
}

async function liveResolvePackage(
  client: VoyantConnectClient,
  ctx: SourceAdapterContext,
  request: LiveResolveRequest,
) {
  const connectionId = requiredConnectionId(ctx)
  const parameters = request.parameters ?? {}
  const departureDate = stringValue(parameters.departureDate)
  if (!departureDate) return { values: {}, failed: missing(request.ids) }
  const pax = recordValue(recordValue(parameters.draft)?.configure)?.pax
  const paxRecord = recordValue(pax)
  const adults = integer(paxRecord?.adults) ?? integer(parameters.paxCount) ?? 2
  const children = integer(paxRecord?.children)
  const nights = integer(parameters.nights)
  const departureAirportCode = stringValue(parameters.departureAirportCode)
  if (
    !departureAirportCode ||
    nights === undefined ||
    (!stringValue(parameters.roomTypeId) &&
      !stringValue(parameters.ratePlanId) &&
      !stringValue(parameters.board))
  ) {
    return { values: {}, failed: missing(request.ids) }
  }
  const query: PackageSearchQuery = {
    departure: { airportCodes: [departureAirportCode] },
    accommodationIds: [...new Set(request.ids.map((id) => id.replace(/^[^:]+:/, "")))],
    departureDateFrom: departureDate,
    departureDateTo: departureDate,
    occupancy: { adults, ...(children !== undefined ? { children } : {}) },
    nights: { min: nights, max: nights },
    ...(request.scope.locale ? { locale: request.scope.locale } : {}),
    limit: 100,
  }
  const response = await client.packages.search(connectionId, query)
  const chosen = new Map<string, PackageOffer>()
  for (const offer of response.offers) {
    const id = offer.productRef.entityId
    if (!request.ids.includes(id) || offer.connectionId !== connectionId) continue
    const current = chosen.get(id)
    if (!current || (matchesPin(offer, parameters) && !matchesPin(current, parameters))) {
      chosen.set(id, offer)
    }
  }
  const values: Record<string, Record<string, unknown>> = {}
  for (const [id, offer] of chosen) {
    if (Date.parse(offer.expiresAt) <= Date.now()) continue
    values[id] = {
      available: true,
      offer: offer as unknown as Record<string, unknown>,
      priceCents: offer.pricing.total.amountMinor,
      currency: offer.pricing.total.currency,
      expires_at: offer.expiresAt,
      cancellationPolicy: offer.cancellationPolicy,
    }
  }
  const failed = missing(request.ids.filter((id) => !values[id]))
  return Object.keys(failed).length > 0 ? { values, failed } : { values }
}

function matchesPin(offer: PackageOffer, parameters: Record<string, unknown>): boolean {
  const roomTypeId = stringValue(parameters.roomTypeId)
  const ratePlanId = stringValue(parameters.ratePlanId)
  const board = stringValue(parameters.board)
  return (
    (!roomTypeId || offer.stay.roomTypeId === roomTypeId) &&
    (!ratePlanId || offer.stay.ratePlanId === ratePlanId) &&
    (!board || offer.stay.board === board)
  )
}

function missing(ids: readonly string[]): Record<string, "not_found"> {
  return Object.fromEntries(ids.map((id) => [id, "not_found"]))
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}

function packageConfirmInput(request: ReserveRequest, holdId: string): PackageConfirmInput | null {
  const travelers = Array.isArray(request.parameters.travelers)
    ? request.parameters.travelers.flatMap((value) => {
        const traveler = packageTraveler(value)
        return traveler ? [traveler] : []
      })
    : []
  const lead = packageTraveler(request.parameters.leadTraveler) ?? travelers[0]
  const partyContact = recordValue(request.party)?.contact
  const contact = recordValue(partyContact) ?? recordValue(request.parameters.contact)
  const email = stringValue(contact?.email)
  const phone = stringValue(contact?.phone)
  if (!lead || travelers.length === 0 || !email) return null
  return {
    holdId,
    leadTraveler: lead,
    travelers,
    contact: {
      email,
      ...(phone ? { phone } : {}),
    },
  }
}

function packageTraveler(value: unknown): Traveler | null {
  const row = recordValue(value)
  const firstName = stringValue(row?.firstName)
  const lastName = stringValue(row?.lastName)
  if (!firstName || !lastName) return null
  const category = row?.category
  return {
    category:
      category === "child" || category === "infant" || category === "senior" || category === "adult"
        ? category
        : "adult",
    firstName,
    lastName,
    ...(typeof row?.dateOfBirth === "string" ? { dateOfBirth: row.dateOfBirth } : {}),
    ...(typeof row?.isPrimary === "boolean" ? { isPrimary: row.isPrimary } : {}),
  }
}

function expectedPackagePrice(parameters: Record<string, unknown>): ExpectedPackagePrice | null {
  const quote = recordValue(parameters.bookingQuote)
  const currency = stringValue(quote?.currency)
  const totalAmountMinor = quote?.totalAmountMinor
  return currency && typeof totalAmountMinor === "number" && Number.isInteger(totalAmountMinor)
    ? { currency, totalAmountMinor }
    : null
}

function samePrice(offer: PackageOffer, expected: ExpectedPackagePrice): boolean {
  return (
    offer.pricing.total.currency === expected.currency &&
    offer.pricing.total.amountMinor === expected.totalAmountMinor
  )
}

function samePackageSelection(left: PackageOffer, right: PackageOffer): boolean {
  return (
    left.connectionId === right.connectionId &&
    left.productRef.entityId === right.productRef.entityId &&
    left.stay.ref.entityId === right.stay.ref.entityId &&
    left.stay.roomTypeId === right.stay.roomTypeId &&
    left.stay.ratePlanId === right.stay.ratePlanId &&
    left.stay.board === right.stay.board &&
    left.stay.checkIn === right.stay.checkIn &&
    left.stay.checkOut === right.stay.checkOut
  )
}

function packageOffer(value: unknown): PackageOffer | null {
  const row = recordValue(value)
  const pricing = recordValue(row?.pricing)
  const total = recordValue(pricing?.total)
  const productRef = recordValue(row?.productRef)
  const stay = recordValue(row?.stay)
  if (
    !stringValue(row?.id) ||
    !stringValue(row?.connectionId) ||
    !stringValue(productRef?.entityId) ||
    !stringValue(stay?.checkIn) ||
    !stringValue(stay?.checkOut) ||
    !stringValue(total?.currency) ||
    typeof total?.amountMinor !== "number"
  ) {
    return null
  }
  return value as PackageOffer
}

function withoutBookingQuote(parameters: Record<string, unknown>): Record<string, unknown> {
  const { bookingQuote: _bookingQuote, ...selection } = parameters
  return selection
}

async function releaseFailedHold(
  client: VoyantConnectClient,
  connectionId: string,
  holdId: string,
): Promise<void> {
  await client.packages.releaseLock(connectionId, holdId).catch(() => undefined)
}

function failedPackageResult(entityId: string, reason: string) {
  return {
    upstream_ref: `package-offer:${entityId}`,
    status: "failed" as const,
    upstream_payload: { reason },
  }
}

function requiredConnectionId(ctx: SourceAdapterContext): string {
  if (!ctx.connection_id || ctx.connection_id === "engine") {
    throw new ReservationDispatchError(
      "Voyant Connect package booking requires a server-resolved connection",
      "not_sent",
      "package_connection_unavailable",
    )
  }
  return ctx.connection_id
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
