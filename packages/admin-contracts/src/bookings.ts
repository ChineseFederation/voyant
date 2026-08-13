/**
 * Bookings admin operations (first slice: list, get, cancel).
 *
 * Input schemas derive from `@voyant-travel/bookings-contracts` (the canonical route
 * validation) so the SDK can't drift from the routes. Output schemas stay a
 * curated client-facing projection — loose where the field is a server-returned
 * status, for forward-compatibility (see ADR-0002 / ADR-0003).
 */

import { cancelBookingSchema } from "@voyant-travel/bookings-contracts"
import { z } from "zod"

import { defineOperation } from "./core/operation.js"
import { pageQuerySchema, paginated } from "./core/pagination.js"

export const bookingSummarySchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
  personId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  sellCurrency: z.string().nullable().optional(),
  sellAmountCents: z.number().int().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  pax: z.number().int().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingSummary = z.infer<typeof bookingSummarySchema>

export const bookingListInputSchema = pageQuerySchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
  productId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

// Re-use the canonical route validation from @voyant-travel/bookings-contracts so the
// SDK input matches what the cancel route accepts (which also allows a null
// note).
export const cancelBookingInputSchema = cancelBookingSchema

const list = defineOperation({
  id: "bookings.list",
  method: "GET",
  path: () => "/v1/admin/bookings",
  pathTemplate: "/v1/admin/bookings",
  input: bookingListInputSchema,
  output: paginated(bookingSummarySchema),
  classification: "read",
  scopes: ["bookings:read"],
  envelope: "raw",
  summary: "List bookings with filters and offset pagination.",
})

const get = defineOperation({
  id: "bookings.get",
  method: "GET",
  path: (p: { id: string }) => `/v1/admin/bookings/${p.id}`,
  pathTemplate: "/v1/admin/bookings/:id",
  input: z.object({}),
  output: bookingSummarySchema,
  classification: "read",
  scopes: ["bookings:read"],
  summary: "Get a single booking by id.",
})

const cancel = defineOperation({
  id: "bookings.cancel",
  method: "POST",
  path: (p: { id: string }) => `/v1/admin/bookings/${p.id}/cancel`,
  pathTemplate: "/v1/admin/bookings/:id/cancel",
  input: cancelBookingInputSchema,
  output: bookingSummarySchema,
  classification: "requires_confirmation",
  scopes: ["bookings:write"],
  capabilityKey: "@voyant-travel/bookings#action.cancel-booking",
  idempotent: true,
  summary: "Cancel a booking. May require approval (HTTP 202).",
})

export const bookingsOperations = { list, get, cancel } as const
