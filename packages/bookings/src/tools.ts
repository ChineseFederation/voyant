// agent-quality: file-size exception -- owner: bookings; the package Tool registry stays centralized so definitions, admission policies, and output schemas remain one public surface.
/**
 * Bookings agent tools on the framework tool contract. Thin wrappers over the
 * existing bookings service; the service is injected on the tool context
 * by intersection so this module stays deployment-agnostic.
 *
 * `list_bookings` / `get_booking` return non-PII booking state (`bookings:read`).
 * PII fields are a separate concern gated on `bookings-pii:read` (see the booking
 * PII surface) and are not exposed here.
 * `cancel_booking` always uses an action-ledger approval before execution.
 */

import {
  acceptBookingAmendmentSchema,
  applyBookingAmendmentSchema,
  bookingAmendmentApplyResultSchema,
  bookingAmendmentPreviewResultSchema,
  bookingAmendmentSchema,
  previewTravelerCorrectionSchema,
  previewTravelerRosterChangeSchema,
} from "@voyant-travel/bookings-contracts"
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  bulkSetSlotExtraSelectionsTool as bulkSetSlotExtraSelectionsDefinition,
  bulkUpdateSlotExtraCollectionsTool as bulkUpdateSlotExtraCollectionsDefinition,
  createBookingExtraTool as createBookingExtraDefinition,
  getBookingExtraTool as getBookingExtraDefinition,
  getSlotExtraManifestTool as getSlotExtraManifestDefinition,
  listBookingExtrasTool as listBookingExtrasDefinition,
  setSlotExtraSelectionTool as setSlotExtraSelectionDefinition,
  updateBookingExtraTool as updateBookingExtraDefinition,
} from "./extras/tools.js"
import {
  createBookingAnswerTool as createBookingAnswerDefinition,
  createBookingQuestionExtraTriggerTool as createBookingQuestionExtraTriggerDefinition,
  createBookingQuestionOptionTool as createBookingQuestionOptionDefinition,
  createBookingQuestionOptionTriggerTool as createBookingQuestionOptionTriggerDefinition,
  createBookingQuestionUnitTriggerTool as createBookingQuestionUnitTriggerDefinition,
  createOptionBookingQuestionTool as createOptionBookingQuestionDefinition,
  createProductBookingQuestionTool as createProductBookingQuestionDefinition,
  createProductContactRequirementTool as createProductContactRequirementDefinition,
  getBookingAnswerTool as getBookingAnswerDefinition,
  getBookingQuestionExtraTriggerTool as getBookingQuestionExtraTriggerDefinition,
  getBookingQuestionOptionTool as getBookingQuestionOptionDefinition,
  getBookingQuestionOptionTriggerTool as getBookingQuestionOptionTriggerDefinition,
  getBookingQuestionUnitTriggerTool as getBookingQuestionUnitTriggerDefinition,
  getOptionBookingQuestionTool as getOptionBookingQuestionDefinition,
  getProductBookingQuestionTool as getProductBookingQuestionDefinition,
  getProductContactRequirementTool as getProductContactRequirementDefinition,
  getPublicTransportRequirementsTool as getPublicTransportRequirementsDefinition,
  listBookingAnswersTool as listBookingAnswersDefinition,
  listBookingQuestionExtraTriggersTool as listBookingQuestionExtraTriggersDefinition,
  listBookingQuestionOptionsTool as listBookingQuestionOptionsDefinition,
  listBookingQuestionOptionTriggersTool as listBookingQuestionOptionTriggersDefinition,
  listBookingQuestionUnitTriggersTool as listBookingQuestionUnitTriggersDefinition,
  listOptionBookingQuestionsTool as listOptionBookingQuestionsDefinition,
  listProductBookingQuestionsTool as listProductBookingQuestionsDefinition,
  listProductContactRequirementsTool as listProductContactRequirementsDefinition,
  updateBookingAnswerTool as updateBookingAnswerDefinition,
  updateBookingQuestionExtraTriggerTool as updateBookingQuestionExtraTriggerDefinition,
  updateBookingQuestionOptionTool as updateBookingQuestionOptionDefinition,
  updateBookingQuestionOptionTriggerTool as updateBookingQuestionOptionTriggerDefinition,
  updateBookingQuestionUnitTriggerTool as updateBookingQuestionUnitTriggerDefinition,
  updateOptionBookingQuestionTool as updateOptionBookingQuestionDefinition,
  updateProductBookingQuestionTool as updateProductBookingQuestionDefinition,
  updateProductContactRequirementTool as updateProductContactRequirementDefinition,
} from "./requirements/tools.js"
import { bookingToolDetailSchema, bookingToolSchema } from "./tool-output-schemas.js"
import { bookingListQuerySchema } from "./validation.js"

