/**
 * Admin refund-settlement routes — mounted by the operator app under
 * `/v1/admin/finance/...` (voyant#4303).
 *
 * The credit note says a refund is owed. These say it was paid: by what method,
 * to what reference, and whether it has arrived. Most refunds here never touch a
 * processor — a bank transfer, cash at a counter, a voucher, or a credit netted
 * against what a trade account owes.
 *
 * `POST /refund-settlements` runs the existing `finance:refund` capability, so
 * the same policy that governs issuing the credit note governs paying it. The
 * route returns `202` with the pending approval when policy requires one, and
 * `201` with the settlement when it does not — one endpoint, both outcomes, so
 * an operator UI needs one button rather than two flows.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { Context } from "hono"
import { financeToolActionLedgerContext } from "./mcp-runtime-shared.js"
import {
  authorizeFinanceRefundSettlement,
  type FinanceRefundSettlementAuthorizationResult,
} from "./refund-authorization.js"
import { errorResponseSchema } from "./routes-invoice-schemas.js"
import { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { PaymentValidationError } from "./service.js"
import { financeRefundSettlementService } from "./service-refund-settlements.js"
import {
  bookingRefundSettlementsSchema,
  paymentRefundableRemainderSchema,
  recordRefundSettlementSchema,
  refundSettlementListQuerySchema,
  refundSettlementRecordSchema,
  updateRefundSettlementSchema,
} from "./validation.js"

const idParamSchema = z.object({ id: z.string() })

/**
 * The authorization envelope, mirroring what `issue_invoice_refund` returns.
 * `approval_required` is not an error: it is the same request, parked.
 */
const pendingRefundApprovalSchema = z.object({
  status: z.literal("approval_required"),
  requestedAction: z.object({
    id: z.string(),
    status: z.string(),
    actionName: z.string(),
    targetType: z.string(),
    targetId: z.string().nullable(),
  }),
  approval: z.object({
    id: z.string(),
    status: z.string(),
    requestedActionId: z.string(),
    policyName: z.string(),
    policyVersion: z.string(),
    riskSnapshot: z.string(),
    reasonCode: z.string().nullable(),
    expiresAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  replayed: z.boolean(),
})

const recordRefundSettlementBodySchema = recordRefundSettlementSchema.safeExtend({
  /**
   * Required. The refund capability's approval policy is `required`, so a first
   * call without a key has nothing to make it replay-safe.
   */
  idempotencyKey: z.string().min(1).max(255),
  /** Supply the approval this executes, once it has been granted. */
  approvalId: z.string().min(1).optional(),
})

const listRefundSettlementsRoute = createRoute({
  method: "get",
  path: "/refund-settlements",
  description:
    "How refunds were actually paid back, newest first. `owed=true` narrows to " +
    "refunds that are owed and not yet settled — the normal state of a bank " +
    "transfer for a day or two.",
  request: { query: refundSettlementListQuerySchema },
  responses: {
    200: {
      description: "Refund settlements",
      content: { "application/json": { schema: listResponseSchema(refundSettlementRecordSchema) } },
    },
  },
})

const getRefundSettlementRoute = createRoute({
  method: "get",
  path: "/refund-settlements/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The settlement",
      content: { "application/json": { schema: z.object({ data: refundSettlementRecordSchema }) } },
    },
    404: {
      description: "Settlement not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const recordRefundSettlementRoute = createRoute({
  method: "post",
  path: "/refund-settlements",
  description:
    "Record that a refund was paid, or that paying it has started. The method " +
    "need not be a card: bank transfer, cash, cheque, travel credit, voucher " +
    "and an offset against a counterparty balance are all first-class. " +
    "Authorized by `finance:refund` — the same capability that governs issuing " +
    "the credit note. Returns 202 with the pending approval when policy " +
    "requires one.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: recordRefundSettlementBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The recorded settlement",
      content: { "application/json": { schema: z.object({ data: refundSettlementRecordSchema }) } },
    },
    202: {
      description: "The refund needs approval before the money moves",
      content: { "application/json": { schema: pendingRefundApprovalSchema } },
    },
    403: {
      description: "The caller may not refund",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "What the settlement claims to reverse does not exist",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The amount exceeds what is still refundable",
      content: {
        "application/json": { schema: z.object({ error: z.string(), code: z.string() }) },
      },
    },
  },
})

