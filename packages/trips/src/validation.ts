import { z } from "zod"

export const tripEnvelopeStatusSchema = z.enum([
  "draft",
  "priced",
  "reserve_in_progress",
  "reserved",
  "checkout_started",
  "booked",
  "failed",
  "cancelled",
])

export type TripEnvelopeStatus = z.infer<typeof tripEnvelopeStatusSchema>

export const tripComponentKindSchema = z.enum([
  "catalog_booking",
  "manual_placeholder",
  "flight_placeholder",
  "flight_order",
  "external_order",
])

export type TripComponentKind = z.infer<typeof tripComponentKindSchema>

export const tripComponentStatusSchema = z.enum([
  "draft",
  "priced",
  "unavailable",
  "held",
  "booked",
  "checkout_started",
  "failed",
  "cancelled",
  "removed",
])

export type TripComponentStatus = z.infer<typeof tripComponentStatusSchema>

export const tripComponentEventTypeSchema = z.enum([
  "created",
  "updated",
  "priced",
  "hold_placed",
  "booked",
  "checkout_started",
  "failed",
  "cancelled",
  "removed",
  "staff_remediation_required",
])

export type TripComponentEventType = z.infer<typeof tripComponentEventTypeSchema>

export const tripComponentTaxLineSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  amountCents: z.number().int(),
  baseAmountCents: z.number().int(),
  rate: z.number().nonnegative().optional(),
  jurisdiction: z.string().min(1).optional(),
  includedInPrice: z.boolean().optional(),
  source: z.string().min(1).optional(),
})

export type TripComponentTaxLine = z.infer<typeof tripComponentTaxLineSchema>

export const tripComponentPricingSnapshotSchema = z.object({
  currency: z.string().length(3),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  priceExpiresAt: z.string().datetime().optional(),
  warnings: z.array(z.string()).optional(),
})

export type TripComponentPricingSnapshot = z.infer<typeof tripComponentPricingSnapshotSchema>

export const tripEnvelopePricingSnapshotSchema = z.object({
  currency: z.string().length(3),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  componentCount: z.number().int().nonnegative(),
  pricedComponentCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()).optional(),
})

export type TripEnvelopePricingSnapshot = z.infer<typeof tripEnvelopePricingSnapshotSchema>

export const catalogComponentReferenceSchema = z.object({
  entityModule: z.string().min(1),
  entityId: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceConnectionId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
})

export type CatalogComponentReference = z.infer<typeof catalogComponentReferenceSchema>

export const committedComponentReferenceSchema = z.object({
  bookingId: z.string().min(1).optional(),
  bookingGroupId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  paymentSessionId: z.string().min(1).optional(),
  providerRef: z.string().min(1).optional(),
  supplierRef: z.string().min(1).optional(),
})

export type CommittedComponentReference = z.infer<typeof committedComponentReferenceSchema>

export const createTripEnvelopeSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  travelerParty: z.record(z.string(), z.unknown()).default({}),
  constraints: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().min(1).optional(),
})

export type CreateTripEnvelopeInput = z.infer<typeof createTripEnvelopeSchema>

export const tripsListSortFieldSchema = z.enum(["updatedAt", "createdAt", "status", "total"])
export type TripsListSortField = z.infer<typeof tripsListSortFieldSchema>

export const tripsListSortDirSchema = z.enum(["asc", "desc"])
export type TripsListSortDir = z.infer<typeof tripsListSortDirSchema>