export interface BookingsToolServices {
  listBookings(query: z.infer<typeof bookingListQuerySchema>): Promise<unknown>
  getBookingById(id: string): Promise<unknown>
  getBookingByNumber(bookingNumber: string): Promise<unknown>
  getBookingAggregates(query: {
    from?: string
    to?: string
    upcomingLimit?: number
  }): Promise<unknown>
  cancelBooking(
    input: z.infer<typeof cancelBookingToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  previewTravelerCorrectionAmendment(
    input: z.infer<typeof previewTravelerCorrectionAmendmentToolInputSchema>,
  ): Promise<unknown>
  previewTravelerRosterChangeAmendment(
    input: z.infer<typeof previewTravelerRosterChangeAmendmentToolInputSchema>,
  ): Promise<unknown>
  acceptBookingAmendment(
    input: z.infer<typeof acceptBookingAmendmentToolInputSchema>,
  ): Promise<unknown>
  applyBookingAmendment(
    input: z.infer<typeof applyBookingAmendmentToolInputSchema>,
  ): Promise<unknown>
  reconcileBookingAmendment(
    input: z.infer<typeof reconcileBookingAmendmentToolInputSchema>,
  ): Promise<unknown>
}

export type BookingsToolContext = ToolContext & { bookings?: BookingsToolServices }

function bookings(ctx: BookingsToolContext): BookingsToolServices {
  return requireService(ctx.bookings, "bookings")
}

export const listBookingsTool = defineTool<
  z.infer<typeof bookingListQuerySchema>,
  unknown,
  BookingsToolContext
>({
  name: "list_bookings",
  description: "List bookings with filters and pagination. Non-PII state only. Read-only.",
  inputSchema: bookingListQuerySchema,
  outputSchema: listResponseSchema(bookingToolSchema),
  requiredScopes: ["bookings:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(query, ctx) {
    return parseJsonResult(
      listResponseSchema(bookingToolSchema),
      await bookings(ctx).listBookings(query),
    )
  },
})

const getBookingArgs = z.object({
  id: z
    .string()
    .min(1)
    .optional()
    .describe("The booking id (book_…). Provide this or bookingNumber."),
  bookingNumber: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The unique human-readable booking reference (e.g. B-1001). Accepted as an alternative to id.",
    ),
})

export const getBookingTool = defineTool<
  z.infer<typeof getBookingArgs>,
  unknown,
  BookingsToolContext
>({
  name: "get_booking",
  description:
    "Read a single booking's non-PII state by id or by its human-readable booking reference. Read-only.",
  inputSchema: getBookingArgs,
  outputSchema: bookingToolDetailSchema.nullable(),
  requiredScopes: ["bookings:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id, bookingNumber }, ctx) {
    const service = bookings(ctx)
    if (!id && !bookingNumber) {
      throw new ToolError("Provide either id or bookingNumber.", "INVALID_INPUT")
    }
    const row = id
      ? await service.getBookingById(id)
      : await service.getBookingByNumber(bookingNumber as string)
    return parseJsonResult(bookingToolDetailSchema.nullable(), row)
  },
})