const updateRefundSettlementRoute = createRoute({
  method: "patch",
  path: "/refund-settlements/{id}",
  description:
    "Advance a settlement — the transfer landed, or the processor declined. " +
    "`settled` and `failed` are terminal: a refund that failed is retried by " +
    "recording a new settlement, never by reviving the one that failed.",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateRefundSettlementSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated settlement",
      content: { "application/json": { schema: z.object({ data: refundSettlementRecordSchema }) } },
    },
    404: {
      description: "Settlement not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The settlement cannot move to that status",
      content: {
        "application/json": { schema: z.object({ error: z.string(), code: z.string() }) },
      },
    },
  },
})

const executeRefundSettlementRoute = createRoute({
  method: "post",
  path: "/refund-settlements/{id}/execute",
  description:
    "Drive a `processor_reversal` settlement through the payment adapter. The " +
    "outcome is recorded on the settlement, including a failure after the " +
    "processor accepted it. An indeterminate outcome deliberately leaves the " +
    "settlement pending and its amount held, so a retry cannot refund twice.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The settlement after the adapter answered",
      content: {
        "application/json": {
          schema: z.object({
            data: refundSettlementRecordSchema,
            outcome: z.enum(["settled", "pending", "failed", "indeterminate", "not_applicable"]),
            reason: z.string().optional(),
          }),
        },
      },
    },
    404: {
      description: "Settlement not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    501: {
      description: "This deployment has no payment adapter that can refund",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const paymentRefundableRoute = createRoute({
  method: "get",
  path: "/payments/{paymentId}/refundable",
  description:
    "How much of a payment may still be refunded. Refunds that are pending are " +
    "subtracted alongside those that settled — an in-flight refund holds its " +
    "amount until it is positively known to have failed.",
  request: { params: z.object({ paymentId: z.string() }) },
  responses: {
    200: {
      description: "The refundable remainder",
      content: {
        "application/json": { schema: z.object({ data: paymentRefundableRemainderSchema }) },
      },
    },
    404: {
      description: "Payment not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listBookingRefundSettlementsRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/refund-settlements",
  description:
    "What a booking's credit notes cannot say on their own. An issued credit " +
    "note reads the same whether or not anyone paid it, so `hasOwedRefund` is " +
    "how a caller tells a refunded booking from one that is still owed money.",
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: "The booking's refund settlements and what is still owed",
      content: {
        "application/json": { schema: z.object({ data: bookingRefundSettlementsSchema }) },
      },
    },
  },
})

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function settlementRuntime(c: Context<Env>) {
  const runtime = getFinanceRouteRuntime(c)
  return {
    eventBus: runtime?.eventBus,
    actionLedgerContext: getActionLedgerRequestContext(c),
    actionLedgerAuthorizationSource: "finance.refund_settlement.route",
  }
}

function pendingApprovalBody(
  authorization: Extract<
    FinanceRefundSettlementAuthorizationResult,
    { status: "approval_required" }
  >,
) {
  return {
    status: "approval_required" as const,
    requestedAction: {
      id: authorization.requestedAction.id,
      status: authorization.requestedAction.status,
      actionName: authorization.requestedAction.actionName,
      targetType: authorization.requestedAction.targetType,
      targetId: authorization.requestedAction.targetId,
    },
    approval: {
      id: authorization.approval.id,
      status: authorization.approval.status,
      requestedActionId: authorization.approval.requestedActionId,
      policyName: authorization.approval.policyName,
      policyVersion: authorization.approval.policyVersion,
      riskSnapshot: authorization.approval.riskSnapshot,
      reasonCode: authorization.approval.reasonCode,
      expiresAt: toIsoString(authorization.approval.expiresAt),
      createdAt: toIsoString(authorization.approval.createdAt) ?? "",
    },
    replayed: authorization.replayed,
  }
}

export const financeRefundSettlementRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .openapi(listRefundSettlementsRoute, async (c) =>
    c.json(
      await financeRefundSettlementService.listRefundSettlements(c.get("db"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(recordRefundSettlementRoute, async (c) => {
    const body = c.req.valid("json")
    const db = c.get("db")
    const { idempotencyKey, approvalId, ...settlement } = body

    const authorization = await authorizeFinanceRefundSettlement({
      db,
      targetType: settlement.creditNoteId ? "credit_note" : "payment",
      // `creditNoteId ?? paymentId` is total: the body schema rejects a
      // settlement that names neither.
      targetId: (settlement.creditNoteId ?? settlement.paymentId) as string,
      commandInput: settlement,
      actor: c.get("actor"),
      callerType: c.get("callerType"),
      scopes: c.get("scopes"),
      isInternalRequest: c.get("isInternalRequest"),
      // The unconditional form of the same context. `getActionLedgerRequestContext`
      // returns undefined when there is no principal at all, and a refund denial
      // has to be ledgered even then — that is the record of who tried.
      requestContext: financeToolActionLedgerContext(c),
      approvalId: approvalId ?? null,
      idempotencyKey,
    })

    if (authorization.status === "approval_required") {
      return c.json(pendingApprovalBody(authorization), 202)
    }
    if (authorization.status === "already_executed") {
      const existing = await financeRefundSettlementService.getRefundSettlementById(
        db,
        authorization.refundSettlementId,
      )
      return existing
        ? c.json({ data: existing }, 201)
        : c.json({ error: "The previously recorded refund settlement was not found" }, 404)
    }
    if (authorization.status !== "authorized") {
      return c.json({ error: refundSettlementAuthorizationError(authorization) }, 403)
    }

    try {
      const row = await financeRefundSettlementService.recordRefundSettlement(
        db,
        {
          ...settlement,
          idempotencyKey,
          // Null on the direct path: the caller held the grant, so there is no
          // approval to point at and the ledger records who executed instead.
          approvalId: authorization.approvedAction?.approvalId ?? null,
          requestedActionId: authorization.approvedAction?.requestedActionId ?? null,
          authorizedByUserId: settlement.authorizedByUserId ?? c.get("userId") ?? null,
        },
        {
          ...settlementRuntime(c),
          actionLedgerCapabilityId: authorization.access.capabilityId,
          actionLedgerCapabilityVersion: authorization.access.capabilityVersion,
          actionLedgerAuthorizationSource: authorization.access.authorizationSource,
          actionLedgerCausationActionId: authorization.approvedAction?.requestedActionId ?? null,
          actionLedgerApprovalId: authorization.approvedAction?.approvalId ?? null,
          actionLedgerIdempotencyScope: authorization.execution.idempotencyScope,
          actionLedgerIdempotencyKey: authorization.execution.idempotencyKey,
          actionLedgerIdempotencyFingerprint: authorization.execution.idempotencyFingerprint,
        },
      )
      return row
        ? c.json({ data: row }, 201)
        : c.json({ error: "The credit note, payment or session being refunded was not found" }, 404)
    } catch (error) {
      if (error instanceof PaymentValidationError && error.status === 409) {
        return c.json({ error: error.message, code: error.code }, 409)
      }
      throw error
    }
  })
  .openapi(getRefundSettlementRoute, async (c) => {
    const row = await financeRefundSettlementService.getRefundSettlementById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Refund settlement not found" }, 404)
  })
  .openapi(updateRefundSettlementRoute, async (c) => {
    try {
      const row = await financeRefundSettlementService.updateRefundSettlement(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        settlementRuntime(c),
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Refund settlement not found" }, 404)
    } catch (error) {
      if (error instanceof PaymentValidationError && error.status === 409) {
        return c.json({ error: error.message, code: error.code }, 409)
      }
      throw error
    }
  })
  .openapi(executeRefundSettlementRoute, async (c) => {
    const executeRefundSettlement = getFinanceRouteRuntime(c)?.executeRefundSettlement
    if (!executeRefundSettlement) {
      return c.json({ error: "This deployment has no payment adapter that can refund" }, 501)
    }
    const result = await executeRefundSettlement({
      bindings: c.env,
      db: c.get("db"),
      refundSettlementId: c.req.valid("param").id,
      eventBus: c.var.eventBus,
    })
    if (!result.settlement) return c.json({ error: "Refund settlement not found" }, 404)
    return c.json(
      {
        data: result.settlement,
        outcome: result.outcome,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      200,
    )
  })
  .openapi(paymentRefundableRoute, async (c) => {
    const remainder = await financeRefundSettlementService.getPaymentRefundableRemainder(
      c.get("db"),
      c.req.valid("param").paymentId,
    )
    return remainder
      ? c.json({ data: remainder }, 200)
      : c.json({ error: "Payment not found" }, 404)
  })
  .openapi(listBookingRefundSettlementsRoute, async (c) =>
    c.json(
      {
        data: await financeRefundSettlementService.getBookingRefundSettlements(
          c.get("db"),
          c.req.valid("param").bookingId,
        ),
      },
      200,
    ),
  )

function refundSettlementAuthorizationError(
  authorization: Exclude<
    FinanceRefundSettlementAuthorizationResult,
    { status: "authorized" | "approval_required" | "already_executed" }
  >,
) {
  switch (authorization.status) {
    case "denied":
      return "Refund settlement is not authorized."
    case "missing_idempotency_key":
      return "Refund settlement requires an idempotency key."
    case "idempotency_conflict":
      return authorization.message
    default:
      return "The approval does not authorize this exact refund settlement."
  }
}