export const listTripsQuerySchema = z.object({
  status: tripEnvelopeStatusSchema.optional(),
  search: z.string().trim().min(1).max(255).optional(),
  // Component-driven filters. Match trips that contain *at least one*
  // non-removed component referencing the given entity / vertical.
  productId: z.string().trim().min(1).max(255).optional(),
  accommodationId: z.string().trim().min(1).max(255).optional(),
  cruiseId: z.string().trim().min(1).max(255).optional(),
  hasFlight: z.coerce.boolean().optional(),
  // Envelope-level numeric / temporal filters.
  totalMinCents: z.coerce.number().int().nonnegative().optional(),
  totalMaxCents: z.coerce.number().int().nonnegative().optional(),
  createdFrom: z.string().trim().min(1).max(35).optional(),
  createdTo: z.string().trim().min(1).max(35).optional(),
  sortBy: tripsListSortFieldSchema.default("updatedAt"),
  sortDir: tripsListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListTripsQuery = z.infer<typeof listTripsQuerySchema>

export const tripSnapshotProposalLineSchema = z.object({
  componentId: z.string().min(1),
  sequence: z.number().int().min(0),
  kind: tripComponentKindSchema,
  status: tripComponentStatusSchema,
  title: z.string().nullable(),
  description: z.string().min(1),
  entityModule: z.string().nullable(),
  entityId: z.string().nullable(),
  sourceKind: z.string().nullable(),
  currency: z.string().length(3),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  priceExpiresAt: z.string().datetime().nullable(),
  warnings: z.array(z.string()),
})

export type TripSnapshotProposalLine = z.infer<typeof tripSnapshotProposalLineSchema>

export const tripSnapshotProposalSchema = z.object({
  envelopeId: z.string().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  currency: z.string().length(3),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  componentCount: z.number().int().nonnegative(),
  pricedComponentCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  frozenAt: z.string().datetime(),
  lines: z.array(tripSnapshotProposalLineSchema),
})

export type TripSnapshotProposal = z.infer<typeof tripSnapshotProposalSchema>

export const createTripSnapshotSchema = z.object({
  envelopeId: z.string().min(1),
  createdBy: z.string().min(1).nullable().optional(),
})

export type CreateTripSnapshotInput = z.infer<typeof createTripSnapshotSchema>

export const updateTripEnvelopeSchema = z.object({
  title: z.string().min(1).max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  travelerParty: z.record(z.string(), z.unknown()).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  status: tripEnvelopeStatusSchema.optional(),
  updatedBy: z.string().min(1).nullable().optional(),
})

export type UpdateTripEnvelopeInput = z.infer<typeof updateTripEnvelopeSchema>

const createTripComponentBaseSchema = z
  .object({
    envelopeId: z.string().min(1),
    sequence: z.number().int().min(0).default(0),
    kind: tripComponentKindSchema,
    description: z.string().optional(),
    catalogRef: catalogComponentReferenceSchema.optional(),
    estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

const createTripComponentBodyBaseSchema = createTripComponentBaseSchema.omit({ envelopeId: true })

function requireManualServiceName(
  component:
    | z.infer<typeof createTripComponentBaseSchema>
    | z.infer<typeof createTripComponentBodyBaseSchema>,
  ctx: z.RefinementCtx,
) {
  const metadata = component.metadata as {
    manualService?: { name?: unknown }
    template?: unknown
  }
  if (component.kind !== "manual_placeholder" || metadata.template !== "manual") return
  const name = metadata.manualService?.name
  if (typeof name !== "string" || name.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metadata", "manualService", "name"],
      message: "Manual services require metadata.manualService.name",
    })
  }
}

function requireAccommodationDateRange(
  component:
    | z.infer<typeof createTripComponentBaseSchema>
    | z.infer<typeof createTripComponentBodyBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (
    component.kind !== "catalog_booking" ||
    component.catalogRef?.entityModule !== "accommodations"
  ) {
    return
  }

  const metadata = component.metadata as Record<string, unknown>
  const bookingDraft = readRecord(metadata.bookingDraftV1) ?? readRecord(metadata.bookingDraft)
  const configure = readRecord(bookingDraft?.configure)
  const dateRange = readRecord(configure?.dateRange)
  const checkIn = typeof dateRange?.checkIn === "string" ? dateRange.checkIn : undefined
  const checkOut = typeof dateRange?.checkOut === "string" ? dateRange.checkOut : undefined

  if (!validIsoDateRange(checkIn, checkOut)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metadata", "bookingDraftV1", "configure", "dateRange"],
      message:
        "Accommodation trip components require metadata.bookingDraftV1.configure.dateRange.checkIn/checkOut with checkOut after checkIn",
    })
  }
}