export const cancelBookingToolInputSchema = z.object({
  id: z.string().min(1).describe("The booking id to cancel."),
  note: z.string().trim().min(1).optional().describe("Reason recorded on the cancellation."),
  suppressNotifications: z
    .boolean()
    .optional()
    .describe("Keep customer email and SMS suppressed for this booking lifecycle."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .describe("Stable key used when requesting approval and replaying the command."),
})

const completedCancelledBookingActionSchema = z.object({
  status: z.literal("cancelled"),
  booking: bookingToolDetailSchema,
  replayed: z.boolean(),
})

export const cancelBookingToolOutputSchema = completedCancelledBookingActionSchema

export const CANCEL_BOOKING_HANDLER_POLICY = {
  capabilityId: "@voyant-travel/bookings#tool.cancel-booking",
  capabilityVersion: "v1",
  canonicalName: "cancel_booking",
  actionPolicy: {
    id: "booking.status.cancel",
    capabilityId: "bookings:status:cancel",
    version: "v1",
    kind: "execute",
    targetType: "booking",
    commandTargetField: "id",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "critical",
    ledger: "required",
    approval: "required",
    policy: "bookings-status-approval-v1",
    reversible: false,
    allowedActorTypes: ["staff", "system"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const cancelBookingTool = defineTool<
  z.infer<typeof cancelBookingToolInputSchema>,
  z.infer<typeof cancelBookingToolOutputSchema>,
  BookingsToolContext
>({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.cancel-booking",
  capabilityVersion: "v1",
  name: "cancel_booking",
  description:
    "Cancel a booking through its contractual consequence preview. First call cancel_booking with `_voyant.confirmed: true` but no approval id so this handler computes the refund entitlement and requests an approval containing that canonical preview; do not call request_action_approval directly. Approve the returned approval id, then retry the exact cancel_booking command with `_voyant.confirmed` and that approval id. Supplier and financial side effects may be irreversible.",
  inputSchema: cancelBookingToolInputSchema,
  outputSchema: cancelBookingToolOutputSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "external-booking"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, CANCEL_BOOKING_HANDLER_POLICY)
    return cancelBookingToolOutputSchema.parse(await bookings(ctx).cancelBooking(input, admitted))
  },
})

const amendmentCommandFields = {
  bookingId: z.string().min(1).describe("The stable Booking id."),
  amendmentId: z.string().min(1).describe("The Booking Amendment id."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .describe("Stable key for safely replaying this exact Amendment command."),
}

export const previewTravelerCorrectionAmendmentToolInputSchema =
  previewTravelerCorrectionSchema.extend({
    bookingId: amendmentCommandFields.bookingId,
    idempotencyKey: amendmentCommandFields.idempotencyKey,
  })

export const previewTravelerRosterChangeAmendmentToolInputSchema =
  previewTravelerRosterChangeSchema.extend({
    bookingId: amendmentCommandFields.bookingId,
    idempotencyKey: amendmentCommandFields.idempotencyKey,
  })

export const acceptBookingAmendmentToolInputSchema = acceptBookingAmendmentSchema.extend({
  bookingId: amendmentCommandFields.bookingId,
  amendmentId: amendmentCommandFields.amendmentId,
  idempotencyKey: amendmentCommandFields.idempotencyKey,
})

export const applyBookingAmendmentToolInputSchema = applyBookingAmendmentSchema.extend({
  bookingId: amendmentCommandFields.bookingId,
  amendmentId: amendmentCommandFields.amendmentId,
  idempotencyKey: amendmentCommandFields.idempotencyKey,
})

export const reconcileBookingAmendmentToolInputSchema = z.object({
  bookingId: amendmentCommandFields.bookingId,
  amendmentId: amendmentCommandFields.amendmentId,
  idempotencyKey: amendmentCommandFields.idempotencyKey,
})

const acceptBookingAmendmentToolOutputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("already_applied"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("revision_mismatch") }),
  z.object({ status: z.literal("acceptance_not_required") }),
  z.object({ status: z.literal("quote_expired") }),
  z.object({
    status: z.literal("stale_revision"),
    currentBookingRevision: z.number().int().positive(),
  }),
])

const applyBookingAmendmentToolOutputSchema = bookingAmendmentApplyResultSchema

const bookingAmendmentWriteRisk = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

export const previewTravelerCorrectionAmendmentTool = defineTool({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.preview-traveler-correction-amendment",
  capabilityVersion: "v1",
  name: "preview_traveler_correction_amendment",
  description:
    "Create an immutable, idempotent before/proposed-after preview for a traveler correction without replacing the Booking.",
  inputSchema: previewTravelerCorrectionAmendmentToolInputSchema,
  outputSchema: bookingAmendmentPreviewResultSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: bookingAmendmentWriteRisk,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsToolContext) {
    return parseJsonResult(
      bookingAmendmentPreviewResultSchema,
      await bookings(ctx).previewTravelerCorrectionAmendment(input),
    )
  },
})

export const previewTravelerRosterChangeAmendmentTool = defineTool({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.preview-traveler-roster-change-amendment",
  capabilityVersion: "v1",
  name: "preview_traveler_roster_change_amendment",
  description:
    "Quote an immutable traveler add/drop Amendment with server-calculated price, tax, inventory, supplier, and financial consequences.",
  inputSchema: previewTravelerRosterChangeAmendmentToolInputSchema,
  outputSchema: bookingAmendmentPreviewResultSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: bookingAmendmentWriteRisk,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsToolContext) {
    return parseJsonResult(
      bookingAmendmentPreviewResultSchema,
      await bookings(ctx).previewTravelerRosterChangeAmendment(input),
    )
  },
})

