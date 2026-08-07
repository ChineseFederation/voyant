import {
  type CancellationPolicySnapshotV1,
  cancellationPolicySnapshotV1Schema,
} from "@voyant-travel/legal-contracts"
import { listResponse } from "@voyant-travel/types"
import { inArray } from "drizzle-orm"
import type { z } from "zod"
import type {
  evaluateCancellationInputSchema,
  insertPolicyAcceptanceSchema,
  insertPolicyAssignmentSchema,
  insertPolicyRuleSchema,
  insertPolicySchema,
  insertPolicyVersionSchema,
  policyAcceptanceListQuerySchema,
  policyAssignmentListQuerySchema,
  policyListQuerySchema,
  resolvePolicyInputSchema,
  updatePolicyAssignmentSchema,
  updatePolicyRuleSchema,
  updatePolicySchema,
  updatePolicyVersionSchema,
} from "./validation.js"

export type PolicyListQuery = z.infer<typeof policyListQuerySchema>
export type CreatePolicyInput = z.infer<typeof insertPolicySchema>
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>
export type CreatePolicyVersionInput = z.infer<typeof insertPolicyVersionSchema>
export type UpdatePolicyVersionInput = z.infer<typeof updatePolicyVersionSchema>
export type CreatePolicyRuleInput = z.infer<typeof insertPolicyRuleSchema>
export type UpdatePolicyRuleInput = z.infer<typeof updatePolicyRuleSchema>
export type CreatePolicyAssignmentInput = z.infer<typeof insertPolicyAssignmentSchema>
export type UpdatePolicyAssignmentInput = z.infer<typeof updatePolicyAssignmentSchema>
export type PolicyAssignmentListQuery = z.infer<typeof policyAssignmentListQuerySchema>
export type CreatePolicyAcceptanceInput = z.infer<typeof insertPolicyAcceptanceSchema>
export type PolicyAcceptanceListQuery = z.infer<typeof policyAcceptanceListQuerySchema>
export type EvaluateCancellationInput = z.infer<typeof evaluateCancellationInputSchema>
export type ResolvePolicyInput = z.infer<typeof resolvePolicyInputSchema>

export async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])
  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}

export function toDateString(value?: string | null): string | null {
  return value ?? null
}

export type CancellationRule = {
  id?: string
  daysBeforeDeparture: number | null
  refundPercent: number | null
  refundType: "cash" | "credit" | "cash_or_credit" | "none" | null
  flatAmountCents: number | null
  currency?: string | null
  label: string | null
}

export type CancellationResult = {
  refundPercent: number
  refundCents: number
  refundType: "cash" | "credit" | "cash_or_credit" | "none"
  appliedRule: CancellationRule | null
}

export type CancellationSnapshotEvaluation =
  | {
      status: "evaluated"
      policyId: string
      policyVersionId: string
      version: number
      result: CancellationResult
    }
  | { status: "unknown"; reason: "invalid_snapshot" | "currency_mismatch" }

/** Evaluate only immutable terms; never resolves a policy's current version. */
export function evaluateCancellationSnapshot(
  snapshot: unknown,
  input: EvaluateCancellationInput,
): CancellationSnapshotEvaluation {
  const parsed = cancellationPolicySnapshotV1Schema.safeParse(snapshot)
  if (!parsed.success) return { status: "unknown", reason: "invalid_snapshot" }

  const result = evaluateCancellationPolicy(parsed.data.rules, input)
  const appliedCurrency = result.appliedRule?.currency
  if (
    result.appliedRule?.flatAmountCents != null &&
    appliedCurrency &&
    input.currency !== appliedCurrency
  ) {
    return { status: "unknown", reason: "currency_mismatch" }
  }
  return {
    status: "evaluated",
    policyId: parsed.data.policyId,
    policyVersionId: parsed.data.policyVersionId,
    version: parsed.data.version,
    result,
  }
}

export type { CancellationPolicySnapshotV1 }

