/**
 * Admin card-dispute routes — mounted by the operator app under
 * `/v1/admin/finance/...` (voyant#4289).
 *
 * Two ways a dispute reaches the record: a verified adapter callback (handled
 * in `payment-adapter-events.ts`, not here), and an operator typing in a
 * chargeback they found in a processor console. This module is the second, plus
 * the reads that let a booking say it is contested.
 *
 * There is no evidence endpoint. Assembling and submitting evidence is
 * processor-specific and stays behind the payment adapter port; all the
 * framework records is `evidenceSubmittedAt` — that something was submitted,
 * and when — which PATCH accepts like any other field.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { Context } from "hono"

import { errorResponseSchema } from "./routes-invoice-schemas.js"
import { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { PaymentValidationError } from "./service.js"
import { financePaymentDisputeService } from "./service-payment-disputes.js"
import {
  bookingPaymentDisputesSchema,
  paymentDisputeListQuerySchema,
  paymentDisputeRecordSchema,
  recordPaymentDisputeSchema,
  updatePaymentDisputeSchema,
} from "./validation.js"

const idParamSchema = z.object({ id: z.string() })

const listPaymentDisputesRoute = createRoute({
  method: "get",
  path: "/payment-disputes",
  description:
    "Card disputes (chargebacks), newest first. Unrelated to the `disputed` " +
    "supplier-invoice status, which is an accounts-payable state.",
  request: { query: paymentDisputeListQuerySchema },
  responses: {
    200: {
      description: "Card disputes",
      content: { "application/json": { schema: listResponseSchema(paymentDisputeRecordSchema) } },
    },
  },
})

const getPaymentDisputeRoute = createRoute({
  method: "get",
  path: "/payment-disputes/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The dispute",
      content: { "application/json": { schema: z.object({ data: paymentDisputeRecordSchema }) } },
    },
    404: {
      description: "Dispute not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const recordPaymentDisputeRoute = createRoute({
  method: "post",
  path: "/payment-disputes",
  description:
    "Record a chargeback against the payment session it contests. Idempotent " +
    "on `(paymentSessionId, processorReference)`: a repeat report advances the " +
    "dispute it already recorded, and a different reference opens a second one.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: recordPaymentDisputeSchema } },
    },
  },
  responses: {
    201: {
      description: "The recorded dispute",
      content: { "application/json": { schema: z.object({ data: paymentDisputeRecordSchema }) } },
    },
    404: {
      description: "The contested payment session does not exist",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The contested amount exceeds the payment",
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), code: z.string() }),
        },
      },
    },
  },
})

const updatePaymentDisputeRoute = createRoute({
  method: "patch",
  path: "/payment-disputes/{id}",
  description:
    "Advance a dispute. `won`, `lost` and `withdrawn` are terminal and stamp " +
    "`resolvedAt`; a processor that contests the payment again issues a new " +
    "dispute rather than reviving this one.",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updatePaymentDisputeSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated dispute",
      content: { "application/json": { schema: z.object({ data: paymentDisputeRecordSchema }) } },
    },
    404: {
      description: "Dispute not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The dispute cannot move to that status",
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), code: z.string() }),
        },
      },
    },
  },
})

const listBookingPaymentDisputesRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/disputes",
  description:
    "What a booking's payments cannot say on their own. A contested payment " +
    "still reads `paid`, so `hasOpenDispute` is how a caller tells a cleanly " +
    "paid booking from one whose money is being taken back.",
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: "The booking's disputes and what is still contested",
      content: {
        "application/json": { schema: z.object({ data: bookingPaymentDisputesSchema }) },
      },
    },
  },
})

function disputeRuntime(c: Context<Env>) {
  const runtime = getFinanceRouteRuntime(c)
  return {
    eventBus: runtime?.eventBus,
    actionLedgerContext: getActionLedgerRequestContext(c),
    actionLedgerAuthorizationSource: "finance.payment_dispute.route",
  }
}

export const financePaymentDisputeRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .openapi(listPaymentDisputesRoute, async (c) =>
    c.json(
      await financePaymentDisputeService.listPaymentDisputes(c.get("db"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(recordPaymentDisputeRoute, async (c) => {
    try {
      const row = await financePaymentDisputeService.recordPaymentDispute(
        c.get("db"),
        c.req.valid("json"),
        disputeRuntime(c),
      )
      return row ? c.json({ data: row }, 201) : c.json({ error: "Payment session not found" }, 404)
    } catch (error) {
      if (error instanceof PaymentValidationError && error.status === 409) {
        return c.json({ error: error.message, code: error.code }, 409)
      }
      throw error
    }
  })
  .openapi(getPaymentDisputeRoute, async (c) => {
    const row = await financePaymentDisputeService.getPaymentDisputeById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Dispute not found" }, 404)
  })
  .openapi(updatePaymentDisputeRoute, async (c) => {
    try {
      const row = await financePaymentDisputeService.updatePaymentDispute(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        disputeRuntime(c),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Dispute not found" }, 404)
    } catch (error) {
      if (error instanceof PaymentValidationError && error.status === 409) {
        return c.json({ error: error.message, code: error.code }, 409)
      }
      throw error
    }
  })
  .openapi(listBookingPaymentDisputesRoute, async (c) =>
    c.json(
      {
        data: await financePaymentDisputeService.getBookingPaymentDisputes(
          c.get("db"),
          c.req.valid("param").bookingId,
        ),
      },
      200,
    ),
  )
