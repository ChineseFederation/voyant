import type { AnyDrizzleDb } from "@voyant-travel/db"
import { asc, eq } from "drizzle-orm"

import { bookingItems } from "./schema-items.js"

const DAY_MS = 86_400_000

export type BookingCancellationUnknownReason =
  | "policy_snapshot_missing"
  | "policy_snapshot_invalid"
  | "amount_missing"
  | "service_date_missing"
  | "currency_missing"
  | "currency_mismatch"
  | "mixed_currency"

export type BookingCancellationPolicyEvaluation =
  | {
      status: "evaluated"
      policyId: string
      policyVersionId: string
      version: number
      result: {
        refundPercent: number
        refundCents: number
        refundType: "cash" | "credit" | "cash_or_credit" | "none"
        appliedRule: unknown | null
      }
    }
  | { status: "unknown"; reason: "invalid_snapshot" | "currency_mismatch" }

export type BookingCancellationPolicyResult = Extract<
  BookingCancellationPolicyEvaluation,
  { status: "evaluated" }
>["result"]

export type BookingCancellationPolicyEvaluator = (
  snapshot: unknown,
  input: { daysBeforeDeparture: number; totalCents: number; currency: string },
) => BookingCancellationPolicyEvaluation | Promise<BookingCancellationPolicyEvaluation>

export interface BookingCancellationConsequenceItemInput {
  id: string
  title: string
  serviceDate: string | null
  startsAt: Date | null
  sellCurrency: string | null
  totalSellAmountCents: number | null
  cancellationTermsSnapshot: unknown | null
}

export interface BookingCancellationItemConsequence {
  bookingItemId: string
  title: string
  currency: string | null
  totalCents: number | null
  serviceDate: string | null
  daysBeforeDeparture: number | null
  policyId: string | null
  policyVersionId: string | null
  policyVersion: number | null
  status: "evaluated" | "manual_review"
  reason: BookingCancellationUnknownReason | null
  result: BookingCancellationPolicyResult | null
}

export interface BookingCancellationConsequences {
  status: "evaluated" | "manual_review"
  asOf: string
  currency: string | null
  totalCents: number
  refundCents: number | null
  knownRefundCents: number
  refundPercent: number | null
  refundType: "cash" | "credit" | "cash_or_credit" | "none" | "mixed" | "unknown"
  reasons: BookingCancellationUnknownReason[]
  items: BookingCancellationItemConsequence[]
}

export async function resolveBookingCancellationConsequences(
  items: readonly BookingCancellationConsequenceItemInput[],
  asOf: Date,
  evaluate: BookingCancellationPolicyEvaluator,
): Promise<BookingCancellationConsequences> {
  const consequences = await Promise.all(
    items.map((item) => resolveItemConsequence(item, asOf, evaluate)),
  )
  const reasons = [...new Set(consequences.flatMap((item) => (item.reason ? [item.reason] : [])))]
  const currencies = [
    ...new Set(consequences.flatMap((item) => (item.currency ? [item.currency] : []))),
  ]
  if (currencies.length > 1) reasons.push("mixed_currency")
  const manualReview = reasons.length > 0
  const totalCents = consequences.reduce((sum, item) => sum + (item.totalCents ?? 0), 0)
  const knownRefundCents = consequences.reduce(
    (sum, item) => sum + (item.result?.refundCents ?? 0),
    0,
  )
  const refundTypes = new Set(
    consequences
      .filter((item) => (item.result?.refundCents ?? 0) > 0)
      .flatMap((item) => (item.result ? [item.result.refundType] : [])),
  )

  return {
    status: manualReview ? "manual_review" : "evaluated",
    asOf: asOf.toISOString(),
    currency: currencies.length === 1 ? (currencies[0] ?? null) : null,
    totalCents,
    refundCents: manualReview ? null : knownRefundCents,
    knownRefundCents,
    refundPercent:
      manualReview || totalCents === 0
        ? manualReview
          ? null
          : 0
        : Math.floor((knownRefundCents * 10_000) / totalCents),
    refundType: manualReview
      ? "unknown"
      : refundTypes.size === 0
        ? "none"
        : refundTypes.size === 1
          ? ([...refundTypes][0] ?? "none")
          : "mixed",
    reasons,
    items: consequences,
  }
}