function requireTripComponentDetails(
  component:
    | z.infer<typeof createTripComponentBaseSchema>
    | z.infer<typeof createTripComponentBodyBaseSchema>,
  ctx: z.RefinementCtx,
) {
  requireManualServiceName(component, ctx)
  requireAccommodationDateRange(component, ctx)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function validIsoDateRange(checkIn: string | undefined, checkOut: string | undefined): boolean {
  const start = isoDateMs(checkIn)
  const end = isoDateMs(checkOut)
  return start !== null && end !== null && end > start
}

function isoDateMs(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null
}

export const createTripComponentSchema = createTripComponentBaseSchema.superRefine(
  requireTripComponentDetails,
)

export type CreateTripComponentInput = z.infer<typeof createTripComponentSchema>

export const createTripComponentBodySchema = createTripComponentBodyBaseSchema.superRefine(
  requireTripComponentDetails,
)

export type CreateTripComponentBodyInput = z.infer<typeof createTripComponentBodySchema>

export const updateTripComponentSchema = z.object({
  sequence: z.number().int().min(0).optional(),
  status: tripComponentStatusSchema.optional(),
  description: z.string().nullable().optional(),
  catalogRef: catalogComponentReferenceSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  warningCodes: z.array(z.string().min(1)).optional(),
})

export type UpdateTripComponentInput = z.infer<typeof updateTripComponentSchema>

export const reorderTripComponentsSchema = z.object({
  envelopeId: z.string().min(1),
  componentIds: z.array(z.string().min(1)).min(1),
})

export type ReorderTripComponentsInput = z.infer<typeof reorderTripComponentsSchema>

export const updateTripComponentRefsSchema = z.object({
  bookingDraftId: z.string().min(1).optional(),
  catalogQuoteId: z.string().min(1).optional(),
  committedRef: committedComponentReferenceSchema.optional(),
})

export type UpdateTripComponentRefsInput = z.infer<typeof updateTripComponentRefsSchema>

export const priceTripSchema = z.object({
  envelopeId: z.string().min(1),
  scope: z.object({
    locale: z.string().min(1),
    audience: z.enum(["staff", "customer", "partner", "supplier"]),
    market: z.string().min(1),
    currency: z.string().length(3).optional(),
  }),
  ttlMs: z.number().int().positive().optional(),
})

export type PriceTripInput = z.infer<typeof priceTripSchema>

export const reserveTripSchema = z.object({
  envelopeId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(255).optional(),
  refreshScope: priceTripSchema.shape.scope.optional(),
})

export type ReserveTripInput = z.infer<typeof reserveTripSchema>

// ── Dynamic packaging: requirements + candidates (RFC #2082) ──

/** Search scope supplied to the durable sourcing command (reuses the price scope). */
export const availabilitySearchScopeSchema = priceTripSchema.shape.scope

export const addRequirementSchema = z.object({
  envelopeId: z.string().min(1),
  vertical: z.string().min(1),
  criteria: z.record(z.string(), z.unknown()).default({}),
  criteriaVersion: z.string().min(1),
  sequence: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type AddRequirementBody = z.infer<typeof addRequirementSchema>

export const sourceRequirementCandidatesSchema = z.object({
  requirementId: z.string().min(1),
  scope: availabilitySearchScopeSchema,
  deadlineMs: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
})

export type SourceRequirementCandidatesBody = z.infer<typeof sourceRequirementCandidatesSchema>

export const getRequirementSourcingOperationSchema = z.object({
  operationId: z.string().min(1),
  requirementId: z.string().min(1),
})

export type GetRequirementSourcingOperationInput = z.infer<
  typeof getRequirementSourcingOperationSchema
>

export const selectCandidateSchema = z.object({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
})

export type SelectCandidateBody = z.infer<typeof selectCandidateSchema>

export const startTripCheckoutSchema = z.object({
  envelopeId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(255).optional(),
  intent: z.enum(["card", "bank_transfer"]).default("card"),
  request: z.record(z.string(), z.unknown()).default({}),
})

export type StartTripCheckoutInput = z.infer<typeof startTripCheckoutSchema>

export const previewTripCancellationSchema = z.object({
  envelopeId: z.string().min(1),
  componentIds: z.array(z.string().min(1)).min(1).optional(),
  reason: z.string().min(1).max(500).optional(),
  requestedAt: z.string().datetime().optional(),
  request: z.record(z.string(), z.unknown()).default({}),
})

export type PreviewTripCancellationInput = z.infer<typeof previewTripCancellationSchema>

export const cancelTripComponentsSchema = previewTripCancellationSchema.extend({
  idempotencyKey: z.string().min(1).max(255).optional(),
})

export type CancelTripComponentsInput = z.infer<typeof cancelTripComponentsSchema>

const allowedTripComponentStatusTransitions = {
  draft: ["priced", "unavailable", "failed", "cancelled", "removed"],
  priced: ["priced", "unavailable", "held", "booked", "failed", "cancelled", "removed"],
  unavailable: ["draft", "priced", "failed", "cancelled", "removed"],
  held: ["booked", "checkout_started", "failed", "cancelled"],
  booked: ["checkout_started", "cancelled"],
  checkout_started: ["booked", "failed", "cancelled"],
  failed: ["draft", "priced", "removed"],
  cancelled: [],
  removed: [],
} as const satisfies Record<TripComponentStatus, readonly TripComponentStatus[]>

export function isAllowedTripComponentStatusTransition(
  from: TripComponentStatus,
  to: TripComponentStatus,
): boolean {
  return (
    from === to ||
    (allowedTripComponentStatusTransitions[from] as readonly TripComponentStatus[]).includes(to)
  )
}

export const tripComponentStatusTransitionSchema = z
  .object({
    from: tripComponentStatusSchema,
    to: tripComponentStatusSchema,
  })
  .refine(({ from, to }) => isAllowedTripComponentStatusTransition(from, to), {
    message: "Invalid trip component status transition",
    path: ["to"],
  })

export type TripComponentStatusTransition = z.infer<typeof tripComponentStatusTransitionSchema>

export function isTerminalTripComponentStatus(status: TripComponentStatus): boolean {
  return status === "cancelled" || status === "removed"
}

export const tripsStatusSchema = z.object({
  module: z.literal("trips"),
  status: z.literal("scaffolded"),
})

export type TripsStatus = z.infer<typeof tripsStatusSchema>

export const tripsHealthCheckSchema = tripsStatusSchema

export type TripsHealthCheck = z.infer<typeof tripsHealthCheckSchema>