export const acceptBookingAmendmentTool = defineTool({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.accept-booking-amendment",
  capabilityVersion: "v1",
  name: "accept_booking_amendment",
  description:
    "Record explicit acceptance of the exact proposed Booking revision when the Amendment policy requires it.",
  inputSchema: acceptBookingAmendmentToolInputSchema,
  outputSchema: acceptBookingAmendmentToolOutputSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: bookingAmendmentWriteRisk,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsToolContext) {
    return parseJsonResult(
      acceptBookingAmendmentToolOutputSchema,
      await bookings(ctx).acceptBookingAmendment(input),
    )
  },
})

export const applyBookingAmendmentTool = defineTool({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.apply-booking-amendment",
  capabilityVersion: "v1",
  name: "apply_booking_amendment",
  description:
    "Atomically apply an accepted or directly-applicable Amendment to the stable Booking revision.",
  inputSchema: applyBookingAmendmentToolInputSchema,
  outputSchema: applyBookingAmendmentToolOutputSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: bookingAmendmentWriteRisk,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsToolContext) {
    return parseJsonResult(
      applyBookingAmendmentToolOutputSchema,
      await bookings(ctx).applyBookingAmendment(input),
    )
  },
})

export const reconcileBookingAmendmentTool = defineTool({
  owner: "@voyant-travel/bookings",
  capabilityId: "@voyant-travel/bookings#tool.reconcile-booking-amendment",
  capabilityVersion: "v1",
  name: "reconcile_booking_amendment",
  description:
    "Reconcile durable Supplier Operations for a Booking Amendment and atomically apply it only when every effect is proven.",
  inputSchema: reconcileBookingAmendmentToolInputSchema,
  outputSchema: applyBookingAmendmentToolOutputSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: bookingAmendmentWriteRisk,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsToolContext) {
    return parseJsonResult(
      applyBookingAmendmentToolOutputSchema,
      await bookings(ctx).reconcileBookingAmendment(input),
    )
  },
})

export const bookingsTools = [
  listBookingsTool,
  getBookingTool,
  cancelBookingTool,
  previewTravelerCorrectionAmendmentTool,
  previewTravelerRosterChangeAmendmentTool,
  acceptBookingAmendmentTool,
  applyBookingAmendmentTool,
  reconcileBookingAmendmentTool,
] as const

// Extension Tools are wrapped at the package's canonical `./tools` entry so
// deployment graph selection, MCP discovery, and manifest convergence all use
// one public runtime without collapsing extension ownership.
export const listBookingExtrasTool = defineTool(listBookingExtrasDefinition)
export const getBookingExtraTool = defineTool(getBookingExtraDefinition)
export const createBookingExtraTool = defineTool(createBookingExtraDefinition)
export const updateBookingExtraTool = defineTool(updateBookingExtraDefinition)
export const getSlotExtraManifestTool = defineTool(getSlotExtraManifestDefinition)
export const setSlotExtraSelectionTool = defineTool(setSlotExtraSelectionDefinition)
export const bulkSetSlotExtraSelectionsTool = defineTool(bulkSetSlotExtraSelectionsDefinition)
export const bulkUpdateSlotExtraCollectionsTool = defineTool(
  bulkUpdateSlotExtraCollectionsDefinition,
)

export const bookingsExtrasTools = [
  listBookingExtrasTool,
  getBookingExtraTool,
  createBookingExtraTool,
  updateBookingExtraTool,
  getSlotExtraManifestTool,
  setSlotExtraSelectionTool,
  bulkSetSlotExtraSelectionsTool,
  bulkUpdateSlotExtraCollectionsTool,
] as const

