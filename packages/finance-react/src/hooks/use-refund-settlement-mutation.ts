"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantFinanceContext } from "../provider.js"
import { financeQueryKeys } from "../query-keys.js"
import { refundSettlementRecordSchema } from "../schemas.js"

export type RefundSettlementMethod =
  | "processor_reversal"
  | "bank_transfer"
  | "cash"
  | "cheque"
  | "travel_credit"
  | "voucher"
  | "counterparty_offset"
  | "other"

export type RefundSettlementStatus = "pending" | "settled" | "failed"

export interface RecordRefundSettlementInput {
  creditNoteId?: string | null
  paymentId?: string | null
  invoiceId?: string | null
  paymentSessionId?: string | null
  method: RefundSettlementMethod
  status?: RefundSettlementStatus
  amountCents: number
  currency?: string | null
  instrumentAmountCents?: number | null
  instrumentCurrency?: string | null
  travelCreditId?: string | null
  counterpartyOrganizationId?: string | null
  counterpartyPersonId?: string | null
  externalReference?: string | null
  notes?: string | null
  /** Scoped to the payment. A retry carrying the same key settles once. */
  idempotencyKey: string
  /** Supply the approval once it has been granted. */
  approvalId?: string
}

export interface UpdateRefundSettlementInput {
  status?: RefundSettlementStatus
  externalReference?: string | null
  settledAt?: string | null
  failedAt?: string | null
  failureReason?: string | null
  notes?: string | null
}

/**
 * `POST /refund-settlements` answers with one of two things, and both are
 * successes. The union is the point: an operator's refund is one button whether
 * or not policy demands a review, and the dialog switches on `status` rather
 * than on an error.
 */
const recordRefundSettlementResponse = z.union([
  z.object({ data: refundSettlementRecordSchema }),
  z.object({
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
  }),
])

export type RecordRefundSettlementResult = z.infer<typeof recordRefundSettlementResponse>

const refundSettlementSingleResponse = z.object({ data: refundSettlementRecordSchema })

const executeRefundSettlementResponse = z.object({
  data: refundSettlementRecordSchema,
  outcome: z.enum(["settled", "pending", "failed", "indeterminate", "not_applicable"]),
  reason: z.string().optional(),
})

export type ExecuteRefundSettlementResult = z.infer<typeof executeRefundSettlementResponse>

export function isRefundSettlementApprovalRequired(
  result: RecordRefundSettlementResult,
): result is Extract<RecordRefundSettlementResult, { status: "approval_required" }> {
  return "status" in result && result.status === "approval_required"
}

function invalidateRefundScopes(
  queryClient: ReturnType<typeof useQueryClient>,
  bookingId: string | null,
  paymentId: string | null,
) {
  if (bookingId) {
    void queryClient.invalidateQueries({
      queryKey: financeQueryKeys.bookingRefundSettlements(bookingId),
    })
  }
  if (paymentId) {
    void queryClient.invalidateQueries({
      queryKey: financeQueryKeys.paymentRefundableRemainder(paymentId),
    })
  }
  // A refund changes what the booking is worth, so the payment panels on the
  // same screen are stale too. Prefix invalidation — the response does not
  // carry every key that displays it.
  void queryClient.invalidateQueries({
    queryKey: [...financeQueryKeys.all, "admin-booking-payments"],
  })
}

/**
 * Recording, advancing and driving the money leg of a refund (voyant#4303).
 *
 * `record` is authorized by `finance:refund` — the same capability that governs
 * issuing the credit note — so it can come back `approval_required`. That is not
 * an error and must not be surfaced as one: the caller re-submits the identical
 * input plus `approvalId` once the approval is granted.
 *
 * `execute` drives a `processor_reversal` through the deployment's payment
 * adapter and returns what the processor said, including `indeterminate` — which
 * leaves the settlement owed and its amount held rather than pretending to know.
 */
export function useRefundSettlementMutation() {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const queryClient = useQueryClient()

  const record = useMutation({
    mutationFn: async (input: RecordRefundSettlementInput) =>
      fetchWithValidation(
        "/v1/admin/finance/refund-settlements",
        recordRefundSettlementResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: (result) => {
      if (isRefundSettlementApprovalRequired(result)) return
      invalidateRefundScopes(queryClient, result.data.bookingId, result.data.paymentId)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateRefundSettlementInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/refund-settlements/${id}`,
        refundSettlementSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => invalidateRefundScopes(queryClient, data.bookingId, data.paymentId),
  })

  const execute = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/finance/refund-settlements/${id}/execute`,
        executeRefundSettlementResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      ),
    onSuccess: (result) =>
      invalidateRefundScopes(queryClient, result.data.bookingId, result.data.paymentId),
  })

  return { record, update, execute }
}
