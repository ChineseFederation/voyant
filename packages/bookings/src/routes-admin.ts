// agent-quality: file-size exception -- owner: bookings; existing route module stays co-located until a dedicated split preserves behavior and tests.

import { OpenAPIHono } from "@hono/zod-openapi"
import {
  ACTION_LEDGER_APPROVAL_ID_HEADER,
  ActionApprovalDecisionConflictError,
  type ActionApprovalResponse,
  type ActionLedgerCapabilityAccessResult,
  type ActionLedgerEntry,
  type ActionLedgerEntryResponse,
  type ActionLedgerRequestContextValues,
  actionLedgerService,
  appendActionLedgerMutation,
  appendActionLedgerSensitiveRead,
  type BuildActionLedgerApprovedExecutionFieldsInput,
  buildActionLedgerApprovedExecutionFields,
  decideActionLedgerApproval,
  evaluateActionLedgerCapabilityAccess,
  ledgerSensitiveRead,
} from "@voyant-travel/action-ledger"
import {
  createCustomFieldRegistry,
  type NamespacedCustomFieldValues,
  validateCustomFields,
} from "@voyant-travel/core/custom-fields"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  aggregateSnapshotKey,
  readThroughAggregateSnapshot,
} from "@voyant-travel/db/aggregate-snapshots"
import {
  ForbiddenApiError,
  handleApiError,
  isStaffRbacEnforced,
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  RequestValidationError,
  requireUserId,
  UnauthorizedApiError,
} from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { z } from "zod"

import {
  BOOKING_PII_READ_CAPABILITY,
  BOOKING_STATUS_CAPABILITIES,
} from "./action-ledger-capabilities.js"
import { BookingMonthlyLimitReachedError } from "./booking-plan-limit.js"
import { createBookingPiiService } from "./pii.js"
import {
  redactBookingContact,
  redactTravelerIdentity,
  shouldRevealBookingPii,
} from "./pii-redaction.js"
import {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  type BookingRouteRuntime,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
import { bookingAmendmentAdminRoutes } from "./routes-amendments.js"
import { bookingGroupRoutes } from "./routes-groups.js"
import { createBookingsAdminRoute as createRoute } from "./routes-openapi.js"
import type { publicBookingRoutes } from "./routes-public.js"
import type { Env } from "./routes-shared.js"
import { bookingPiiAccessLog } from "./schema.js"
import { bookingsService } from "./service.js"
import { bookingGroupsService } from "./service-groups.js"
import { publicBookingsService, resolveSessionPricingSnapshot } from "./service-public.js"
import {
  authorizeBookingStatusMutation as authorizeBookingStatusMutationCore,
  type BookingStatusAuthorizationResult,
} from "./status-authorization.js"
import {
  bookingAggregatesQuerySchema,
  bookingAllocationStatusSchema,
  bookingAllocationTypeSchema,
  bookingDocumentTypeSchema,
  bookingFulfillmentDeliveryChannelSchema,
  bookingFulfillmentStatusSchema,
  bookingFulfillmentTypeSchema,
  bookingItemParticipantRoleSchema,
  bookingItemStatusSchema,
  bookingItemTypeSchema,
  bookingListQuerySchema,
  bookingParticipantTypeSchema,
  bookingRedemptionMethodSchema,
  bookingSourceTypeSchema,
  bookingStatusSchema,
  bookingTravelerCategorySchema,
  cancelBookingSchema,
  completeBookingSchema,
  createTravelerWithTravelDetailsSchema,
  insertBookingDocumentSchema,
  insertBookingFulfillmentSchema,
  insertBookingItemSchema,
  insertBookingItemTravelerSchema,
  insertBookingNoteSchema,
  insertSupplierStatusSchema,
  insertTravelerSchema,
  internalBookingOverviewLookupQuerySchema,
  overrideBookingStatusSchema,
  pricingPreviewSchema,
  publicBookingOverviewSchema,
  recordBookingRedemptionSchema,
  sharingGroupsForSlotQuerySchema,
  startBookingSchema,
  supplierConfirmationStatusSchema,
  updateBookingFulfillmentSchema,
  updateBookingItemSchema,
  updateBookingNoteSchema,
  updateBookingSchema,
  updateSupplierStatusSchema,
  updateTravelerSchema,
  updateTravelerWithTravelDetailsSchema,
  upsertTravelerTravelDetailsSchema,
} from "./validation.js"

function hasPiiScope(scopes: string[] | null | undefined, action: "read" | "update" | "delete") {
  if (!scopes || scopes.length === 0) {
    return false
  }

  return (
    scopes.includes("*") ||
    scopes.includes("bookings-pii:*") ||
    scopes.includes(`bookings-pii:${action}`)
  )
}

const BOOKING_PII_READ_ACTION_NAME = "booking.pii.read"
const BOOKING_PII_READ_ACTION_VERSION = "v1"
const BOOKING_PII_DECISION_POLICY = "bookings-pii-scope-or-staff-v1"
const BOOKING_PII_AUTHORIZATION_SOURCE = "bookings.pii.route"
const BOOKING_TRAVELER_LEDGER_ACTION_VERSION = "v1"
const BOOKING_ITEM_LEDGER_ACTION_VERSION = "v1"
const BOOKING_NOTE_LEDGER_ACTION_VERSION = "v1"

type ApprovedBookingStatusAction = BuildActionLedgerApprovedExecutionFieldsInput
type BookingMutationLedgerInput = {
  action: BookingMutationAction
  actionName: string
  actionVersion: string
  targetType: string
  targetId: string
  changedFields: string[]
  subject: string
  routeOrToolName: string
  authorizationSource?: string
  evaluatedRisk?: ActionLedgerEntry["evaluatedRisk"]
  summary?: string
}
type BookingTravelerMutationLedgerInput = {
  action: BookingTravelerLedgerAction
  travelerId: string
  changedFields: string[]
  subject: string
  actionName: string
  routeOrToolName: string
  evaluatedRisk?: ActionLedgerEntry["evaluatedRisk"]
  summary?: string
}
type TravelerTravelDetails = Awaited<
  ReturnType<ReturnType<typeof createBookingPiiService>["getTravelerTravelDetails"]>
>

const TRAVELER_IDENTITY_DISCLOSED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "specialRequests",
  "notes",
]
const TRAVELER_TRAVEL_DETAIL_DISCLOSED_FIELDS = [
  "nationality",
  "documentType",
  "documentNumber",
  "documentExpiry",
  "documentIssuingCountry",
  "documentIssuingAuthority",
  "documentPersonDocumentId",
  "dateOfBirth",
  "dietaryRequirements",
  "accessibilityNeeds",
  "isLeadTraveler",
  "sharingGroupId",
  "roomTypeId",
  "bedPreference",
  "allocations",
]
const TRAVELER_MUTATION_FIELDS = [
  "personId",
  "participantType",
  "travelerCategory",
  "firstName",
  "lastName",
  "email",
  "phone",
  "preferredLanguage",
  "specialRequests",
  "isPrimary",
  "notes",
]
const BOOKING_ITEM_MUTATION_FIELDS = [
  "title",
  "description",
  "itemType",
  "status",
  "serviceDate",
  "startsAt",
  "endsAt",
  "quantity",
  "sellCurrency",
  "unitSellAmountCents",
  "totalSellAmountCents",
  "costCurrency",
  "unitCostAmountCents",
  "totalCostAmountCents",
  "notes",
  "productId",
  "optionId",
  "optionUnitId",
  "pricingCategoryId",
  "availabilitySlotId",
  "productNameSnapshot",
  "optionNameSnapshot",
  "unitNameSnapshot",
  "departureLabelSnapshot",
  "sourceSnapshotId",
  "sourceOfferId",
  "metadata",
]

const bookingActionLedgerQuerySchema = z
  .object({
    cursorOccurredAt: z.string().datetime().optional(),
    cursorId: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(199).optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.cursorOccurredAt) === Boolean(value.cursorId)) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.cursorOccurredAt ? ["cursorId"] : ["cursorOccurredAt"],
      message: "cursorOccurredAt and cursorId must be provided together",
    })
  })
  .transform(({ cursorOccurredAt, cursorId, ...query }) => ({
    ...query,
    cursor:
      cursorOccurredAt && cursorId
        ? {
            occurredAt: cursorOccurredAt,
            id: cursorId,
          }
        : undefined,
  }))

const decideBookingActionApprovalBodySchema = z.object({
  status: z.enum(["approved", "denied"]),
})

interface BookingActionLedgerTravelerTarget {
  id: string
  firstName: string | null
  lastName: string | null
}

export interface BookingActionLedgerListResponse {
  data: ActionLedgerEntryResponse[]
  travelers: BookingActionLedgerTravelerTarget[]
  pageInfo: {
    nextCursor: {
      occurredAt: string
      id: string
    } | null
  }
}

export interface BookingActionApprovalDecisionResponse {
  data: {
    approval: ActionApprovalResponse
    decisionAction: ActionLedgerEntryResponse
  }
}

const DASHBOARD_AGGREGATES_CACHE_CONTROL = "private, max-age=30"

/** Server-side snapshot TTL — see readThroughAggregateSnapshot (#1629). */
const DASHBOARD_AGGREGATES_TTL_SECONDS = 60

function cacheDashboardAggregates(c: Context<Env>) {
  c.header("Cache-Control", DASHBOARD_AGGREGATES_CACHE_CONTROL)
  c.header("Vary", "Authorization", { append: true })
  c.header("Vary", "Cookie", { append: true })
}

function getActionLedgerRequestContext(c: Context<Env>): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

async function validateBookingBillingPartyReferences<T extends Env>(
  c: Context<T>,
  data: { personId?: string | null; organizationId?: string | null },
) {
  const runtime = getRouteRuntime(c)
  const db = c.get("db")

  if (data.personId && runtime.resolveBillingPersonById) {
    const exists = await runtime.resolveBillingPersonById(db, data.personId)
    if (!exists) {
      throw new RequestValidationError("Booking personId does not reference an existing person", {
        fields: {
          fieldErrors: { personId: ["Person not found"] },
          formErrors: [],
        },
      })
    }
  }

  if (data.organizationId && runtime.resolveBillingOrganizationById) {
    const exists = await runtime.resolveBillingOrganizationById(db, data.organizationId)
    if (!exists) {
      throw new RequestValidationError(
        "Booking organizationId does not reference an existing organization",
        {
          fields: {
            fieldErrors: { organizationId: ["Organization not found"] },
            formErrors: [],
          },
        },
      )
    }
  }
}

/**
 * Validate a booking write against database definitions locked for the entire
 * entity transaction. This prevents a definition rename/delete from racing a
 * write validated against the old key.
 */
async function validateBookingCustomFields<T extends Env>(
  c: Context<T>,
  data: { customFields?: NamespacedCustomFieldValues },
  mode: "create" | "update",
  db: PostgresJsDatabase,
): Promise<void> {
  const resolveRegistry = getRouteRuntime(c).customFieldsForWrite
  if (data.customFields === undefined) {
    // A partial update without custom fields, or no registry at all, is a no-op.
    // A create with an absent envelope still validates `{}` so `required` fields
    // are enforced.
    if (mode === "update" || !resolveRegistry) {
      return
    }
  } else if (!resolveRegistry) {
    throw new RequestValidationError("Custom fields are not configured for this deployment", {
      fields: { fieldErrors: { customFields: ["not configured"] }, formErrors: [] },
    })
  }
  if (!resolveRegistry) {
    return
  }
  const registry = await resolveRegistry(db)
  const operatorRegistry = createCustomFieldRegistry(
    registry.forEntity("booking").filter((definition) => definition.namespace === "custom"),
  )
  const result = validateCustomFields(operatorRegistry, "booking", data.customFields ?? {})
  if (!result.ok) {
    throw new RequestValidationError("Invalid booking custom fields", {
      fields: {
        fieldErrors: Object.fromEntries(
          result.errors.map((e) => [`${e.namespace}.${e.key}`, [e.message]]),
        ),
        formErrors: [],
      },
    })
  }
  data.customFields = result.value
}

type BookingTravelerLedgerAction = "create" | "update" | "delete"
type BookingMutationAction = "create" | "update" | "delete"

function changedBookingMutationFields(
  input: Record<string, unknown>,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const fields = Object.keys(input).filter((field) => !ignoredBookingMutationFields.has(field))
  if (!before || !after) return fields.sort()

  return fields.filter((field) => !bookingValuesEqual(before[field], after[field])).sort()
}

function changedBookingTravelerFields(
  input: Record<string, unknown>,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const travelerFields = new Set(TRAVELER_MUTATION_FIELDS)
  return changedBookingMutationFields(input, before, after).filter((field) =>
    travelerFields.has(field),
  )
}

function changedBookingTravelDetailFields(input: Record<string, unknown>): string[] {
  const travelDetailFields = new Set(TRAVELER_TRAVEL_DETAIL_DISCLOSED_FIELDS)
  return Object.keys(input)
    .filter((field) => travelDetailFields.has(field))
    .sort()
}

function changedBookingItemFields(
  input: Record<string, unknown>,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const itemFields = new Set(BOOKING_ITEM_MUTATION_FIELDS)
  return changedBookingMutationFields(input, before, after).filter((field) => itemFields.has(field))
}

