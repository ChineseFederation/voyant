import { submitBookingReservationPlan } from "@voyant-travel/bookings/reservation-plans"
import type { Context } from "hono"

import type { CatalogComponentAdapter } from "./catalog-component.js"
import { previewCancellation } from "./catalog-component.js"
import { startTripCheckout } from "./checkout/start-checkout.js"
import type { TripCheckoutDeps } from "./checkout/types.js"
import type { FlightComponentAdapterApi } from "./flight-component.js"
import { previewFlightCancellation } from "./flight-component.js"
import type { TripsRoutesOptions, TripsRoutesOptionsProvider } from "./routes.js"
import type {
  CancelTripComponentsDeps,
  PriceTripDeps,
  ReserveTripDeps,
  StartCheckoutDeps,
} from "./service.js"
import type { ComponentCheckoutResult } from "./service-types.js"

export interface TripsRouteRuntimeHost {
  createCatalogAdapter(c: Context): CatalogComponentAdapter
  createFlightAdapter(c: Context): FlightComponentAdapterApi
  createCheckoutDeps(c: Context): TripCheckoutDeps
}

export interface TripsRouteRuntime {
  createRoutesOptions: TripsRoutesOptionsProvider
  createPriceDeps(c: Context): PriceTripDeps
  createReserveDeps(c: Context): ReserveTripDeps
  createStartCheckoutDeps(c: Context): StartCheckoutDeps
  createCancelDeps(c: Context): CancelTripComponentsDeps
}

/** Trips-owned lifecycle composition with only request-scoped host adapters injected. */
export function createTripsRouteRuntime(host: TripsRouteRuntimeHost): TripsRouteRuntime {
  const createPriceDeps = (c: Context): PriceTripDeps => ({
    quoteCatalogComponent: (input) => host.createCatalogAdapter(c).quote(input),
  })

  const createReserveDeps = (c: Context): ReserveTripDeps => ({
    quoteCatalogComponentBeforeReserve: (input) => host.createCatalogAdapter(c).quote(input),
    validateNonCatalogComponentBeforeReserve: (input) =>
      host.createFlightAdapter(c).validateBeforeReserve(input),
    submitReservationPlan: async (input) => {
      const submitted = await submitBookingReservationPlan(
        {
          reservationPlanId: input.reservationPlan.id,
          idempotencyKey: input.idempotencyKey,
          origin: { source: "trips", tripEnvelopeId: input.envelope.id },
          envelope: input.envelope,
          lines: input.components.map((component) => ({
            planLineId: component.componentId,
            componentId: component.componentId,
            kind: component.reservationKind,
            line: component.component,
          })),
        },
        {
          reserveCatalogBackedLine: ({ plan, line }) =>
            host.createCatalogAdapter(c).reserve({
              envelope: plan.envelope,
              component: line.line,
              reservationPlanId: plan.reservationPlanId,
            }),
          reserveNonCatalogLine: ({ plan, line }) =>
            host.createFlightAdapter(c).reserve({
              envelope: plan.envelope,
              component: line.line,
              reservationPlanId: plan.reservationPlanId,
            }),
          releaseReservedLine: ({ line, result }) =>
            line.kind === "catalog_backed"
              ? host.createCatalogAdapter(c).release({
                  component: line.line,
                  reserveResult: result,
                })
              : Promise.resolve({ released: false, reason: "release_not_configured" }),
        },
      )

      return {
        reservationPlanId: submitted.reservationPlanId,
        status: submitted.status,
        reserved: submitted.reserved.map((item) => ({
          componentId: item.componentId,
          status: item.status,
          result: item.result,
        })),
        failures: submitted.failures,
        compensations: submitted.compensations,
        warnings: submitted.warnings,
      }
    },
  })

  const createStartCheckoutDeps = (c: Context): StartCheckoutDeps => ({
    startTripCheckout: (input) => startTripCheckout(host.createCheckoutDeps(c), input),
    startComponentCheckout: (input) => host.createCatalogAdapter(c).startCheckout(input),
  })

  const createCancelDeps = (c: Context): CancelTripComponentsDeps => ({
    previewComponentCancellation: (input) =>
      input.component.kind === "flight_placeholder"
        ? previewFlightCancellation(input)
        : previewCancellation(input),
    cancelComponent: (input) =>
      input.component.kind === "flight_placeholder"
        ? host.createFlightAdapter(c).cancel(input)
        : host.createCatalogAdapter(c).cancel(input),
  })

  const createRoutesOptions = (): TripsRoutesOptions => ({
    priceTripDeps: (c) => createPriceDeps(c),
    reserveTripDeps: (c) => createReserveDeps(c),
    startCheckoutDeps: (c) => createStartCheckoutDeps(c),
    cancelTripComponentsDeps: (c) => createCancelDeps(c),
  })

  return {
    createRoutesOptions,
    createPriceDeps,
    createReserveDeps,
    createStartCheckoutDeps,
    createCancelDeps,
  }
}

export type CatalogCheckoutResult =
  | {
      kind: "card_redirect"
      bookingId: string
      paymentSessionId: string
      redirectUrl: string | null
    }
  | {
      kind: "bank_transfer_instructions"
      bookingId: string
      paymentSessionId?: string | null
      instructions: NonNullable<ComponentCheckoutResult["bankTransferInstructions"]>
    }

/** Map Commerce checkout outcomes to the Trips component contract. */
export function catalogCheckoutResultToComponentResult(
  result: CatalogCheckoutResult,
): ComponentCheckoutResult {
  switch (result.kind) {
    case "card_redirect":
      return {
        kind: "card_redirect",
        bookingId: result.bookingId,
        paymentSessionId: result.paymentSessionId,
        checkoutUrl: result.redirectUrl,
      }
    case "bank_transfer_instructions":
      return {
        kind: "bank_transfer_instructions",
        bookingId: result.bookingId,
        paymentSessionId: result.paymentSessionId ?? undefined,
        bankTransferInstructions: result.instructions,
      }
  }
}
