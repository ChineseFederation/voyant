import type { Context } from "hono"

import type { CatalogComponentAdapter } from "./catalog-component.js"
import { previewCancellation } from "./catalog-component.js"
import { startTripCheckout } from "./checkout/start-checkout.js"
import type { TripCheckoutDeps } from "./checkout/types.js"
import type { FlightComponentAdapterApi } from "./flight-component.js"
import { previewFlightCancellation } from "./flight-component.js"
import type { TripsRoutesOptions, TripsRoutesOptionsProvider } from "./routes.js"
import type { CancelTripComponentsDeps, StartCheckoutDeps } from "./service.js"
import type { ComponentCheckoutResult } from "./service-types.js"

export interface TripsRouteRuntimeHost {
  createCatalogAdapter(c: Context): CatalogComponentAdapter
  createFlightAdapter(c: Context): FlightComponentAdapterApi
  createCheckoutDeps(c: Context): TripCheckoutDeps
}

export interface TripsRouteRuntime {
  createRoutesOptions: TripsRoutesOptionsProvider
  createStartCheckoutDeps(c: Context): StartCheckoutDeps
  createCancelDeps(c: Context): CancelTripComponentsDeps
}

/** Trips-owned lifecycle composition with only request-scoped host adapters injected. */
export function createTripsRouteRuntime(host: TripsRouteRuntimeHost): TripsRouteRuntime {
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
    startCheckoutDeps: (c) => createStartCheckoutDeps(c),
    cancelTripComponentsDeps: (c) => createCancelDeps(c),
  })

  return { createRoutesOptions, createStartCheckoutDeps, createCancelDeps }
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
  | { kind: "inquiry_received"; bookingId: string; inquiryId: string }
  | { kind: "hold_placed"; bookingId: string }

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
    case "inquiry_received":
      return {
        kind: "inquiry_received",
        bookingId: result.bookingId,
        providerRef: result.inquiryId,
      }
    case "hold_placed":
      return { kind: "hold_placed", bookingId: result.bookingId }
  }
}
