import { z } from "zod"

// --- departure summary ------------------------------------------------------
//
// Mirror of `GET /slots/{id}/summary` (see `service-departure-summary.ts` in
// @voyant-travel/operations). The workspace reads its headline from this ONE
// envelope: every counter is whole-departure, so paging the allocation
// manifest can never move a number here. Kept in sync with the server schema
// by intent — operations-react can't depend on the server package.

export const departureIssueSeveritySchema = z.enum(["critical", "warning"])
export type DepartureIssueSeverity = z.infer<typeof departureIssueSeveritySchema>

export const departureIssueSubjectTypeSchema = z.enum([
  "departure",
  "booking",
  "booking_allocation",
  "availability_hold",
  "allocation_resource",
])
export type DepartureIssueSubjectType = z.infer<typeof departureIssueSubjectTypeSchema>

/**
 * The stable issue codes the server evaluates today. The wire field stays a
 * plain string on purpose: a server one release ahead may emit a code this
 * client has no catalogue entry for, and dropping the row would hide a real
 * problem. Unknown codes render the server's English `message` fallback.
 */
export const departureIssueCodes = [
  "allocation_on_cancelled_booking",
  "allocation_resources_missing",
  "capacity_oversold",
  "departure_not_version_bound",
  "expired_hold_not_released",
  "remaining_pax_drift",
  "resource_over_capacity",
  "stale_held_allocation",
  "travelers_exceed_booked_pax",
  "travelers_missing_for_booked_pax",
  "travelers_unassigned",
] as const
export type DepartureIssueCode = (typeof departureIssueCodes)[number]

export const departureIssueSchema = z.object({
  code: z.string(),
  severity: departureIssueSeveritySchema,
  subjectType: departureIssueSubjectTypeSchema,
  subjectId: z.string(),
  count: z.number().int(),
  /** English fallback for consumers with no message catalogue. */
  message: z.string(),
})
export type DepartureIssue = z.infer<typeof departureIssueSchema>

const departureHoldCountersSchema = z.object({
  active: z.number().int(),
  activePax: z.number().int(),
  expired: z.number().int(),
  expiredPax: z.number().int(),
  released: z.number().int(),
  converted: z.number().int(),
})

const departureAllocationCountersSchema = z.object({
  held: z.number().int(),
  confirmed: z.number().int(),
  fulfilled: z.number().int(),
  staleHeld: z.number().int(),
  released: z.number().int(),
  expired: z.number().int(),
  cancelled: z.number().int(),
  active: z.number().int(),
  inactive: z.number().int(),
})

export const departureTravelerCountersSchema = z.object({
  entered: z.number().int(),
  lead: z.number().int(),
  assigned: z.number().int(),
  unassigned: z.number().int(),
  missing: z.number().int(),
})
export type DepartureTravelerCounters = z.infer<typeof departureTravelerCountersSchema>

export const departureResourceCountersSchema = z.object({
  total: z.number().int(),
  seating: z.number().int(),
  capacity: z.number().int(),
  assigned: z.number().int(),
  available: z.number().int(),
  overCapacity: z.number().int(),
})
export type DepartureResourceCounters = z.infer<typeof departureResourceCountersSchema>

export const departureResourceRowSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  parentId: z.string().nullable(),
  capacity: z.number().int(),
  assigned: z.number().int(),
  available: z.number().int(),
  flags: z.record(z.string(), z.unknown()),
  sortOrder: z.number().int(),
})
export type DepartureResourceRow = z.infer<typeof departureResourceRowSchema>

export const departureCapacityCountersSchema = z.object({
  slotId: z.string(),
  unlimited: z.boolean(),
  initialPax: z.number().int().nullable(),
  effectivePax: z.number().int().nullable(),
  remainingPax: z.number().int().nullable(),
  derivedRemainingPax: z.number().int().nullable(),
  derivedConsumedPax: z.number().int(),
  holds: departureHoldCountersSchema,
  allocations: departureAllocationCountersSchema,
  bookings: z.object({
    active: z.number().int(),
    cancelledWithLiveAllocation: z.number().int(),
    expectedPax: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
  travelers: departureTravelerCountersSchema,
  resources: departureResourceCountersSchema,
  resourceBreakdown: z.array(departureResourceRowSchema),
})
export type DepartureCapacityCounters = z.infer<typeof departureCapacityCountersSchema>

export const departureFinanceLineSchema = z.object({
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})
export type DepartureFinanceLine = z.infer<typeof departureFinanceLineSchema>

export const departureFinanceHeadlineSchema = z.object({
  perCurrency: z.array(departureFinanceLineSchema),
  base: departureFinanceLineSchema.nullable(),
  unconvertibleCurrencies: z.array(z.string()),
})
export type DepartureFinanceHeadline = z.infer<typeof departureFinanceHeadlineSchema>

export const departureExtrasRollupSchema = z.object({
  offered: z.number().int(),
  withSelections: z.number().int(),
  selectedTravelerCount: z.number().int(),
  totalQuantity: z.number().int(),
  outstandingCollectionCount: z.number().int(),
  fulfilledExtraCount: z.number().int(),
})
export type DepartureExtrasRollup = z.infer<typeof departureExtrasRollupSchema>

export const departureSummarySchema = z.object({
  departure: z.object({
    id: z.string(),
    productId: z.string(),
    productVersionId: z.string().nullable(),
    itineraryId: z.string().nullable(),
    optionId: z.string().nullable(),
    facilityId: z.string().nullable(),
    status: z.enum(["open", "closed", "sold_out", "cancelled"]),
    dateLocal: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    timezone: z.string(),
    notes: z.string().nullable(),
  }),
  capacity: departureCapacityCountersSchema,
  bookings: z.object({
    count: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
    expectedPax: z.number().int(),
    /** `null` when the departure's bookings disagree on currency. */
    currency: z.string().nullable(),
    soldAmountCents: z.number().int().nullable(),
    paidAmountCents: z.number().int().nullable(),
    outstandingAmountCents: z.number().int().nullable(),
  }),
  travelers: departureTravelerCountersSchema,
  allocation: departureResourceCountersSchema,
  operations: z.object({
    issues: z.array(departureIssueSchema),
    criticalCount: z.number().int(),
    warningCount: z.number().int(),
    clear: z.boolean(),
  }),
  /** `null` when the Extras module is not deployed or the read failed. */
  extras: departureExtrasRollupSchema.nullable(),
  /** `null` when no Finance provider is bound in this deployment. */
  finance: departureFinanceHeadlineSchema.nullable(),
})
export type DepartureSummary = z.infer<typeof departureSummarySchema>

// Envelope declared inline rather than through `singleEnvelope`: `schemas.ts`
// re-exports this module, and importing back into it would make the two
// evaluate in a cycle.
export const departureSummaryResponse = z.object({ data: departureSummarySchema })
