/**
 * Wire contracts for the public Trip-selection surface.
 *
 * These moved here from `@voyant-travel/public-api`'s shopping module
 * (voyant#4627). Shopping is the NDC *shopping* phase — a read-only,
 * stateless query — and a Trip selection is order-phase state: it is created,
 * revised under a compare-and-swap, and booked. It belongs with the module that
 * owns Trips, checkout and the booking-session composite handler.
 *
 * What deliberately did NOT move is the scope vocabulary. `marketId`, `locale`
 * and `currency` are resolved by the shopping layer from the channel, and a
 * selection is only meaningful inside a scope shopping already resolved — so
 * those schemas stay there and are imported here.
 */
import { bookingSessionOutcomeV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import {
  publicApiOpaqueRefSchema as opaqueRefSchema,
  publicApiRequestedScopeSchema,
  publicApiResolvedScopeSchema,
} from "@voyant-travel/public-api/shopping"
import { z } from "zod"

const tripOfferSelectionSchema = z
  .object({
    kind: z.enum(["product", "flight", "stay", "package", "cruise"]),
    offerRef: opaqueRefSchema,
    quantity: z.number().int().min(1).max(99).optional(),
  })
  .strict()

export const publicApiTripSelectionCreateSchema = z
  .object({
    scope: publicApiRequestedScopeSchema,
    offers: z.array(tripOfferSelectionSchema).min(1).max(100),
  })
  .strict()

const tripSelectionMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), offer: tripOfferSelectionSchema }).strict(),
  z.object({ kind: z.literal("remove"), itemRef: opaqueRefSchema }).strict(),
  z
    .object({ kind: z.literal("reorder"), itemRefs: z.array(opaqueRefSchema).min(1).max(100) })
    .strict(),
])

export const publicApiTripSelectionUpdateSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    expectedRevision: z.number().int().min(0),
    mutation: tripSelectionMutationSchema,
  })
  .strict()

const tripSelectionItemSchema = z
  .object({
    itemRef: opaqueRefSchema,
    kind: z.enum(["product", "flight", "stay", "package", "cruise"]),
    quantity: z.number().int().min(1),
  })
  .strict()

export const publicApiTripSelectionSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    revision: z.number().int().min(0),
    scope: publicApiResolvedScopeSchema,
    items: z.array(tripSelectionItemSchema).max(100),
  })
  .strict()

export const publicApiTripBookingCreateSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    expectedRevision: z.number().int().min(0),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict()

export const publicApiTripBookingSchema = z
  .object({
    bookingSessionCapability: z
      .string()
      .regex(/^bcap_[A-Za-z0-9_-]{43,}$/)
      .optional(),
    outcome: bookingSessionOutcomeV1,
  })
  .strict()

export type PublicApiTripSelectionCreate = z.infer<typeof publicApiTripSelectionCreateSchema>
export type PublicApiTripSelectionUpdate = z.infer<typeof publicApiTripSelectionUpdateSchema>
export type PublicApiTripSelection = z.infer<typeof publicApiTripSelectionSchema>
export type PublicApiTripBookingCreate = z.infer<typeof publicApiTripBookingCreateSchema>
export type PublicApiTripBooking = z.infer<typeof publicApiTripBookingSchema>