export async function resolveBookingCancellationConsequencesFromDb(
  db: AnyDrizzleDb,
  bookingId: string,
  asOf: Date,
  evaluate: BookingCancellationPolicyEvaluator,
) {
  const items = await db
    .select({
      id: bookingItems.id,
      title: bookingItems.title,
      serviceDate: bookingItems.serviceDate,
      startsAt: bookingItems.startsAt,
      sellCurrency: bookingItems.sellCurrency,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
      cancellationTermsSnapshot: bookingItems.cancellationTermsSnapshot,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id))
  return resolveBookingCancellationConsequences(items, asOf, evaluate)
}

async function resolveItemConsequence(
  item: BookingCancellationConsequenceItemInput,
  asOf: Date,
  evaluate: BookingCancellationPolicyEvaluator,
): Promise<BookingCancellationItemConsequence> {
  const serviceDate = item.serviceDate ?? item.startsAt?.toISOString().slice(0, 10) ?? null
  const daysBeforeDeparture = serviceDate ? daysBetween(asOf, serviceDate) : null
  const policy = policyFromSnapshot(item.cancellationTermsSnapshot)
  const reason = missingReason(item, serviceDate, policy)
  if (
    reason ||
    daysBeforeDeparture === null ||
    item.totalSellAmountCents === null ||
    !item.sellCurrency
  ) {
    return unknownItem(item, serviceDate, daysBeforeDeparture, reason ?? "policy_snapshot_invalid")
  }
  const evaluated = await evaluate(policy, {
    daysBeforeDeparture,
    totalCents: item.totalSellAmountCents,
    currency: item.sellCurrency,
  })
  if (evaluated.status === "unknown") {
    return unknownItem(
      item,
      serviceDate,
      daysBeforeDeparture,
      evaluated.reason === "currency_mismatch" ? "currency_mismatch" : "policy_snapshot_invalid",
    )
  }
  return {
    bookingItemId: item.id,
    title: item.title,
    currency: item.sellCurrency,
    totalCents: item.totalSellAmountCents,
    serviceDate,
    daysBeforeDeparture,
    policyId: evaluated.policyId,
    policyVersionId: evaluated.policyVersionId,
    policyVersion: evaluated.version,
    status: "evaluated",
    reason: null,
    result: evaluated.result,
  }
}

function missingReason(
  item: BookingCancellationConsequenceItemInput,
  serviceDate: string | null,
  policy: unknown,
): BookingCancellationUnknownReason | null {
  if (item.cancellationTermsSnapshot == null) return "policy_snapshot_missing"
  if (policy === undefined) return "policy_snapshot_invalid"
  if (item.totalSellAmountCents == null) return "amount_missing"
  if (!item.sellCurrency) return "currency_missing"
  if (!serviceDate) return "service_date_missing"
  return null
}

function policyFromSnapshot(snapshot: unknown): unknown | undefined {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined
  return Object.hasOwn(snapshot, "policy") ? (snapshot as { policy?: unknown }).policy : undefined
}

function unknownItem(
  item: BookingCancellationConsequenceItemInput,
  serviceDate: string | null,
  daysBeforeDeparture: number | null,
  reason: BookingCancellationUnknownReason,
): BookingCancellationItemConsequence {
  return {
    bookingItemId: item.id,
    title: item.title,
    currency: item.sellCurrency,
    totalCents: item.totalSellAmountCents,
    serviceDate,
    daysBeforeDeparture,
    policyId: null,
    policyVersionId: null,
    policyVersion: null,
    status: "manual_review",
    reason,
    result: null,
  }
}

function daysBetween(asOf: Date, serviceDate: string): number {
  const departure = Date.parse(`${serviceDate}T00:00:00.000Z`)
  return Math.floor((departure - asOf.getTime()) / DAY_MS)
}