function bookingMutationSummary(action: BookingMutationAction, fields: string[], subject: string) {
  if (action === "delete") return `Deleted ${subject}`
  if (fields.length === 0) return action === "create" ? `Created ${subject}` : `Updated ${subject}`
  const verb = action === "create" ? "Created" : "Updated"
  return `${verb} ${subject} fields: ${fields.join(", ")}`
}

async function appendBookingMutationLedgerEntry(
  c: Context<Env>,
  input: BookingMutationLedgerInput,
) {
  return appendBookingMutationLedgerEntryToDb(c.get("db"), getActionLedgerRequestContext(c), input)
}

async function appendBookingMutationLedgerEntryToDb(
  db: AnyDrizzleDb,
  context: ActionLedgerRequestContextValues,
  input: BookingMutationLedgerInput,
) {
  return appendActionLedgerMutation(db, {
    context,
    actionName: input.actionName,
    actionVersion: input.actionVersion,
    actionKind: input.action,
    evaluatedRisk: input.evaluatedRisk ?? "medium",
    targetType: input.targetType,
    targetId: input.targetId,
    routeOrToolName: input.routeOrToolName,
    authorizationSource: input.authorizationSource ?? "bookings.route",
    mutationDetail: {
      summary:
        input.summary ?? bookingMutationSummary(input.action, input.changedFields, input.subject),
      reversalKind: "none",
    },
  })
}

async function appendBookingTravelerMutationLedgerEntryToDb(
  db: AnyDrizzleDb,
  context: ActionLedgerRequestContextValues,
  input: BookingTravelerMutationLedgerInput,
) {
  return appendBookingMutationLedgerEntryToDb(db, context, {
    ...input,
    actionName: input.actionName,
    actionVersion: BOOKING_TRAVELER_LEDGER_ACTION_VERSION,
    targetType: "booking_traveler",
    targetId: input.travelerId,
    authorizationSource: BOOKING_PII_AUTHORIZATION_SOURCE,
    evaluatedRisk: input.evaluatedRisk ?? "high",
  })
}

function bookingValuesEqual(left: unknown, right: unknown) {
  if (left instanceof Date || right instanceof Date) {
    const leftTime = left instanceof Date ? left.getTime() : new Date(String(left)).getTime()
    const rightTime = right instanceof Date ? right.getTime() : new Date(String(right)).getTime()
    return leftTime === rightTime
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

const ignoredBookingMutationFields = new Set(["updatedAt", "createdAt"])

type BookingStatusCapabilityRoute =
  | {
      key: "cancel"
      actionName: "booking.status.cancel"
      routeOrToolName: "bookings.cancel"
    }
  | {
      key: "start"
      actionName: "booking.status.start"
      routeOrToolName: "bookings.start"
    }
  | {
      key: "complete"
      actionName: "booking.status.complete"
      routeOrToolName: "bookings.complete"
    }
  | {
      key: "override"
      actionName: "booking.status.override"
      routeOrToolName: "bookings.override-status"
    }

async function authorizeBookingStatusMutation(
  c: Context<Env>,
  input: BookingStatusCapabilityRoute & {
    bookingId: string
    commandInput?: unknown
  },
) {
  const result = await authorizeBookingStatusMutationCore({
    db: c.get("db"),
    ...input,
    actor: c.get("actor"),
    callerType: c.get("callerType"),
    scopes: c.get("scopes"),
    isInternalRequest: c.get("isInternalRequest"),
    requestContext: getActionLedgerRequestContext(c),
    conditionalApprovalRequired: requiresBookingStatusApproval(c, input.key),
    approvalReasonCode: bookingStatusApprovalReason(c, input.key),
    approvalId: c.req.header(ACTION_LEDGER_APPROVAL_ID_HEADER) ?? null,
    idempotencyKey: c.req.header("idempotency-key") ?? null,
  })

  return bookingStatusAuthorizationRouteResult(c, result)
}

async function bookingStatusAuthorizationRouteResult(
  c: Context<Env>,
  result: BookingStatusAuthorizationResult,
) {
  switch (result.status) {
    case "authorized":
      return {
        allowed: true as const,
        access: result.access,
        approvedAction: result.approvedAction,
      }
    case "approval_required":
      return {
        allowed: false as const,
        response: c.json(
          {
            data: {
              approvalRequired: true,
              requestedAction: {
                id: result.requestedAction.id,
                status: result.requestedAction.status,
                actionName: result.requestedAction.actionName,
                targetType: result.requestedAction.targetType,
                targetId: result.requestedAction.targetId,
              },
              approval: {
                id: result.approval.id,
                status: result.approval.status,
                requestedActionId: result.approval.requestedActionId,
                requestedByPrincipalId: result.approval.requestedByPrincipalId,
                assignedToPrincipalId: result.approval.assignedToPrincipalId,
                policyName: result.approval.policyName,
                policyVersion: result.approval.policyVersion,
                riskSnapshot: result.approval.riskSnapshot,
                reasonCode: result.approval.reasonCode,
                expiresAt: result.approval.expiresAt,
                createdAt: result.approval.createdAt,
              },
              replayed: result.replayed,
            },
          },
          202,
        ),
      }
    case "already_executed": {
      const booking = await bookingsService.getBookingById(c.get("db"), result.bookingId)
      if (!booking) {
        return {
          allowed: false as const,
          response: c.json({ error: "Booking not found" }, 404),
        }
      }
      return {
        allowed: false as const,
        response: c.json({ data: booking, replayed: true }, 200),
      }
    }
    case "denied":
      return {
        allowed: false as const,
        response: handleApiError(new ForbiddenApiError(), c),
      }
    case "missing_idempotency_key":
      return {
        allowed: false as const,
        response: c.json(
          { error: "Approval-required booking status actions require an Idempotency-Key" },
          400,
        ),
      }
    case "idempotency_conflict":
      return {
        allowed: false as const,
        response: c.json({ error: result.message, existingActionId: result.existingActionId }, 409),
      }
    case "invalid_approval":
      return {
        allowed: false as const,
        response: actionApprovalValidationResponse(c, result.validation),
      }
  }
}

function actionApprovalValidationResponse(
  c: Context<Env>,
  validation: Exclude<
    Awaited<ReturnType<typeof actionLedgerService.validateApprovedAction>>,
    { ok: true }
  >,
) {
  switch (validation.reason) {
    case "not_found":
      return c.json({ error: "Action approval not found" }, 404)
    case "not_approved":
      return c.json(
        {
          error: "Action approval is not approved",
          approvalId: validation.approval?.id,
          status: validation.status,
        },
        409,
      )
    case "expired":
      return c.json(
        {
          error: "Action approval has expired",
          approvalId: validation.approval?.id,
        },
        409,
      )
    case "mismatched_action":
      return c.json(
        {
          error: "Action approval does not match this booking status action",
          approvalId: validation.approval?.id,
        },
        409,
      )
    case "already_executed":
      return c.json(
        {
          error: "Action approval has already been executed",
          approvalId: validation.approval?.id,
          existingActionId: validation.existingActionId,
        },
        409,
      )
    case "missing_fingerprint":
      return c.json(
        {
          error: "Action approval is missing an approved command fingerprint",
          approvalId: validation.approval?.id,
        },
        409,
      )
    case "fingerprint_mismatch":
      return c.json(
        {
          error: "Action approval command input does not match the approved request",
          approvalId: validation.approval?.id,
        },
        409,
      )
    case "principal_mismatch":
      return c.json({ error: "Action approval belongs to a different principal" }, 403)
    case "organization_mismatch":
      return c.json({ error: "Action approval belongs to a different organization" }, 403)
    case "assignee_mismatch":
      return c.json({ error: "Action approval was decided by a different assignee" }, 403)
    case "capability_mismatch":
    case "risk_mismatch":
    case "policy_mismatch":
    case "reason_mismatch":
    case "idempotency_key_mismatch":
      return c.json(
        {
          error: "Action approval metadata does not match this booking status action",
          approvalId: validation.approval?.id,
          reason: validation.reason,
        },
        409,
      )
  }

  const exhaustiveReason: never = validation.reason
  return c.json({ error: `Unhandled action approval validation failure: ${exhaustiveReason}` }, 500)
}

function bookingStatusMutationRuntime(
  c: Context<Env>,
  auth: {
    access: ActionLedgerCapabilityAccessResult
    approvedAction?: ApprovedBookingStatusAction
  },
) {
  const approvedExecution = auth.approvedAction
    ? buildActionLedgerApprovedExecutionFields(auth.approvedAction)
    : null
  const requestIdempotencyKey = c.req.header("idempotency-key")?.trim() || null

  return {
    eventBus: c.get("eventBus"),
    monthlyBookingLimit: getRouteRuntime(c).monthlyBookingLimit,
    closePaymentSchedulesForBooking: getRouteRuntime(c).closePaymentSchedulesForBooking,
    recordCancellationFinancialSettlement: getRouteRuntime(c).recordCancellationFinancialSettlement,
    actionLedgerContext: getActionLedgerRequestContext(c),
    actionLedgerAuthorizationSource: auth.access.authorizationSource,
    actionLedgerCausationActionId: approvedExecution?.causationActionId ?? null,
    actionLedgerApprovalId: approvedExecution?.approvalId ?? null,
    actionLedgerIdempotencyScope:
      approvedExecution?.idempotencyScope ??
      (requestIdempotencyKey ? "bookings.status.route" : null),
    actionLedgerIdempotencyKey: approvedExecution?.idempotencyKey ?? requestIdempotencyKey,
    actionLedgerIdempotencyFingerprint: approvedExecution?.idempotencyFingerprint ?? null,
  }
}

function requiresBookingStatusApproval(c: Context<Env>, key: BookingStatusCapabilityRoute["key"]) {
  const capability = BOOKING_STATUS_CAPABILITIES[key]
  if (capability.approvalPolicy !== "conditional") return false
  return (
    c.get("callerType") === "agent" ||
    c.get("callerType") === "workflow" ||
    Boolean(c.get("agentId")) ||
    Boolean(c.get("workflowPrincipalId"))
  )
}

function bookingStatusApprovalReason(c: Context<Env>, key: BookingStatusCapabilityRoute["key"]) {
  if (c.get("callerType") === "agent" || c.get("agentId")) {
    return `${key}_requested_by_agent`
  }
  if (c.get("callerType") === "workflow" || c.get("workflowPrincipalId")) {
    return `${key}_requested_by_workflow`
  }
  return null
}

async function logBookingPiiReadActionLedger(
  c: Context<Env>,
  input: {
    travelerId: string
    status: "succeeded" | "denied" | "failed"
    reason: string
    routeOrToolName: string
    disclosedFieldSet?: string[] | null
    disclosureSummary?: string | null
    decisionPolicy?: string | null
    authorizationSource?: string | null
    evaluatedRisk?: ActionLedgerCapabilityAccessResult["evaluatedRisk"] | null
  },
) {
  await appendActionLedgerSensitiveRead(c.get("db"), {
    context: getActionLedgerRequestContext(c),
    actionName: BOOKING_PII_READ_ACTION_NAME,
    actionVersion: BOOKING_PII_READ_ACTION_VERSION,
    status: input.status,
    evaluatedRisk: input.evaluatedRisk ?? "high",
    targetType: "booking_traveler",
    targetId: input.travelerId,
    routeOrToolName: input.routeOrToolName,
    capabilityId: BOOKING_PII_READ_CAPABILITY.id,
    capabilityVersion: BOOKING_PII_READ_CAPABILITY.version,
    authorizationSource: input.authorizationSource ?? BOOKING_PII_AUTHORIZATION_SOURCE,
    reasonCode: input.reason,
    disclosedFieldSet: input.status === "succeeded" ? (input.disclosedFieldSet ?? []) : [],
    disclosureSummary: input.disclosureSummary ?? null,
    decisionPolicy: input.decisionPolicy ?? BOOKING_PII_DECISION_POLICY,
  })
}

async function logBookingPiiAccess(
  c: Context<Env>,
  input: {
    bookingId?: string
    travelerId?: string
    action: "read" | "update" | "delete"
    outcome: "allowed" | "denied"
    reason?: string
    metadata?: Record<string, unknown>
  },
) {
  await c
    .get("db")
    .insert(bookingPiiAccessLog)
    .values({
      bookingId: input.bookingId ?? null,
      travelerId: input.travelerId ?? null,
      actorId: c.get("userId") ?? null,
      actorType: c.get("actor") ?? null,
      callerType: c.get("callerType") ?? null,
      action: input.action,
      outcome: input.outcome,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
    })
}

async function authorizeBookingPiiAccess(
  c: Context<Env>,
  input: {
    bookingId: string
    travelerId: string
    action: "read" | "update" | "delete"
  },
) {
  if (c.get("isInternalRequest")) {
    return { allowed: true as const, access: undefined }
  }

  const userId = c.get("userId")
  if (!userId) {
    await logBookingPiiAccess(c, {
      ...input,
      outcome: "denied",
      reason: "missing_user",
    })
    if (input.action === "read") {
      await logBookingPiiReadActionLedger(c, {
        travelerId: input.travelerId,
        status: "denied",
        reason: "missing_user",
        routeOrToolName: "bookings.pii.authorize",
        disclosureSummary: "Booking PII read denied before reveal",
      })
    }
    return {
      allowed: false as const,
      response: handleApiError(new UnauthorizedApiError(), c),
    }
  }

  const customAuthorizer = c.get("authorizeBookingPii")
  if (customAuthorizer) {
    const allowed = await customAuthorizer({
      db: c.get("db"),
      userId,
      actor: c.get("actor"),
      callerType: c.get("callerType"),
      scopes: c.get("scopes"),
      isInternalRequest: c.get("isInternalRequest"),
      ...input,
    })

    if (!allowed) {
      await logBookingPiiAccess(c, {
        ...input,
        outcome: "denied",
        reason: "custom_policy_denied",
      })
      if (input.action === "read") {
        await logBookingPiiReadActionLedger(c, {
          travelerId: input.travelerId,
          status: "denied",
          reason: "custom_policy_denied",
          routeOrToolName: "bookings.pii.authorize",
          disclosureSummary: "Booking PII read denied before reveal",
          decisionPolicy: "custom",
        })
      }
      return {
        allowed: false as const,
        response: handleApiError(new ForbiddenApiError(), c),
      }
    }

    return { allowed: true as const, access: undefined }
  }

  const actor = c.get("actor")
  const scopes = c.get("scopes")

  if (input.action === "read") {
    const access = evaluateActionLedgerCapabilityAccess({
      definition: BOOKING_PII_READ_CAPABILITY,
      actor,
      callerType: c.get("callerType"),
      scopes,
      isInternalRequest: c.get("isInternalRequest"),
    })

    if (!access.allowed) {
      await logBookingPiiAccess(c, {
        ...input,
        outcome: "denied",
        reason: access.reason,
        metadata: {
          actor: actor ?? null,
          authorizationSource: access.authorizationSource,
          capabilityId: access.capabilityId,
          capabilityVersion: access.capabilityVersion,
        },
      })
      await logBookingPiiReadActionLedger(c, {
        travelerId: input.travelerId,
        status: "denied",
        reason: access.reason,
        routeOrToolName: "bookings.pii.authorize",
        disclosureSummary: "Booking PII read denied before reveal",
        authorizationSource: access.authorizationSource,
        evaluatedRisk: access.evaluatedRisk,
      })
      return {
        allowed: false as const,
        response: handleApiError(new ForbiddenApiError(), c),
      }
    }

    return { allowed: true as const, access }
  }

  const allowed = hasPiiScope(scopes, input.action) || actor === "staff"

  if (!allowed) {
    await logBookingPiiAccess(c, {
      ...input,
      outcome: "denied",
      reason: "insufficient_scope",
      metadata: { actor: actor ?? null },
    })
    return {
      allowed: false as const,
      response: handleApiError(new ForbiddenApiError(), c),
    }
  }

  return { allowed: true as const, access: undefined }
}

function handleKmsConfigError(c: Context<Env>, error: unknown) {
  if (error instanceof Error) {
    return c.json(
      {
        error: "Booking PII encryption is not configured",
        details: error.message,
      },
      500,
    )
  }

  return c.json({ error: "Booking PII encryption is not configured" }, 500)
}

function getRouteRuntime<T extends Env>(c: Context<T>): BookingRouteRuntime {
  try {
    const runtime = c.var.container?.resolve(BOOKING_ROUTE_RUNTIME_CONTAINER_KEY) as
      | BookingRouteRuntime
      | undefined

    return runtime ?? buildBookingRouteRuntime(c.env)
  } catch {
    return buildBookingRouteRuntime(c.env)
  }
}

async function createAuditedBookingPiiService(c: Context<Env>, bookingId: string) {
  const runtime = getRouteRuntime(c)
  const kms = await runtime.getKmsProvider()

  return createBookingPiiService({
    kms,
    onAudit: async (event) => {
      await logBookingPiiAccess(c, {
        bookingId,
        travelerId: event.travelerId,
        action:
          event.action === "encrypt"
            ? "update"
            : event.action === "decrypt"
              ? "read"
              : event.action,
        outcome: "allowed",
      })
    },
  })
}

function serializeBookingActionLedgerDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("Booking action ledger timestamp must be a valid date")
  }
  return date.toISOString()
}