export const getPublicTransportRequirementsTool = defineTool(
  getPublicTransportRequirementsDefinition,
)
export const listProductContactRequirementsTool = defineTool(
  listProductContactRequirementsDefinition,
)
export const getProductContactRequirementTool = defineTool(getProductContactRequirementDefinition)
export const createProductContactRequirementTool = defineTool(
  createProductContactRequirementDefinition,
)
export const updateProductContactRequirementTool = defineTool(
  updateProductContactRequirementDefinition,
)
export const listProductBookingQuestionsTool = defineTool(listProductBookingQuestionsDefinition)
export const getProductBookingQuestionTool = defineTool(getProductBookingQuestionDefinition)
export const createProductBookingQuestionTool = defineTool(createProductBookingQuestionDefinition)
export const updateProductBookingQuestionTool = defineTool(updateProductBookingQuestionDefinition)
export const listOptionBookingQuestionsTool = defineTool(listOptionBookingQuestionsDefinition)
export const getOptionBookingQuestionTool = defineTool(getOptionBookingQuestionDefinition)
export const createOptionBookingQuestionTool = defineTool(createOptionBookingQuestionDefinition)
export const updateOptionBookingQuestionTool = defineTool(updateOptionBookingQuestionDefinition)
export const listBookingQuestionOptionsTool = defineTool(listBookingQuestionOptionsDefinition)
export const getBookingQuestionOptionTool = defineTool(getBookingQuestionOptionDefinition)
export const createBookingQuestionOptionTool = defineTool(createBookingQuestionOptionDefinition)
export const updateBookingQuestionOptionTool = defineTool(updateBookingQuestionOptionDefinition)
export const listBookingQuestionUnitTriggersTool = defineTool(
  listBookingQuestionUnitTriggersDefinition,
)
export const getBookingQuestionUnitTriggerTool = defineTool(getBookingQuestionUnitTriggerDefinition)
export const createBookingQuestionUnitTriggerTool = defineTool(
  createBookingQuestionUnitTriggerDefinition,
)
export const updateBookingQuestionUnitTriggerTool = defineTool(
  updateBookingQuestionUnitTriggerDefinition,
)
export const listBookingQuestionOptionTriggersTool = defineTool(
  listBookingQuestionOptionTriggersDefinition,
)
export const getBookingQuestionOptionTriggerTool = defineTool(
  getBookingQuestionOptionTriggerDefinition,
)
export const createBookingQuestionOptionTriggerTool = defineTool(
  createBookingQuestionOptionTriggerDefinition,
)
export const updateBookingQuestionOptionTriggerTool = defineTool(
  updateBookingQuestionOptionTriggerDefinition,
)
export const listBookingQuestionExtraTriggersTool = defineTool(
  listBookingQuestionExtraTriggersDefinition,
)
export const getBookingQuestionExtraTriggerTool = defineTool(
  getBookingQuestionExtraTriggerDefinition,
)
export const createBookingQuestionExtraTriggerTool = defineTool(
  createBookingQuestionExtraTriggerDefinition,
)
export const updateBookingQuestionExtraTriggerTool = defineTool(
  updateBookingQuestionExtraTriggerDefinition,
)
export const listBookingAnswersTool = defineTool(listBookingAnswersDefinition)
export const getBookingAnswerTool = defineTool(getBookingAnswerDefinition)
export const createBookingAnswerTool = defineTool(createBookingAnswerDefinition)
export const updateBookingAnswerTool = defineTool(updateBookingAnswerDefinition)

export const bookingRequirementsTools = [
  getPublicTransportRequirementsTool,
  listProductContactRequirementsTool,
  getProductContactRequirementTool,
  createProductContactRequirementTool,
  updateProductContactRequirementTool,
  listProductBookingQuestionsTool,
  getProductBookingQuestionTool,
  createProductBookingQuestionTool,
  updateProductBookingQuestionTool,
  listOptionBookingQuestionsTool,
  getOptionBookingQuestionTool,
  createOptionBookingQuestionTool,
  updateOptionBookingQuestionTool,
  listBookingQuestionOptionsTool,
  getBookingQuestionOptionTool,
  createBookingQuestionOptionTool,
  updateBookingQuestionOptionTool,
  listBookingQuestionUnitTriggersTool,
  getBookingQuestionUnitTriggerTool,
  createBookingQuestionUnitTriggerTool,
  updateBookingQuestionUnitTriggerTool,
  listBookingQuestionOptionTriggersTool,
  getBookingQuestionOptionTriggerTool,
  createBookingQuestionOptionTriggerTool,
  updateBookingQuestionOptionTriggerTool,
  listBookingQuestionExtraTriggersTool,
  getBookingQuestionExtraTriggerTool,
  createBookingQuestionExtraTriggerTool,
  updateBookingQuestionExtraTriggerTool,
  listBookingAnswersTool,
  getBookingAnswerTool,
  createBookingAnswerTool,
  updateBookingAnswerTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