export function evaluateCancellationPolicy(
  rules: CancellationRule[],
  input: EvaluateCancellationInput,
): CancellationResult {
  if (rules.length === 0) {
    return { refundPercent: 0, refundCents: 0, refundType: "none", appliedRule: null }
  }

  const sorted = [...rules].sort((a, b) => {
    const ad = a.daysBeforeDeparture ?? Number.NEGATIVE_INFINITY
    const bd = b.daysBeforeDeparture ?? Number.NEGATIVE_INFINITY
    return bd - ad
  })

  const applied =
    sorted.find(
      (rule) =>
        rule.daysBeforeDeparture !== null && input.daysBeforeDeparture >= rule.daysBeforeDeparture,
    ) ??
    sorted[sorted.length - 1] ??
    null

  if (!applied) {
    return { refundPercent: 0, refundCents: 0, refundType: "none", appliedRule: null }
  }

  const refundPercent = applied.refundPercent ?? 0
  const refundType = applied.refundType ?? "none"
  const percentageRefundCents = Math.floor((input.totalCents * refundPercent) / 10000)
  const refundCents = applied.flatAmountCents ?? percentageRefundCents

  return { refundPercent, refundCents, refundType, appliedRule: applied }
}

/**
 * One revenue line in a multi-segment cancellation. Each segment carries
 * its own rule set + own amount; segments that share a policy still need
 * to be passed in separately so the per-segment refund tracks the
 * specific line item.
 */
export type CancellationSegment = {
  /** Optional caller-supplied id — typically the booking_item id. */
  id?: string
  /** Optional human-readable label (e.g. "Deluxe room, 3 nights"). */
  label?: string
  rules: CancellationRule[]
  totalCents: number
}

export type SegmentedCancellationInput = {
  daysBeforeDeparture: number
  currency?: string
  segments: CancellationSegment[]
}

export type SegmentedCancellationResult = {
  /** Σ(segments.totalCents). */
  totalCents: number
  /** Σ(per-segment refundCents). */
  refundCents: number
  /** Aggregate refund as basis points: refundCents / totalCents × 10000. */
  refundPercent: number
  /**
   * "mixed" when the segments resolve to different refundTypes (e.g. one
   * segment is `cash` and another is `none`). When all non-zero
   * segments resolve to the same refundType, that value is preserved.
   * "none" when every segment resolves to 0 refund.
   */
  refundType: "cash" | "credit" | "cash_or_credit" | "none" | "mixed"
  segments: Array<{
    id?: string
    label?: string
    totalCents: number
    result: CancellationResult
  }>
}

/**
 * Evaluate a multi-segment cancellation. Each segment runs through
 * {@link evaluateCancellationPolicy} with the shared
 * `daysBeforeDeparture`; per-segment refunds are summed and a coarse
 * `refundType` is computed for the aggregate.
 *
 * Use case: hotel bookings with mid-stay room changes where each
 * `stay_booking_items.ratePlanId` carries a different
 * `cancellationPolicyId` (e.g. flexible Deluxe + non-refundable Suite).
 * The customer cancels and we owe a partial refund — the flexible
 * portion's refundCents + 0 from the non-refundable portion.
 *
 * Pure: no I/O. Caller resolves rules from policy IDs first (see
 * {@link policiesService.evaluateMultiPolicyCancellation} for the DB
 * variant).
 */
export function evaluateSegmentedCancellation(
  input: SegmentedCancellationInput,
): SegmentedCancellationResult {
  const totalCents = input.segments.reduce((sum, segment) => sum + segment.totalCents, 0)

  const segmentResults = input.segments.map((segment) => ({
    id: segment.id,
    label: segment.label,
    totalCents: segment.totalCents,
    result: evaluateCancellationPolicy(segment.rules, {
      daysBeforeDeparture: input.daysBeforeDeparture,
      totalCents: segment.totalCents,
      currency: input.currency,
    }),
  }))

  const refundCents = segmentResults.reduce((sum, segment) => sum + segment.result.refundCents, 0)
  const refundPercent = totalCents > 0 ? Math.floor((refundCents * 10000) / totalCents) : 0

  const nonZeroTypes = new Set<string>(
    segmentResults
      .filter((segment) => segment.result.refundCents > 0)
      .map((segment) => segment.result.refundType),
  )

  let refundType: SegmentedCancellationResult["refundType"]
  if (nonZeroTypes.size === 0) {
    refundType = "none"
  } else if (nonZeroTypes.size === 1) {
    refundType = [...nonZeroTypes][0] as SegmentedCancellationResult["refundType"]
  } else {
    refundType = "mixed"
  }

  return {
    totalCents,
    refundCents,
    refundPercent,
    refundType,
    segments: segmentResults,
  }
}

export const _unused = inArray