function serializeBookingActionLedgerEntry(entry: ActionLedgerEntry): ActionLedgerEntryResponse {
  return {
    ...entry,
    occurredAt: serializeBookingActionLedgerDate(entry.occurredAt),
    createdAt: serializeBookingActionLedgerDate(entry.createdAt),
  }
}

function toBookingActionLedgerCursor(entry: Pick<ActionLedgerEntry, "occurredAt" | "id">) {
  return {
    occurredAt: serializeBookingActionLedgerDate(entry.occurredAt),
    id: entry.id,
  }
}

function sortBookingActionLedgerEntries(entries: ActionLedgerEntry[]) {
  return [...entries].sort((a, b) => {
    const occurredAtDelta = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    if (occurredAtDelta !== 0) return occurredAtDelta
    return b.id.localeCompare(a.id)
  })
}

function buildBookingActionLedgerPage({
  bookingEntries,
  travelerEntries,
  itemEntries = [],
  limit,
}: {
  bookingEntries: ActionLedgerEntry[]
  travelerEntries: ActionLedgerEntry[]
  itemEntries?: ActionLedgerEntry[]
  limit: number
}) {
  const entriesById = new Map<string, ActionLedgerEntry>()
  for (const entry of bookingEntries) {
    entriesById.set(entry.id, entry)
  }
  for (const entry of travelerEntries) {
    entriesById.set(entry.id, entry)
  }
  for (const entry of itemEntries) {
    entriesById.set(entry.id, entry)
  }

  const sortedEntries = sortBookingActionLedgerEntries([...entriesById.values()])
  const entries = sortedEntries.slice(0, limit)
  const lastEntry = entries.at(-1)
  const nextCursor =
    sortedEntries.length > limit && lastEntry ? toBookingActionLedgerCursor(lastEntry) : null

  return { entries, nextCursor }
}

async function listBookingActionLedger(c: Context<Env>) {
  const bookingId = c.req.param("id")
  if (!bookingId) {
    return c.json({ error: "Booking not found" }, 404)
  }

  const query = parseQuery(c, bookingActionLedgerQuerySchema)
  const limit = query.limit ?? 50
  const queryLimit = limit + 1

  const booking = await bookingsService.getBookingById(c.get("db"), bookingId)
  if (!booking) {
    return c.json({ error: "Booking not found" }, 404)
  }

  const travelers = await bookingsService.listTravelers(c.get("db"), bookingId)
  const reveal = shouldRevealBookingPii({
    actor: c.get("actor"),
    scopes: c.get("scopes"),
    callerType: c.get("callerType"),
    isInternalRequest: c.get("isInternalRequest"),
    enforceRbac: isStaffRbacEnforced(c.env),
  })
  const visibleTravelers = reveal ? travelers : travelers.map((row) => redactTravelerIdentity(row))

  const travelerIds = travelers.map((traveler) => traveler.id)
  const items = await bookingsService.listItems(c.get("db"), bookingId)
  const itemIds = items.map((item) => item.id)
  const [bookingEntriesResult, travelerEntriesResult, itemEntriesResult] = await Promise.all([
    actionLedgerService.listEntries(c.get("db"), {
      targetType: "booking",
      targetId: bookingId,
      cursor: query.cursor,
      limit: queryLimit,
    }),
    travelerIds.length > 0
      ? actionLedgerService.listEntries(c.get("db"), {
          targetType: "booking_traveler",
          targetIds: travelerIds,
          cursor: query.cursor,
          limit: queryLimit,
        })
      : Promise.resolve({ entries: [], nextCursor: null }),
    itemIds.length > 0
      ? actionLedgerService.listEntries(c.get("db"), {
          targetType: "booking_item",
          targetIds: itemIds,
          cursor: query.cursor,
          limit: queryLimit,
        })
      : Promise.resolve({ entries: [], nextCursor: null }),
  ])

  const page = buildBookingActionLedgerPage({
    bookingEntries: bookingEntriesResult.entries,
    travelerEntries: travelerEntriesResult.entries,
    itemEntries: itemEntriesResult.entries,
    limit,
  })

  return c.json({
    data: page.entries.map(serializeBookingActionLedgerEntry),
    travelers: visibleTravelers.map((traveler) => ({
      id: traveler.id,
      firstName: traveler.firstName,
      lastName: traveler.lastName,
    })),
    pageInfo: {
      nextCursor: page.nextCursor,
    },
  } satisfies BookingActionLedgerListResponse)
}

function serializeBookingActionApproval(
  approval: NonNullable<Awaited<ReturnType<typeof actionLedgerService.getApproval>>>["approval"],
): ActionApprovalResponse {
  return {
    ...approval,
    expiresAt: approval.expiresAt ? serializeBookingActionLedgerDate(approval.expiresAt) : null,
    decidedAt: approval.decidedAt ? serializeBookingActionLedgerDate(approval.decidedAt) : null,
    createdAt: serializeBookingActionLedgerDate(approval.createdAt),
  }
}

function findBookingStatusCapability(capabilityId: string | null) {
  return Object.values(BOOKING_STATUS_CAPABILITIES).find(
    (capability) => capability.id === capabilityId,
  )
}

async function decideBookingActionApproval(c: Context<Env>) {
  const bookingId = c.req.param("id")
  const approvalId = c.req.param("approvalId")
  if (!bookingId || !approvalId) {
    return c.json({ error: "Action approval not found" }, 404)
  }

  if (!c.get("isInternalRequest") && !c.get("userId")) {
    return handleApiError(new UnauthorizedApiError(), c)
  }

  const body = await parseJsonBody(c, decideBookingActionApprovalBodySchema)
  const existing = await actionLedgerService.getApproval(c.get("db"), approvalId)
  if (!existing?.requestedAction?.entry) {
    return c.json({ error: "Action approval not found" }, 404)
  }

  const requestedAction = existing.requestedAction.entry
  if (requestedAction.targetType !== "booking" || requestedAction.targetId !== bookingId) {
    return c.json({ error: "Action approval not found" }, 404)
  }

  const capability = findBookingStatusCapability(requestedAction.capabilityId)
  if (!capability) {
    return c.json({ error: "Action approval is not a booking status approval" }, 409)
  }

  const access = evaluateActionLedgerCapabilityAccess({
    definition: capability,
    actor: c.get("actor"),
    callerType: c.get("callerType"),
    scopes: c.get("scopes"),
    isInternalRequest: c.get("isInternalRequest"),
  })

  if (!access.allowed) {
    return handleApiError(new ForbiddenApiError(), c)
  }

  try {
    const result = await decideActionLedgerApproval(c.get("db"), {
      context: getActionLedgerRequestContext(c),
      id: approvalId,
      status: body.status,
      actionName: "booking.status.approval.decide",
      actionVersion: capability.version,
      evaluatedRisk: requestedAction.evaluatedRisk,
      targetType: "booking",
      targetId: bookingId,
      routeOrToolName: "bookings.approvals.decide",
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      authorizationSource: access.authorizationSource,
    })

    if (!result) {
      return c.json({ error: "Action approval not found" }, 404)
    }

    return c.json({
      data: {
        approval: serializeBookingActionApproval(result.approval),
        decisionAction: serializeBookingActionLedgerEntry(result.decisionAction),
      },
    } satisfies BookingActionApprovalDecisionResponse)
  } catch (error) {
    if (error instanceof ActionApprovalDecisionConflictError) {
      return c.json(
        {
          error: "Action approval has already been decided",
          approvalId: error.approvalId,
          status: error.currentStatus,
        },
        409,
      )
    }
    throw error
  }
}

// ==========================================================================
// OpenAPI admin routes (voyant#2114)
// ==========================================================================
// Request schemas reuse the existing `@voyant-travel/bookings-contracts`
// schemas the handlers already parse; list responses use the framework's
// canonical `listResponseSchema(...)` envelope; response row schemas are
// authored from the Drizzle `$inferSelect` shapes (§17: timestamp columns
// serialize to ISO strings over the wire). Bespoke composites (aggregates,
// overview, pricing-preview, traveler reveal, action-ledger) are authored
// from the service shape. Business logic + auth/actor/scope guards are
// unchanged.
//
// Split into per-resource child `OpenAPIHono` sub-chains (`.route("/", child)`)
// rather than one long flat `.openapi()` chain to keep the tsc inference cost
// linear (~12 sub-chains, ~5 legs each).

const isoTimestamp = z.string()
const nullableIsoTimestamp = z.string().nullable()
const errorResponseSchema = z.object({ error: z.string() })
const deleteResponseSchema = z.object({ success: z.boolean() })
const idParamSchema = z.object({ id: z.string() })
const jsonObject = z.record(z.string(), z.unknown())
const namespacedCustomFields = z.record(z.string(), jsonObject)

// --- row response schemas (from $inferSelect) ------------------------------

const bookingSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  revision: z.number().int().positive(),
  status: bookingStatusSchema,
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  sourceType: bookingSourceTypeSchema,
  externalBookingRef: z.string().nullable(),
  communicationLanguage: z.string().nullable(),
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  contactPartyType: z.string().nullable(),
  contactTaxId: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactPreferredLanguage: z.string().nullable(),
  contactCountry: z.string().nullable(),
  contactRegion: z.string().nullable(),
  contactCity: z.string().nullable(),
  contactAddressLine1: z.string().nullable(),
  contactAddressLine2: z.string().nullable(),
  contactPostalCode: z.string().nullable(),
  sellCurrency: z.string(),
  baseCurrency: z.string().nullable(),
  fxRateSetId: z.string().nullable(),
  sellAmountCents: z.number().int().nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  baseCostAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  internalNotes: z.string().nullable(),
  notificationsSuppressed: z.boolean(),
  customerPaymentPolicy: z.unknown().nullable(),
  priceOverride: jsonObject.nullable(),
  customFields: namespacedCustomFields,
  acceptedAt: nullableIsoTimestamp,
  confirmedAt: nullableIsoTimestamp,
  cancelledAt: nullableIsoTimestamp,
  completedAt: nullableIsoTimestamp,
  redeemedAt: nullableIsoTimestamp,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// The list/create/update/sharing-group traveler endpoints serialize the
// service `toTravelerResponse` projection, which omits `personId`. The
// per-traveler reveal returns the raw row (with `personId`), but that leg is
// bridged through `asRouteResponse`, so this documented shape tracks the list
// projection.
const bookingTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  participantType: bookingParticipantTypeSchema,
  travelerCategory: bookingTravelerCategorySchema.nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  specialRequests: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const bookingItemSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  itemType: bookingItemTypeSchema,
  status: bookingItemStatusSchema,
  serviceDate: z.string().nullable(),
  startsAt: nullableIsoTimestamp,
  endsAt: nullableIsoTimestamp,
  quantity: z.number().int(),
  sellCurrency: z.string(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  costCurrency: z.string().nullable(),
  unitCostAmountCents: z.number().int().nullable(),
  totalCostAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  availabilitySlotId: z.string().nullable(),
  productNameSnapshot: z.string().nullable(),
  optionNameSnapshot: z.string().nullable(),
  unitNameSnapshot: z.string().nullable(),
  departureLabelSnapshot: z.string().nullable(),
  sourceSnapshotId: z.string().nullable(),
  sourceOfferId: z.string().nullable(),
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const bookingItemTravelerSchema = z.object({
  id: z.string(),
  bookingItemId: z.string(),
  travelerId: z.string(),
  role: bookingItemParticipantRoleSchema,
  isPrimary: z.boolean(),
  createdAt: isoTimestamp,
})

const bookingAllocationSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  availabilitySlotId: z.string().nullable(),
  quantity: z.number().int(),
  allocationType: bookingAllocationTypeSchema,
  status: bookingAllocationStatusSchema,
  holdExpiresAt: nullableIsoTimestamp,
  confirmedAt: nullableIsoTimestamp,
  releasedAt: nullableIsoTimestamp,
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const bookingSupplierStatusSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  supplierServiceId: z.string().nullable(),
  supplierId: z.string().nullable(),
  serviceName: z.string(),
  status: supplierConfirmationStatusSchema,
  supplierReference: z.string().nullable(),
  costCurrency: z.string(),
  costAmountCents: z.number().int(),
  supplierInvoiceLineId: z.string().nullable(),
  notes: z.string().nullable(),
  confirmedAt: nullableIsoTimestamp,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const bookingFulfillmentSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  fulfillmentType: bookingFulfillmentTypeSchema,
  deliveryChannel: bookingFulfillmentDeliveryChannelSchema,
  status: bookingFulfillmentStatusSchema,
  artifactUrl: z.string().nullable(),
  payload: jsonObject.nullable(),
  issuedAt: nullableIsoTimestamp,
  revokedAt: nullableIsoTimestamp,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const bookingRedemptionEventSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  redeemedAt: isoTimestamp,
  redeemedBy: z.string().nullable(),
  location: z.string().nullable(),
  method: bookingRedemptionMethodSchema,
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
})

const bookingActivitySchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  actorId: z.string().nullable(),
  activityType: z.enum([
    "booking_created",
    "booking_reserved",
    "booking_converted",
    "booking_confirmed",
    "booking_started",
    "booking_completed",
    "hold_extended",
    "hold_expired",
    "status_change",
    "status_overridden",
    "item_update",
    "allocation_released",
    "fulfillment_issued",
    "fulfillment_updated",
    "redemption_recorded",
    "supplier_update",
    "traveler_update",
    "note_added",
    "system_action",
  ]),
  description: z.string(),
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
})

const bookingNoteSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: isoTimestamp,
})

const bookingDocumentSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  travelerId: z.string().nullable(),
  type: bookingDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
  expiresAt: nullableIsoTimestamp,
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
})

// The booking detail read (`GET /{id}`) hydrates the bookings-owned child
// collections inline so a single fetch exposes the records that exist for the
// booking. Previously the detail response carried only the flat booking row and
// these collections were reachable exclusively through the per-collection
// sibling endpoints (`/{id}/items`, `/{id}/travelers`, `/{id}/documents`),
// which made them read as `null`/absent to clients that consumed the detail
// response alone. Finance-owned records (payments, invoices) are intentionally
// NOT inlined here: bookings must not depend on finance (the module dependency
// runs finance→bookings), so those stay behind the finance booking-scoped admin
// routes and are composed at the deployment boundary.
const bookingDetailSchema = bookingSchema.extend({
  items: z.array(bookingItemSchema),
  travelers: z.array(bookingTravelerSchema),
  documents: z.array(bookingDocumentSchema),
})

// --- bespoke composite response schemas ------------------------------------

const sharingGroupSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  occupancy: z.number().int(),
  roomTypeId: z.string().nullable(),
  bookingIds: z.array(z.string()),
})

// `GET /sharing-groups/:groupId/travelers` returns the richer
// `BookingTravelerSharingGroupMember` join (traveler + booking number + travel
// detail columns), optionally redacted; author it permissively as a passthrough.
const sharingGroupTravelerSchema = z
  .object({
    id: z.string(),
    bookingId: z.string(),
    bookingNumber: z.string(),
  })
  .passthrough()

const bookingAggregatesSchema = z.object({
  total: z.number().int(),
  totalPax: z.number().int(),
  countsByStatus: z.array(z.object({ status: bookingStatusSchema, count: z.number().int() })),
  monthlyCounts: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
  monthlyRevenue: z.array(
    z.object({
      yearMonth: z.string(),
      currency: z.string(),
      sellAmountCents: z.number().int(),
    }),
  ),
  upcomingDepartures: z.object({
    count: z.number().int(),
    items: z.array(
      z.object({
        id: z.string(),
        bookingNumber: z.string().nullable(),
        status: bookingStatusSchema,
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        pax: z.number().int().nullable(),
        sellCurrency: z.string().nullable(),
        sellAmountCents: z.number().int().nullable(),
      }),
    ),
  }),
})

// The pricing snapshot is a deep bespoke catalog/pricing composite resolved by
// `resolveSessionPricingSnapshot`; declare it permissively as a passthrough
// object so the documented response stays accurate without re-deriving the full
// pricing graph here.
const pricingSnapshotSchema = z.object({}).passthrough()

// The traveler reveal returns the traveler row joined with decrypted travel
// details (PII). The decrypted detail shape is bespoke and toxic; keep the
// `travelDetails` projection permissive.
const travelerWithTravelDetailsSchema = bookingTravelerSchema.extend({
  travelDetails: z.unknown(),
})

// `GET /:id/group` returns `(BookingGroup & { membership }) | null`. The group
// row shape is bespoke (and the membership join is nested); author it
// permissively as a passthrough object with the discriminating `id`/`membership`.
const bookingGroupMembershipNullableSchema = z
  .object({
    id: z.string(),
    membership: z
      .object({
        id: z.string(),
        groupId: z.string(),
        bookingId: z.string(),
      })
      .passthrough(),
  })
  .passthrough()
  .nullable()

// Action-ledger list + approval-decision responses are serialized by the
// `listBookingActionLedger` / `decideBookingActionApproval` handlers from the
// action-ledger entry/approval shapes; author them permissively.
const actionLedgerListResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  travelers: z.array(
    z.object({
      id: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    }),
  ),
  pageInfo: z.object({
    nextCursor: z.object({ occurredAt: z.string(), id: z.string() }).nullable(),
  }),
})

const actionApprovalDecisionResponseSchema = z.object({
  data: z.object({
    approval: z.record(z.string(), z.unknown()),
    decisionAction: z.record(z.string(), z.unknown()),
  }),
})

// --- response/request helpers ----------------------------------------------

function jsonBody<S extends z.ZodTypeAny>(schema: S, required: boolean, description: string) {
  return {
    required,
    description,
    content: { "application/json": { schema } },
  }
}

function dataResponse<S extends z.ZodTypeAny>(schema: S, description: string) {
  return {
    description,
    content: { "application/json": { schema: z.object({ data: schema }) } },
  }
}

function listResponse<S extends z.ZodTypeAny>(schema: S, description: string) {
  return {
    description,
    content: { "application/json": { schema: listResponseSchema(schema) } },
  }
}

function notFoundResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorResponseSchema } },
  }
}

function conflictResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorResponseSchema } },
  }
}

async function ensureBookingItemMutationsAllowed(c: Context<Env>, bookingId: string) {
  const booking = await bookingsService.getBookingById(c.get("db"), bookingId)
  if (!booking) {
    return c.json({ error: "Booking not found" }, 404)
  }
  if (booking.status === "cancelled") {
    return c.json({ error: "Cancelled bookings cannot be changed" }, 409)
  }
  return null
}

function deletedResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: deleteResponseSchema } },
  }
}

const invalidRequestResponse = {
  description: "invalid_request — request input failed validation",
  content: { "application/json": { schema: errorResponseSchema } },
}

/**
 * Bridges a handler that returns a bare `Response` (e.g. via `handleApiError`,
 * `auth.response`, `handleKmsConfigError`, or a service union whose `.booking`
 * branch is structurally `Booking | null`) to the `.openapi()` per-route typed
 * response union. The runtime payloads honor the declared schemas (asserted by
 * the contract tests); this only relaxes the compile-time check. Same escape
 * hatch as `@voyant-travel/catalog`'s booking-engine routes (voyant#2114).
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union.
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

// ==========================================================================
// Core CRUD sub-chain
// ==========================================================================

const listBookingsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: bookingListQuerySchema },
  responses: {
    200: listResponse(bookingSchema, "Paginated bookings (PII redacted unless reveal-authorized)"),
    400: invalidRequestResponse,
  },
})

const getBookingRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(
      bookingDetailSchema,
      "A booking by id with its bookings-owned child collections (items, travelers, documents); PII redacted unless reveal-authorized",
    ),
    404: notFoundResponse("Booking not found"),
  },
})

const updateBookingRoute = createRoute({
  method: "patch",
  path: "/{id}",
  request: {
    params: idParamSchema,
    body: jsonBody(updateBookingSchema, false, "Partial booking update"),
  },
  responses: {
    200: dataResponse(bookingSchema, "The updated booking"),
    402: notFoundResponse("Monthly booking plan limit reached"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const deleteBookingRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: deletedResponse("The booking was deleted"),
    404: notFoundResponse("Booking not found"),
  },
})

const coreCrudRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

coreCrudRoutes
  .openapi(listBookingsRoute, async (c) => {
    const result = await bookingsService.listBookings(c.get("db"), c.req.valid("query"))
    const reveal = shouldRevealBookingPii({
      actor: c.get("actor"),
      scopes: c.get("scopes"),
      callerType: c.get("callerType"),
      isInternalRequest: c.get("isInternalRequest"),
      enforceRbac: isStaffRbacEnforced(c.env),
    })
    await logBookingPiiAccess(c, {
      action: "read",
      outcome: "allowed",
      reason: reveal ? "list_reveal" : "list_redacted",
      metadata: { rowCount: result.data.length, reveal },
    })
    if (reveal) return c.json(result, 200)
    return c.json(
      {
        ...result,
        data: result.data.map((row) => redactBookingContact(row)),
      },
      200,
    )
  })
  .openapi(getBookingRoute, async (c) => {
    const db = c.get("db")
    const bookingId = c.req.valid("param").id
    const row = await bookingsService.getBookingById(db, bookingId)
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    const reveal = shouldRevealBookingPii({
      actor: c.get("actor"),
      scopes: c.get("scopes"),
      callerType: c.get("callerType"),
      isInternalRequest: c.get("isInternalRequest"),
      enforceRbac: isStaffRbacEnforced(c.env),
    })
    // Hydrate the bookings-owned child collections so the detail read exposes
    // the records that exist for the booking in a single fetch. Traveler PII
    // follows the same reveal/redaction gate as the standalone travelers read.
    const [items, travelers, documents] = await Promise.all([
      bookingsService.listItems(db, bookingId),
      bookingsService.listTravelers(db, bookingId),
      bookingsService.listDocuments(db, bookingId),
    ])
    await logBookingPiiAccess(c, {
      bookingId: row.id,
      action: "read",
      outcome: "allowed",
      reason: reveal ? "detail_reveal" : "detail_redacted",
      metadata: { reveal, items: items.length, travelers: travelers.length },
    })
    const booking = reveal ? row : redactBookingContact(row)
    const travelerRows = reveal ? travelers : travelers.map((row) => redactTravelerIdentity(row))
    return c.json({ data: { ...booking, items, travelers: travelerRows, documents } }, 200)
  })
  .openapi(updateBookingRoute, async (c) => {
    const data = c.req.valid("json") ?? {}
    await validateBookingBillingPartyReferences(c, data)
    const db = c.get("db")
    let row: Awaited<ReturnType<typeof bookingsService.updateBooking>>
    try {
      row =
        data.customFields !== undefined && getRouteRuntime(c).customFieldsForWrite
          ? await db.transaction(async (tx) => {
              await validateBookingCustomFields(c, data, "update", tx)
              return bookingsService.updateBooking(tx, c.req.valid("param").id, data)
            })
          : await (async () => {
              await validateBookingCustomFields(c, data, "update", db)
              return bookingsService.updateBooking(db, c.req.valid("param").id, data)
            })()
    } catch (error) {
      if (error instanceof BookingMonthlyLimitReachedError) {
        return c.json({ error: error.message }, 402)
      }
      throw error
    }
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteBookingRoute, async (c) => {
    const row = await bookingsService.deleteBooking(c.get("db"), c.req.valid("param").id)
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Aggregates / overview / cross-cutting reads sub-chain
// ==========================================================================

const pricingPreviewRoute = createRoute({
  method: "post",
  path: "/pricing-preview",
  request: { body: jsonBody(pricingPreviewSchema, true, "Pricing preview selection") },
  responses: {
    200: dataResponse(pricingSnapshotSchema, "A resolved pricing snapshot"),
    400: invalidRequestResponse,
    404: notFoundResponse("Pricing unavailable for this selection"),
  },
})

const aggregatesRoute = createRoute({
  method: "get",
  path: "/aggregates",
  request: { query: bookingAggregatesQuerySchema },
  responses: {
    200: dataResponse(bookingAggregatesSchema, "Pre-aggregated dashboard metrics"),
    400: invalidRequestResponse,
  },
})

const overviewRoute = createRoute({
  method: "get",
  path: "/overview",
  request: { query: internalBookingOverviewLookupQuerySchema },
  responses: {
    200: dataResponse(publicBookingOverviewSchema, "An internal/admin booking overview"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking overview not found"),
  },
})

const sharingGroupsRoute = createRoute({
  method: "get",
  path: "/sharing-groups",
  request: { query: sharingGroupsForSlotQuerySchema },
  responses: {
    200: dataResponse(z.array(sharingGroupSummarySchema), "Sharing groups for a slot"),
    400: invalidRequestResponse,
  },
})

const sharingGroupTravelersRoute = createRoute({
  method: "get",
  path: "/sharing-groups/{groupId}/travelers",
  request: {
    params: z.object({ groupId: z.string() }),
    query: sharingGroupsForSlotQuerySchema,
  },
  responses: {
    200: dataResponse(
      z.array(sharingGroupTravelerSchema),
      "Travelers in a sharing group (PII redacted unless reveal-authorized)",
    ),
    400: invalidRequestResponse,
  },
})

const allocationsRoute = createRoute({
  method: "get",
  path: "/{id}/allocations",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingAllocationSchema), "Booking allocations"),
  },
})

const activityRoute = createRoute({
  method: "get",
  path: "/{id}/activity",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingActivitySchema), "Booking activity log"),
  },
})

const bookingGroupRoute = createRoute({
  method: "get",
  path: "/{id}/group",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(
      bookingGroupMembershipNullableSchema,
      "Shared-room group membership for this booking (or null)",
    ),
  },
})

const readsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(pricingPreviewRoute, async (c) => {
    const body = c.req.valid("json")
    const snapshot = await resolveSessionPricingSnapshot(c.get("db"), body.productId, {
      optionId: body.optionId ?? undefined,
      catalogId: body.catalogId ?? undefined,
      requirePublicProduct: false,
    })
    if (!snapshot) {
      return c.json({ error: "Pricing unavailable for this selection" }, 404)
    }
    return c.json({ data: snapshot }, 200)
  })
  .openapi(aggregatesRoute, async (c) => {
    const query = c.req.valid("query")
    cacheDashboardAggregates(c)
    const snapshot = await readThroughAggregateSnapshot(c.get("db"), {
      key: aggregateSnapshotKey("bookings", "aggregates", query),
      ttlSeconds: DASHBOARD_AGGREGATES_TTL_SECONDS,
      compute: () => bookingsService.getBookingAggregates(c.get("db"), query),
    })
    return c.json({ data: snapshot.data }, 200)
  })
  .openapi(overviewRoute, async (c) => {
    const overview = await publicBookingsService.getOverviewByLookup(
      c.get("db"),
      c.req.valid("query"),
    )
    if (!overview) {
      return c.json({ error: "Booking overview not found" }, 404)
    }
    return c.json({ data: overview }, 200)
  })
  .openapi(sharingGroupsRoute, async (c) => {
    const data = await bookingsService.listSharingGroupsForSlot(
      c.get("db"),
      c.req.valid("query").slotId,
    )
    return c.json({ data }, 200)
  })
  .openapi(sharingGroupTravelersRoute, async (c) => {
    const data = await bookingsService.listTravelersBySharingGroup(
      c.get("db"),
      c.req.valid("query").slotId,
      c.req.valid("param").groupId,
    )
    const reveal = shouldRevealBookingPii({
      actor: c.get("actor"),
      scopes: c.get("scopes"),
      callerType: c.get("callerType"),
      isInternalRequest: c.get("isInternalRequest"),
      enforceRbac: isStaffRbacEnforced(c.env),
    })
    await logBookingPiiAccess(c, {
      action: "read",
      outcome: "allowed",
      reason: reveal ? "sharing_group_travelers_reveal" : "sharing_group_travelers_redacted",
      metadata: { rowCount: data.length, reveal },
    })
    return c.json({ data: reveal ? data : data.map((row) => redactTravelerIdentity(row)) }, 200)
  })
  .openapi(allocationsRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listAllocations(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(activityRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listActivity(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(bookingGroupRoute, async (c) => {
    const result = await bookingGroupsService.getBookingGroupForBooking(
      c.get("db"),
      c.req.valid("param").id,
    )
    return c.json({ data: result ?? null }, 200)
  })

// ==========================================================================
// Action ledger sub-chain
// ==========================================================================

const actionLedgerRoute = createRoute({
  method: "get",
  path: "/{id}/action-ledger",
  request: {
    params: idParamSchema,
    query: bookingActionLedgerQuerySchema,
  },
  responses: {
    200: {
      description: "Booking-scoped action timeline",
      content: { "application/json": { schema: actionLedgerListResponseSchema } },
    },
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const actionApprovalDecideRoute = createRoute({
  method: "post",
  path: "/{id}/action-approvals/{approvalId}/decide",
  request: {
    params: z.object({ id: z.string(), approvalId: z.string() }),
    body: jsonBody(decideBookingActionApprovalBodySchema, true, "Approval decision"),
  },
  responses: {
    200: {
      description: "The approval decision result",
      content: { "application/json": { schema: actionApprovalDecisionResponseSchema } },
    },
    400: invalidRequestResponse,
    401: notFoundResponse("Unauthorized"),
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Action approval not found"),
    409: conflictResponse("Action approval is not a booking status approval / already decided"),
    500: notFoundResponse("Unhandled action approval validation failure"),
  },
})

const actionLedgerRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(actionLedgerRoute, (c) => asRouteResponse(listBookingActionLedger(c)))
  .openapi(actionApprovalDecideRoute, (c) => asRouteResponse(decideBookingActionApproval(c)))

// ==========================================================================
// Lifecycle sub-chain
// ==========================================================================

const cancelRoute = createRoute({
  method: "post",
  path: "/{id}/cancel",
  request: {
    params: idParamSchema,
    body: jsonBody(cancelBookingSchema, false, "Cancel options"),
  },
  responses: {
    200: dataResponse(bookingSchema, "The cancelled booking"),
    202: {
      description: "approval_required — an action approval was requested",
      content: { "application/json": { schema: jsonObject } },
    },
    400: invalidRequestResponse,
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Booking not found"),
    409: conflictResponse("Invalid transition / approval idempotency conflict"),
  },
})

const startRoute = createRoute({
  method: "post",
  path: "/{id}/start",
  request: {
    params: idParamSchema,
    body: jsonBody(startBookingSchema, false, "Start options"),
  },
  responses: {
    200: dataResponse(bookingSchema, "The in-progress booking"),
    202: {
      description: "approval_required — an action approval was requested",
      content: { "application/json": { schema: jsonObject } },
    },
    400: invalidRequestResponse,
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Booking not found"),
    409: conflictResponse("Invalid transition / approval idempotency conflict"),
  },
})

const completeRoute = createRoute({
  method: "post",
  path: "/{id}/complete",
  request: {
    params: idParamSchema,
    body: jsonBody(completeBookingSchema, false, "Complete options"),
  },
  responses: {
    200: dataResponse(bookingSchema, "The completed booking"),
    202: {
      description: "approval_required — an action approval was requested",
      content: { "application/json": { schema: jsonObject } },
    },
    400: invalidRequestResponse,
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Booking not found"),
    409: conflictResponse("Invalid transition / approval idempotency conflict"),
  },
})

const overrideStatusRoute = createRoute({
  method: "post",
  path: "/{id}/override-status",
  request: {
    params: idParamSchema,
    body: jsonBody(overrideBookingStatusSchema, true, "Status override input"),
  },
  responses: {
    200: dataResponse(bookingSchema, "The booking with overridden status"),
    202: {
      description: "approval_required — an action approval was requested",
      content: { "application/json": { schema: jsonObject } },
    },
    400: invalidRequestResponse,
    402: notFoundResponse("Monthly booking plan limit reached"),
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Booking not found"),
    409: conflictResponse("Approval idempotency conflict"),
  },
})

const lifecycleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

lifecycleRoutes
  .openapi(cancelRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const data = c.req.valid("json") ?? {}
        const auth = await authorizeBookingStatusMutation(c, {
          key: "cancel",
          actionName: "booking.status.cancel",
          routeOrToolName: "bookings.cancel",
          bookingId,
          commandInput: data,
        })
        if (!auth.allowed) return auth.response
        const result = await bookingsService.cancelBooking(
          c.get("db"),
          bookingId,
          data,
          c.get("userId"),
          bookingStatusMutationRuntime(c, auth),
        )
        if (result.status === "not_found") {
          return c.json({ error: "Booking not found" }, 404)
        }
        if (result.status === "invalid_transition") {
          return c.json({ error: "Booking cannot be cancelled from its current state" }, 409)
        }
        if ("booking" in result) {
          return c.json({ data: result.booking }, 200)
        }
        return c.json({ error: "Unable to cancel booking" }, 400)
      })(),
    ),
  )
  .openapi(startRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const data = c.req.valid("json") ?? {}
        const auth = await authorizeBookingStatusMutation(c, {
          key: "start",
          actionName: "booking.status.start",
          routeOrToolName: "bookings.start",
          bookingId,
        })
        if (!auth.allowed) return auth.response
        const result = await bookingsService.startBooking(
          c.get("db"),
          bookingId,
          data,
          c.get("userId"),
          bookingStatusMutationRuntime(c, auth),
        )
        if (result.status === "not_found") {
          return c.json({ error: "Booking not found" }, 404)
        }
        if (result.status === "invalid_transition") {
          return c.json({ error: "Booking is not in a confirmed state" }, 409)
        }
        if ("booking" in result) {
          return c.json({ data: result.booking }, 200)
        }
        return c.json({ error: "Unable to start booking" }, 400)
      })(),
    ),
  )
  .openapi(completeRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const data = c.req.valid("json") ?? {}
        const auth = await authorizeBookingStatusMutation(c, {
          key: "complete",
          actionName: "booking.status.complete",
          routeOrToolName: "bookings.complete",
          bookingId,
        })
        if (!auth.allowed) return auth.response
        const result = await bookingsService.completeBooking(
          c.get("db"),
          bookingId,
          data,
          c.get("userId"),
          bookingStatusMutationRuntime(c, auth),
        )
        if (result.status === "not_found") {
          return c.json({ error: "Booking not found" }, 404)
        }
        if (result.status === "invalid_transition") {
          return c.json({ error: "Booking is not in an in-progress state" }, 409)
        }
        if ("booking" in result) {
          return c.json({ data: result.booking }, 200)
        }
        return c.json({ error: "Unable to complete booking" }, 400)
      })(),
    ),
  )
  .openapi(overrideStatusRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const data = c.req.valid("json")
        const auth = await authorizeBookingStatusMutation(c, {
          key: "override",
          actionName: "booking.status.override",
          routeOrToolName: "bookings.override-status",
          bookingId,
          commandInput: data,
        })
        if (!auth.allowed) return auth.response
        const result = await bookingsService.overrideBookingStatus(
          c.get("db"),
          bookingId,
          data,
          c.get("userId"),
          bookingStatusMutationRuntime(c, auth),
        )
        if (result.status === "not_found") {
          return c.json({ error: "Booking not found" }, 404)
        }
        if (result.status === "monthly_booking_limit_reached" && "message" in result) {
          return c.json({ error: result.message }, 402)
        }
        if ("booking" in result) {
          return c.json({ data: result.booking }, 200)
        }
        return c.json({ error: "Unable to override booking status" }, 400)
      })(),
    ),
  )

// ==========================================================================
// Travelers — read sub-chain
// ==========================================================================

const listTravelersRoute = createRoute({
  method: "get",
  path: "/{id}/travelers",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(
      z.array(bookingTravelerSchema),
      "Booking travelers (PII redacted unless reveal-authorized)",
    ),
  },
})

const revealTravelerRoute = createRoute({
  method: "get",
  path: "/{id}/travelers/{travelerId}/reveal",
  request: { params: z.object({ id: z.string(), travelerId: z.string() }) },
  responses: {
    200: dataResponse(
      travelerWithTravelDetailsSchema,
      "The traveler with decrypted travel details",
    ),
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Traveler not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const travelerTravelDetailsRoute = createRoute({
  method: "get",
  path: "/{id}/travelers/{travelerId}/travel-details",
  request: { params: z.object({ id: z.string(), travelerId: z.string() }) },
  responses: {
    200: dataResponse(z.unknown(), "The traveler's decrypted travel details"),
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Traveler or travel details not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const travelersReadRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listTravelersRoute, async (c) => {
    const travelers = await bookingsService.listTravelers(c.get("db"), c.req.valid("param").id)
    const reveal = shouldRevealBookingPii({
      actor: c.get("actor"),
      scopes: c.get("scopes"),
      callerType: c.get("callerType"),
      isInternalRequest: c.get("isInternalRequest"),
      enforceRbac: isStaffRbacEnforced(c.env),
    })
    await logBookingPiiAccess(c, {
      bookingId: c.req.valid("param").id,
      action: "read",
      outcome: "allowed",
      reason: reveal ? "travelers_reveal" : "travelers_redacted",
      metadata: { rowCount: travelers.length, reveal },
    })
    if (reveal) return c.json({ data: travelers }, 200)
    return c.json({ data: travelers.map((row) => redactTravelerIdentity(row)) }, 200)
  })
  .openapi(revealTravelerRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const travelerId = c.req.valid("param").travelerId
        const auth = await authorizeBookingPiiAccess(c, {
          bookingId,
          travelerId,
          action: "read",
        })
        if (!auth.allowed) return auth.response
        const traveler = await bookingsService.getTravelerRecordById(
          c.get("db"),
          bookingId,
          travelerId,
        )
        if (!traveler) {
          await logBookingPiiAccess(c, {
            bookingId,
            travelerId,
            action: "read",
            outcome: "denied",
            reason: "traveler_not_found",
          })
          await logBookingPiiReadActionLedger(c, {
            travelerId,
            status: "denied",
            reason: "traveler_not_found",
            routeOrToolName: "bookings.travelers.reveal",
            disclosureSummary: "Booking PII read denied before reveal",
            authorizationSource: auth.access?.authorizationSource,
            evaluatedRisk: auth.access?.evaluatedRisk,
          })
          return c.json({ error: "Traveler not found" }, 404)
        }
        let travelDetails: TravelerTravelDetails
        try {
          const pii = await createAuditedBookingPiiService(c, traveler.bookingId)
          travelDetails = await ledgerSensitiveRead(
            c.get("db"),
            {
              context: getActionLedgerRequestContext(c),
              actionName: BOOKING_PII_READ_ACTION_NAME,
              actionVersion: BOOKING_PII_READ_ACTION_VERSION,
              status: "succeeded",
              evaluatedRisk: auth.access?.evaluatedRisk ?? "high",
              targetType: "booking_traveler",
              targetId: traveler.id,
              routeOrToolName: "bookings.travelers.reveal",
              capabilityId: BOOKING_PII_READ_CAPABILITY.id,
              capabilityVersion: BOOKING_PII_READ_CAPABILITY.version,
              authorizationSource:
                auth.access?.authorizationSource ?? BOOKING_PII_AUTHORIZATION_SOURCE,
              reasonCode: "traveler_reveal",
              disclosedFieldSet: [
                ...TRAVELER_IDENTITY_DISCLOSED_FIELDS,
                ...TRAVELER_TRAVEL_DETAIL_DISCLOSED_FIELDS,
              ],
              disclosureSummary: "Traveler identity reveal",
              decisionPolicy: BOOKING_PII_DECISION_POLICY,
            },
            () => pii.getTravelerTravelDetails(c.get("db"), traveler.id, c.get("userId")),
          )
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
        await logBookingPiiAccess(c, {
          bookingId,
          travelerId,
          action: "read",
          outcome: "allowed",
          reason: "traveler_reveal",
        })
        return c.json({ data: { ...traveler, travelDetails } }, 200)
      })(),
    ),
  )
  .openapi(travelerTravelDetailsRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const auth = await authorizeBookingPiiAccess(c, {
          bookingId: c.req.valid("param").id,
          travelerId: c.req.valid("param").travelerId,
          action: "read",
        })
        if (!auth.allowed) {
          return auth.response
        }
        const traveler = await bookingsService.getTravelerRecordById(
          c.get("db"),
          c.req.valid("param").id,
          c.req.valid("param").travelerId,
        )
        if (!traveler) {
          await logBookingPiiAccess(c, {
            bookingId: c.req.valid("param").id,
            travelerId: c.req.valid("param").travelerId,
            action: "read",
            outcome: "denied",
            reason: "participant_not_found",
          })
          await logBookingPiiReadActionLedger(c, {
            travelerId: c.req.valid("param").travelerId,
            status: "denied",
            reason: "participant_not_found",
            routeOrToolName: "bookings.travelers.travel-details",
            disclosureSummary: "Booking PII read denied before reveal",
            authorizationSource: auth.access?.authorizationSource,
            evaluatedRisk: auth.access?.evaluatedRisk,
          })
          return c.json({ error: "Traveler not found" }, 404)
        }
        let details: TravelerTravelDetails
        try {
          const pii = await createAuditedBookingPiiService(c, traveler.bookingId)
          details = await ledgerSensitiveRead(
            c.get("db"),
            {
              context: getActionLedgerRequestContext(c),
              actionName: BOOKING_PII_READ_ACTION_NAME,
              actionVersion: BOOKING_PII_READ_ACTION_VERSION,
              status: "succeeded",
              evaluatedRisk: auth.access?.evaluatedRisk ?? "high",
              targetType: "booking_traveler",
              targetId: traveler.id,
              routeOrToolName: "bookings.travelers.travel-details",
              capabilityId: BOOKING_PII_READ_CAPABILITY.id,
              capabilityVersion: BOOKING_PII_READ_CAPABILITY.version,
              authorizationSource:
                auth.access?.authorizationSource ?? BOOKING_PII_AUTHORIZATION_SOURCE,
              reasonCode: "travel_details_reveal",
              disclosedFieldSet: TRAVELER_TRAVEL_DETAIL_DISCLOSED_FIELDS,
              disclosureSummary: "Traveler travel details reveal",
              decisionPolicy: BOOKING_PII_DECISION_POLICY,
            },
            () => pii.getTravelerTravelDetails(c.get("db"), traveler.id, c.get("userId")),
          )
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
        if (!details) {
          await logBookingPiiAccess(c, {
            bookingId: traveler.bookingId,
            travelerId: traveler.id,
            action: "read",
            outcome: "denied",
            reason: "travel_details_not_found",
          })
          return c.json({ error: "Traveler travel details not found" }, 404)
        }
        return c.json({ data: details }, 200)
      })(),
    ),
  )

// ==========================================================================
// Travelers — write sub-chain
// ==========================================================================

const createTravelerRoute = createRoute({
  method: "post",
  path: "/{id}/travelers",
  request: {
    params: idParamSchema,
    body: jsonBody(insertTravelerSchema, true, "Traveler to create"),
  },
  responses: {
    201: dataResponse(bookingTravelerSchema, "The created traveler"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const createTravelerWithDetailsRoute = createRoute({
  method: "post",
  path: "/{id}/travelers/with-travel-details",
  request: {
    params: idParamSchema,
    body: jsonBody(
      createTravelerWithTravelDetailsSchema,
      true,
      "Traveler with encrypted travel details",
    ),
  },
  responses: {
    201: dataResponse(z.unknown(), "The created traveler with travel details"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const updateTravelerWithDetailsRoute = createRoute({
  method: "patch",
  path: "/{id}/travelers/{travelerId}/with-travel-details",
  request: {
    params: z.object({ id: z.string(), travelerId: z.string() }),
    body: jsonBody(
      updateTravelerWithTravelDetailsSchema,
      false,
      "Traveler + travel details update",
    ),
  },
  responses: {
    200: dataResponse(z.unknown(), "The updated traveler with travel details"),
    400: invalidRequestResponse,
    404: notFoundResponse("Traveler not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const updateTravelDetailsRoute = createRoute({
  method: "patch",
  path: "/{id}/travelers/{travelerId}/travel-details",
  request: {
    params: z.object({ id: z.string(), travelerId: z.string() }),
    body: jsonBody(upsertTravelerTravelDetailsSchema, true, "Travel details to upsert"),
  },
  responses: {
    200: dataResponse(z.unknown(), "The upserted travel details"),
    400: invalidRequestResponse,
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Traveler not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const updateTravelerRoute = createRoute({
  method: "patch",
  path: "/{id}/travelers/{travelerId}",
  request: {
    params: z.object({ id: z.string(), travelerId: z.string() }),
    body: jsonBody(updateTravelerSchema, false, "Partial traveler update"),
  },
  responses: {
    200: dataResponse(bookingTravelerSchema, "The updated traveler"),
    400: invalidRequestResponse,
    404: notFoundResponse("Traveler not found"),
  },
})

const deleteTravelDetailsRoute = createRoute({
  method: "delete",
  path: "/{id}/travelers/{travelerId}/travel-details",
  request: { params: z.object({ id: z.string(), travelerId: z.string() }) },
  responses: {
    200: deletedResponse("The travel details were deleted"),
    403: notFoundResponse("Forbidden"),
    404: notFoundResponse("Traveler or travel details not found"),
    500: notFoundResponse("Booking PII encryption is not configured"),
  },
})

const deleteTravelerRoute = createRoute({
  method: "delete",
  path: "/{id}/travelers/{travelerId}",
  request: { params: z.object({ id: z.string(), travelerId: z.string() }) },
  responses: {
    200: deletedResponse("The traveler was deleted"),
    404: notFoundResponse("Traveler not found"),
  },
})

const travelersWriteRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(createTravelerRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const body = c.req.valid("json")
        const ledgerContext = getActionLedgerRequestContext(c)
        const row = await c.get("db").transaction(async (tx) => {
          const txDb = tx as PostgresJsDatabase
          const row = await bookingsService.createTraveler(
            txDb,
            c.req.valid("param").id,
            body,
            c.get("userId"),
          )
          if (!row) return null
          await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
            action: "create",
            travelerId: row.id,
            changedFields: changedBookingTravelerFields(body, null, row),
            subject: "booking traveler",
            actionName: "booking.traveler.create",
            routeOrToolName: "bookings.travelers.create",
            evaluatedRisk: "high",
          })
          return row
        })
        if (!row) {
          return c.json({ error: "Booking not found" }, 404)
        }
        return c.json({ data: row }, 201)
      })(),
    ),
  )
  .openapi(createTravelerWithDetailsRoute, async (c) =>
    asRouteResponse(
      (async () => {
        try {
          const data = c.req.valid("json")
          const runtime = getRouteRuntime(c)
          const kms = await runtime.getKmsProvider()
          const pii = await createAuditedBookingPiiService(c, c.req.valid("param").id)
          const ledgerContext = getActionLedgerRequestContext(c)
          const result = await c.get("db").transaction(async (tx) => {
            const txDb = tx as PostgresJsDatabase
            const result = await bookingsService.createTravelerWithTravelDetails(
              txDb,
              c.req.valid("param").id,
              data,
              {
                pii,
                userId: c.get("userId"),
                actorId: c.get("userId"),
                resolveTravelSnapshot: runtime.resolveTravelSnapshot
                  ? (personId) => runtime.resolveTravelSnapshot!(txDb, personId, { kms })
                  : undefined,
              },
            )
            if (!result) return null
            await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
              action: "create",
              travelerId: result.traveler.id,
              changedFields: [
                ...new Set([
                  ...changedBookingTravelerFields(data, null, result.traveler),
                  ...changedBookingTravelDetailFields(data),
                ]),
              ].sort(),
              subject: "booking traveler with travel details",
              actionName: "booking.traveler_with_travel_details.create",
              routeOrToolName: "bookings.travelers.with-travel-details.create",
              evaluatedRisk: "high",
            })
            return result
          })
          if (!result) {
            return c.json({ error: "Booking not found" }, 404)
          }
          return c.json({ data: result }, 201)
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
      })(),
    ),
  )
  .openapi(updateTravelerWithDetailsRoute, async (c) =>
    asRouteResponse(
      (async () => {
        try {
          const bookingId = c.req.valid("param").id
          const travelerId = c.req.valid("param").travelerId
          const traveler = await bookingsService.getTravelerRecordById(
            c.get("db"),
            bookingId,
            travelerId,
          )
          if (!traveler) {
            return c.json({ error: "Traveler not found" }, 404)
          }
          const data = c.req.valid("json") ?? {}
          const pii = await createAuditedBookingPiiService(c, bookingId)
          const ledgerContext = getActionLedgerRequestContext(c)
          const result = await c.get("db").transaction(async (tx) => {
            const result = await bookingsService.updateTravelerWithTravelDetails(
              tx as PostgresJsDatabase,
              travelerId,
              data,
              { pii, actorId: c.get("userId") },
            )
            if (!result) return null
            await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
              action: "update",
              travelerId: result.traveler.id,
              changedFields: [
                ...new Set([
                  ...changedBookingTravelerFields(data, traveler, result.traveler),
                  ...changedBookingTravelDetailFields(data),
                ]),
              ].sort(),
              subject: "booking traveler with travel details",
              actionName: "booking.traveler_with_travel_details.update",
              routeOrToolName: "bookings.travelers.with-travel-details.update",
              evaluatedRisk: "high",
            })
            return result
          })
          if (!result) {
            return c.json({ error: "Traveler not found" }, 404)
          }
          return c.json({ data: result }, 200)
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
      })(),
    ),
  )
  .openapi(updateTravelDetailsRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const auth = await authorizeBookingPiiAccess(c, {
          bookingId: c.req.valid("param").id,
          travelerId: c.req.valid("param").travelerId,
          action: "update",
        })
        if (!auth.allowed) {
          return auth.response
        }
        const traveler = await bookingsService.getTravelerRecordById(
          c.get("db"),
          c.req.valid("param").id,
          c.req.valid("param").travelerId,
        )
        if (!traveler) {
          await logBookingPiiAccess(c, {
            bookingId: c.req.valid("param").id,
            travelerId: c.req.valid("param").travelerId,
            action: "update",
            outcome: "denied",
            reason: "participant_not_found",
          })
          return c.json({ error: "Traveler not found" }, 404)
        }
        try {
          const pii = await createAuditedBookingPiiService(c, traveler.bookingId)
          const body = c.req.valid("json")
          const ledgerContext = getActionLedgerRequestContext(c)
          const row = await c.get("db").transaction(async (tx) => {
            const row = await pii.upsertTravelerTravelDetails(
              tx as PostgresJsDatabase,
              traveler.id,
              body,
              c.get("userId"),
            )
            if (!row) return null
            await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
              action: "update",
              travelerId: traveler.id,
              changedFields: changedBookingTravelDetailFields(body),
              subject: "booking traveler travel details",
              actionName: "booking.traveler_travel_details.update",
              routeOrToolName: "bookings.travelers.travel-details.update",
              evaluatedRisk: "high",
            })
            return row
          })
          if (!row) {
            return c.json({ error: "Traveler not found" }, 404)
          }
          return c.json({ data: row }, 200)
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
      })(),
    ),
  )
  .openapi(updateTravelerRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const travelerId = c.req.valid("param").travelerId
        const before = await bookingsService.getTravelerRecordById(
          c.get("db"),
          bookingId,
          travelerId,
        )
        if (!before) {
          return c.json({ error: "Traveler not found" }, 404)
        }
        const body = c.req.valid("json") ?? {}
        const ledgerContext = getActionLedgerRequestContext(c)
        const row = await c.get("db").transaction(async (tx) => {
          const row = await bookingsService.updateTraveler(
            tx as PostgresJsDatabase,
            travelerId,
            body,
          )
          if (!row) return null
          await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
            action: "update",
            travelerId: row.id,
            changedFields: changedBookingTravelerFields(body, before, row),
            subject: "booking traveler",
            actionName: "booking.traveler.update",
            routeOrToolName: "bookings.travelers.update",
            evaluatedRisk: "high",
          })
          return row
        })
        if (!row) {
          return c.json({ error: "Traveler not found" }, 404)
        }
        return c.json({ data: row }, 200)
      })(),
    ),
  )
  .openapi(deleteTravelDetailsRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const auth = await authorizeBookingPiiAccess(c, {
          bookingId: c.req.valid("param").id,
          travelerId: c.req.valid("param").travelerId,
          action: "delete",
        })
        if (!auth.allowed) {
          return auth.response
        }
        const traveler = await bookingsService.getTravelerRecordById(
          c.get("db"),
          c.req.valid("param").id,
          c.req.valid("param").travelerId,
        )
        if (!traveler) {
          await logBookingPiiAccess(c, {
            bookingId: c.req.valid("param").id,
            travelerId: c.req.valid("param").travelerId,
            action: "delete",
            outcome: "denied",
            reason: "participant_not_found",
          })
          return c.json({ error: "Traveler not found" }, 404)
        }
        try {
          const pii = await createAuditedBookingPiiService(c, traveler.bookingId)
          const ledgerContext = getActionLedgerRequestContext(c)
          const row = await c.get("db").transaction(async (tx) => {
            const row = await pii.deleteTravelerTravelDetails(
              tx as PostgresJsDatabase,
              traveler.id,
              c.get("userId"),
            )
            if (!row) return null
            await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
              action: "delete",
              travelerId: traveler.id,
              changedFields: [],
              subject: "booking traveler travel details",
              actionName: "booking.traveler_travel_details.delete",
              routeOrToolName: "bookings.travelers.travel-details.delete",
              evaluatedRisk: "high",
            })
            return row
          })
          if (!row) {
            return c.json({ error: "Traveler travel details not found" }, 404)
          }
          return c.json({ success: true }, 200)
        } catch (error) {
          return handleKmsConfigError(c, error)
        }
      })(),
    ),
  )
  .openapi(deleteTravelerRoute, async (c) =>
    asRouteResponse(
      (async () => {
        const bookingId = c.req.valid("param").id
        const travelerId = c.req.valid("param").travelerId
        const before = await bookingsService.getTravelerRecordById(
          c.get("db"),
          bookingId,
          travelerId,
        )
        if (!before) {
          return c.json({ error: "Traveler not found" }, 404)
        }
        const ledgerContext = getActionLedgerRequestContext(c)
        const row = await c.get("db").transaction(async (tx) => {
          const row = await bookingsService.deleteTraveler(tx as PostgresJsDatabase, travelerId)
          if (!row) return null
          await appendBookingTravelerMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
            action: "delete",
            travelerId,
            changedFields: [],
            subject: "booking traveler",
            actionName: "booking.traveler.delete",
            routeOrToolName: "bookings.travelers.delete",
            evaluatedRisk: "high",
          })
          return row
        })
        if (!row) {
          return c.json({ error: "Traveler not found" }, 404)
        }
        return c.json({ success: true }, 200)
      })(),
    ),
  )

// ==========================================================================
// Items sub-chain
// ==========================================================================

const listItemsRoute = createRoute({
  method: "get",
  path: "/{id}/items",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingItemSchema), "Booking items"),
  },
})

const createItemRoute = createRoute({
  method: "post",
  path: "/{id}/items",
  request: {
    params: idParamSchema,
    body: jsonBody(insertBookingItemSchema, true, "Booking item to add"),
  },
  responses: {
    201: dataResponse(bookingItemSchema, "The created booking item"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
    409: conflictResponse("Booking item mutations are not allowed for this booking"),
  },
})

const updateItemRoute = createRoute({
  method: "patch",
  path: "/{id}/items/{itemId}",
  request: {
    params: z.object({ id: z.string(), itemId: z.string() }),
    body: jsonBody(updateBookingItemSchema, false, "Partial booking item update"),
  },
  responses: {
    200: dataResponse(bookingItemSchema, "The updated booking item"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking item not found"),
    409: conflictResponse("Booking item mutations are not allowed for this booking"),
  },
})

const deleteItemRoute = createRoute({
  method: "delete",
  path: "/{id}/items/{itemId}",
  request: { params: z.object({ id: z.string(), itemId: z.string() }) },
  responses: {
    200: deletedResponse("The booking item was deleted"),
    404: notFoundResponse("Booking item not found"),
    409: conflictResponse("Booking item mutations are not allowed for this booking"),
  },
})

const listItemTravelersRoute = createRoute({
  method: "get",
  path: "/{id}/items/{itemId}/travelers",
  request: { params: z.object({ id: z.string(), itemId: z.string() }) },
  responses: {
    200: dataResponse(z.array(bookingItemTravelerSchema), "Booking item travelers"),
  },
})

const linkItemTravelerRoute = createRoute({
  method: "post",
  path: "/{id}/items/{itemId}/travelers",
  request: {
    params: z.object({ id: z.string(), itemId: z.string() }),
    body: jsonBody(insertBookingItemTravelerSchema, true, "Traveler to link to item"),
  },
  responses: {
    201: dataResponse(bookingItemTravelerSchema, "The created item-traveler link"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking item or traveler not found"),
    409: conflictResponse("Booking item mutations are not allowed for this booking"),
  },
})

const unlinkItemTravelerRoute = createRoute({
  method: "delete",
  path: "/{id}/items/{itemId}/travelers/{linkId}",
  request: { params: z.object({ id: z.string(), itemId: z.string(), linkId: z.string() }) },
  responses: {
    200: deletedResponse("The item-traveler link was removed"),
    404: notFoundResponse("Booking item or item-traveler link not found"),
    409: conflictResponse("Booking item mutations are not allowed for this booking"),
  },
})

const itemsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listItemsRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listItems(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(createItemRoute, async (c) => {
    const blocked = await ensureBookingItemMutationsAllowed(c, c.req.valid("param").id)
    if (blocked) return blocked
    const body = c.req.valid("json")
    const ledgerContext = getActionLedgerRequestContext(c)
    const row = await c.get("db").transaction(async (tx) => {
      const row = await bookingsService.createItem(
        tx as PostgresJsDatabase,
        c.req.valid("param").id,
        body,
        c.get("userId"),
      )
      if (!row) return null
      await appendBookingMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
        action: "create",
        actionName: "booking.item.create",
        actionVersion: BOOKING_ITEM_LEDGER_ACTION_VERSION,
        targetType: "booking_item",
        targetId: row.id,
        changedFields: changedBookingItemFields(body, null, row),
        subject: "booking item",
        routeOrToolName: "bookings.items.create",
        evaluatedRisk: "high",
      })
      return row
    })
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateItemRoute, async (c) => {
    const bookingId = c.req.valid("param").id
    const itemId = c.req.valid("param").itemId
    const blocked = await ensureBookingItemMutationsAllowed(c, bookingId)
    if (blocked) return blocked
    const before =
      (await bookingsService.listItems(c.get("db"), bookingId)).find(
        (item) => item.id === itemId,
      ) ?? null
    if (!before) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    const body = c.req.valid("json") ?? {}
    const ledgerContext = getActionLedgerRequestContext(c)
    const row = await c.get("db").transaction(async (tx) => {
      const row = await bookingsService.updateItem(tx as PostgresJsDatabase, itemId, body)
      if (!row) return null
      await appendBookingMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
        action: "update",
        actionName: "booking.item.update",
        actionVersion: BOOKING_ITEM_LEDGER_ACTION_VERSION,
        targetType: "booking_item",
        targetId: row.id,
        changedFields: changedBookingItemFields(body, before, row),
        subject: "booking item",
        routeOrToolName: "bookings.items.update",
        evaluatedRisk: "high",
      })
      return row
    })
    if (!row) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteItemRoute, async (c) => {
    const bookingId = c.req.valid("param").id
    const itemId = c.req.valid("param").itemId
    const blocked = await ensureBookingItemMutationsAllowed(c, bookingId)
    if (blocked) return blocked
    const before =
      (await bookingsService.listItems(c.get("db"), bookingId)).find(
        (item) => item.id === itemId,
      ) ?? null
    if (!before) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    const ledgerContext = getActionLedgerRequestContext(c)
    const row = await c.get("db").transaction(async (tx) => {
      const row = await bookingsService.deleteItem(
        tx as PostgresJsDatabase,
        itemId,
        c.get("userId"),
      )
      if (!row) return null
      await appendBookingMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
        action: "delete",
        actionName: "booking.item.delete",
        actionVersion: BOOKING_ITEM_LEDGER_ACTION_VERSION,
        targetType: "booking_item",
        targetId: itemId,
        changedFields: [],
        subject: "booking item",
        routeOrToolName: "bookings.items.delete",
        evaluatedRisk: "high",
        summary: "Deleted booking item",
      })
      return row
    })
    if (!row) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })
  .openapi(listItemTravelersRoute, async (c) => {
    return c.json(
      {
        data: await bookingsService.listItemParticipants(c.get("db"), c.req.valid("param").itemId),
      },
      200,
    )
  })
  .openapi(linkItemTravelerRoute, async (c) => {
    const bookingId = c.req.valid("param").id
    const itemId = c.req.valid("param").itemId
    const blocked = await ensureBookingItemMutationsAllowed(c, bookingId)
    if (blocked) return blocked
    const item =
      (await bookingsService.listItems(c.get("db"), bookingId)).find((row) => row.id === itemId) ??
      null
    if (!item) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    const body = c.req.valid("json")
    const ledgerContext = getActionLedgerRequestContext(c)
    const row = await c.get("db").transaction(async (tx) => {
      const row = await bookingsService.addItemParticipant(tx as PostgresJsDatabase, itemId, body)
      if (!row) return null
      await appendBookingMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
        action: "create",
        actionName: "booking.item_traveler.create",
        actionVersion: BOOKING_ITEM_LEDGER_ACTION_VERSION,
        targetType: "booking_item",
        targetId: itemId,
        changedFields: changedBookingItemFields(body, null, row),
        subject: "booking item traveler link",
        routeOrToolName: "bookings.items.travelers.create",
        evaluatedRisk: "high",
        summary: "Linked traveler to booking item",
      })
      return row
    })
    if (!row) {
      return c.json({ error: "Booking item or traveler not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })
  .openapi(unlinkItemTravelerRoute, async (c) => {
    const bookingId = c.req.valid("param").id
    const itemId = c.req.valid("param").itemId
    const linkId = c.req.valid("param").linkId
    const blocked = await ensureBookingItemMutationsAllowed(c, bookingId)
    if (blocked) return blocked
    const item =
      (await bookingsService.listItems(c.get("db"), bookingId)).find((row) => row.id === itemId) ??
      null
    if (!item) {
      return c.json({ error: "Booking item not found" }, 404)
    }
    const before =
      (await bookingsService.listItemParticipants(c.get("db"), itemId)).find(
        (link) => link.id === linkId,
      ) ?? null
    if (!before) {
      return c.json({ error: "Booking item traveler link not found" }, 404)
    }
    const ledgerContext = getActionLedgerRequestContext(c)
    const row = await c.get("db").transaction(async (tx) => {
      const row = await bookingsService.removeItemParticipant(tx as PostgresJsDatabase, linkId)
      if (!row) return null
      await appendBookingMutationLedgerEntryToDb(tx as AnyDrizzleDb, ledgerContext, {
        action: "delete",
        actionName: "booking.item_traveler.delete",
        actionVersion: BOOKING_ITEM_LEDGER_ACTION_VERSION,
        targetType: "booking_item",
        targetId: itemId,
        changedFields: [],
        subject: "booking item traveler link",
        routeOrToolName: "bookings.items.travelers.delete",
        evaluatedRisk: "high",
        summary: "Unlinked traveler from booking item",
      })
      return row
    })
    if (!row) {
      return c.json({ error: "Booking item traveler link not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Supplier statuses sub-chain
// ==========================================================================

const listSupplierStatusesRoute = createRoute({
  method: "get",
  path: "/{id}/supplier-statuses",
  "x-voyant-api-id": "@voyant-travel/bookings#booking-supplier-extension.api",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingSupplierStatusSchema), "Booking supplier statuses"),
  },
})

const createSupplierStatusRoute = createRoute({
  method: "post",
  path: "/{id}/supplier-statuses",
  "x-voyant-api-id": "@voyant-travel/bookings#booking-supplier-extension.api",
  request: {
    params: idParamSchema,
    body: jsonBody(insertSupplierStatusSchema, true, "Supplier status to create"),
  },
  responses: {
    201: dataResponse(bookingSupplierStatusSchema, "The created supplier status"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const updateSupplierStatusRoute = createRoute({
  method: "patch",
  path: "/{id}/supplier-statuses/{statusId}",
  "x-voyant-api-id": "@voyant-travel/bookings#booking-supplier-extension.api",
  request: {
    params: z.object({ id: z.string(), statusId: z.string() }),
    body: jsonBody(updateSupplierStatusSchema, false, "Partial supplier status update"),
  },
  responses: {
    200: dataResponse(bookingSupplierStatusSchema, "The updated supplier status"),
    400: invalidRequestResponse,
    404: notFoundResponse("Supplier status not found"),
  },
})

const supplierStatusesRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listSupplierStatusesRoute, async (c) => {
    return c.json(
      {
        data: await bookingsService.listSupplierStatuses(c.get("db"), c.req.valid("param").id),
      },
      200,
    )
  })
  .openapi(createSupplierStatusRoute, async (c) => {
    const row = await bookingsService.createSupplierStatus(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateSupplierStatusRoute, async (c) => {
    const row = await bookingsService.updateSupplierStatus(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("param").statusId,
      c.req.valid("json") ?? {},
      c.get("userId"),
    )
    if (!row) {
      return c.json({ error: "Supplier status not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })

// ==========================================================================
// Fulfillments sub-chain
// ==========================================================================

const listFulfillmentsRoute = createRoute({
  method: "get",
  path: "/{id}/fulfillments",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingFulfillmentSchema), "Booking fulfillments"),
  },
})

const issueFulfillmentRoute = createRoute({
  method: "post",
  path: "/{id}/fulfillments",
  request: {
    params: idParamSchema,
    body: jsonBody(insertBookingFulfillmentSchema, true, "Fulfillment to issue"),
  },
  responses: {
    201: dataResponse(bookingFulfillmentSchema, "The issued fulfillment"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking, item, or traveler not found"),
  },
})

const updateFulfillmentRoute = createRoute({
  method: "patch",
  path: "/{id}/fulfillments/{fulfillmentId}",
  request: {
    params: z.object({ id: z.string(), fulfillmentId: z.string() }),
    body: jsonBody(updateBookingFulfillmentSchema, false, "Partial fulfillment update"),
  },
  responses: {
    200: dataResponse(bookingFulfillmentSchema, "The updated fulfillment"),
    400: invalidRequestResponse,
    404: notFoundResponse("Fulfillment, item, or traveler not found"),
  },
})

const fulfillmentsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listFulfillmentsRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listFulfillments(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(issueFulfillmentRoute, async (c) => {
    const row = await bookingsService.issueFulfillment(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (!row) {
      return c.json({ error: "Booking, item, or traveler not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateFulfillmentRoute, async (c) => {
    const row = await bookingsService.updateFulfillment(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("param").fulfillmentId,
      c.req.valid("json") ?? {},
      c.get("userId"),
    )
    if (!row) {
      return c.json({ error: "Fulfillment, item, or traveler not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })

// ==========================================================================
// Redemptions sub-chain
// ==========================================================================

const listRedemptionsRoute = createRoute({
  method: "get",
  path: "/{id}/redemptions",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingRedemptionEventSchema), "Booking redemption events"),
  },
})

const recordRedemptionRoute = createRoute({
  method: "post",
  path: "/{id}/redemptions",
  request: {
    params: idParamSchema,
    body: jsonBody(recordBookingRedemptionSchema, true, "Redemption to record"),
  },
  responses: {
    201: dataResponse(bookingRedemptionEventSchema, "The recorded redemption event"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking, item, or traveler not found"),
  },
})

const redemptionsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listRedemptionsRoute, async (c) => {
    return c.json(
      {
        data: await bookingsService.listRedemptionEvents(c.get("db"), c.req.valid("param").id),
      },
      200,
    )
  })
  .openapi(recordRedemptionRoute, async (c) => {
    const row = await bookingsService.recordRedemption(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (!row) {
      return c.json({ error: "Booking, item, or traveler not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })

// ==========================================================================
// Notes sub-chain
// ==========================================================================

const listNotesRoute = createRoute({
  method: "get",
  path: "/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingNoteSchema), "Booking notes"),
  },
})

const createNoteRoute = createRoute({
  method: "post",
  path: "/{id}/notes",
  request: {
    params: idParamSchema,
    body: jsonBody(insertBookingNoteSchema, true, "Note to add"),
  },
  responses: {
    201: dataResponse(bookingNoteSchema, "The created note"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const updateNoteRoute = createRoute({
  method: "patch",
  path: "/{id}/notes/{noteId}",
  request: {
    params: z.object({ id: z.string(), noteId: z.string() }),
    body: jsonBody(updateBookingNoteSchema, true, "Note edit"),
  },
  responses: {
    200: dataResponse(bookingNoteSchema, "The updated note"),
    400: invalidRequestResponse,
    404: notFoundResponse("Note not found"),
  },
})

const deleteNoteRoute = createRoute({
  method: "delete",
  path: "/{id}/notes/{noteId}",
  request: { params: z.object({ id: z.string(), noteId: z.string() }) },
  responses: {
    200: deletedResponse("The note was deleted"),
    404: notFoundResponse("Note not found"),
  },
})

const notesRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listNotesRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listNotes(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(createNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const bookingId = c.req.valid("param").id
    const row = await bookingsService.createNote(
      c.get("db"),
      bookingId,
      userId,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    await appendBookingMutationLedgerEntry(c, {
      action: "create",
      actionName: "booking.note.create",
      actionVersion: BOOKING_NOTE_LEDGER_ACTION_VERSION,
      targetType: "booking",
      targetId: bookingId,
      changedFields: ["content"],
      subject: "booking note",
      routeOrToolName: "bookings.notes.create",
      evaluatedRisk: "medium",
      summary: "Created booking note",
    })
    return c.json({ data: row }, 201)
  })
  .openapi(updateNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const bookingId = c.req.valid("param").id
    const noteId = c.req.valid("param").noteId
    const row = await bookingsService.updateNote(
      c.get("db"),
      bookingId,
      noteId,
      userId,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Note not found" }, 404)
    }
    await appendBookingMutationLedgerEntry(c, {
      action: "update",
      actionName: "booking.note.update",
      actionVersion: BOOKING_NOTE_LEDGER_ACTION_VERSION,
      targetType: "booking",
      targetId: bookingId,
      changedFields: ["content"],
      subject: "booking note",
      routeOrToolName: "bookings.notes.update",
      evaluatedRisk: "medium",
      summary: "Updated booking note",
    })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const bookingId = c.req.valid("param").id
    const row = await bookingsService.deleteNote(
      c.get("db"),
      bookingId,
      c.req.valid("param").noteId,
      userId,
    )
    if (!row) {
      return c.json({ error: "Note not found" }, 404)
    }
    await appendBookingMutationLedgerEntry(c, {
      action: "delete",
      actionName: "booking.note.delete",
      actionVersion: BOOKING_NOTE_LEDGER_ACTION_VERSION,
      targetType: "booking",
      targetId: bookingId,
      changedFields: [],
      subject: "booking note",
      routeOrToolName: "bookings.notes.delete",
      evaluatedRisk: "medium",
      summary: "Deleted booking note",
    })
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Documents sub-chain
// ==========================================================================

const listDocumentsRoute = createRoute({
  method: "get",
  path: "/{id}/documents",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(z.array(bookingDocumentSchema), "Booking documents"),
  },
})

const createDocumentRoute = createRoute({
  method: "post",
  path: "/{id}/documents",
  request: {
    params: idParamSchema,
    body: jsonBody(insertBookingDocumentSchema, true, "Document to add"),
  },
  responses: {
    201: dataResponse(bookingDocumentSchema, "The created document"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking not found"),
  },
})

const deleteDocumentRoute = createRoute({
  method: "delete",
  path: "/{id}/documents/{documentId}",
  request: { params: z.object({ id: z.string(), documentId: z.string() }) },
  responses: {
    200: deletedResponse("The document was deleted"),
    404: notFoundResponse("Document not found"),
  },
})

const documentsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDocumentsRoute, async (c) => {
    return c.json(
      { data: await bookingsService.listDocuments(c.get("db"), c.req.valid("param").id) },
      200,
    )
  })
  .openapi(createDocumentRoute, async (c) => {
    const row = await bookingsService.createDocument(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({ data: row }, 201)
  })
  .openapi(deleteDocumentRoute, async (c) => {
    const row = await bookingsService.deleteDocument(c.get("db"), c.req.valid("param").documentId)
    if (!row) {
      return c.json({ error: "Document not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Compose the booking admin surface
// ==========================================================================

// Composition order matters: `.route("/", child)` mounts each child as a
// separate sub-router tried in registration order, so cross-child
// static-vs-dynamic precedence is NOT auto-resolved. The static single-segment
// GET routes (`/aggregates`, `/overview`, `/sharing-groups`) and the static
// POST routes (`/expire-stale`, `/pricing-preview`) must be matched
// before the `coreCrudRoutes` `/{id}` catch-all — so coreCrud is mounted LAST.
export const bookingRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", bookingAmendmentAdminRoutes)
  .route("/", readsRoutes)
  .route("/", lifecycleRoutes)
  .route("/", actionLedgerRoutes)
  .route("/", travelersReadRoutes)
  .route("/", travelersWriteRoutes)
  .route("/", itemsRoutes)
  .route("/", supplierStatusesRoutes)
  .route("/", fulfillmentsRoutes)
  .route("/", redemptionsRoutes)
  .route("/", notesRoutes)
  .route("/", documentsRoutes)
  .route("/groups", bookingGroupRoutes)
  .route("/", coreCrudRoutes)

export type BookingRoutes = typeof bookingRoutes
export type PublicBookingRoutes = typeof publicBookingRoutes

export const __test__ = {
  bookingActionLedgerQuerySchema,
  bookingMutationSummary,
  buildBookingActionLedgerPage,
  changedBookingItemFields,
  changedBookingMutationFields,
  changedBookingTravelDetailFields,
  changedBookingTravelerFields,
  // OpenAPI response row schemas (voyant#2114 contract tests)
  bookingSchema,
  bookingTravelerSchema,
  bookingItemSchema,
  bookingItemTravelerSchema,
  bookingAllocationSchema,
  bookingSupplierStatusSchema,
  bookingFulfillmentSchema,
  bookingRedemptionEventSchema,
  bookingActivitySchema,
  bookingNoteSchema,
  bookingDocumentSchema,
  bookingDetailSchema,
  bookingAggregatesSchema,
  sharingGroupSummarySchema,
}
