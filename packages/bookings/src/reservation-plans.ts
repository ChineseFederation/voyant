export type BookingReservationPlanLineKind =
  | "catalog_backed"
  | "non_catalog"
  | "manual_placeholder"
  | "external_order"

export type BookingReservationPlanStatus = "reserved" | "failed"

export interface BookingReservationPlanOrigin {
  source: "trips" | "accepted_proposal_version" | "direct_b2c" | string
  tripEnvelopeId?: string | null
  tripSnapshotId?: string | null
  proposalId?: string | null
  proposalVersionId?: string | null
  commercialSnapshotIds?: string[]
  metadata?: Record<string, unknown>
}

export interface BookingReservationPlanLine<TLine> {
  planLineId: string
  componentId: string
  kind: BookingReservationPlanLineKind
  line: TLine
}

export interface SubmitBookingReservationPlanInput<TEnvelope, TLine> {
  reservationPlanId: string
  idempotencyKey?: string | null
  origin?: BookingReservationPlanOrigin
  envelope: TEnvelope
  lines: BookingReservationPlanLine<TLine>[]
}

export interface BookingReservationPlanLineContext<TEnvelope, TLine> {
  plan: SubmitBookingReservationPlanInput<TEnvelope, TLine>
  line: BookingReservationPlanLine<TLine>
}

export interface BookingReservationPlanLineResult {
  status: "held" | "booked"
  bookingId?: string
  bookingGroupId?: string
  orderId?: string
  paymentSessionId?: string
  providerRef?: string
  supplierRef?: string
  holdToken?: string
  holdExpiresAt?: string
  warnings?: string[]
}

export interface BookingReservationPlanReleaseResult {
  released: boolean
  reason?: string
}

export interface SubmitBookingReservationPlanRuntime<
  TEnvelope,
  TLine,
  TResult extends BookingReservationPlanLineResult = BookingReservationPlanLineResult,
> {
  reserveCatalogBackedLine: (
    input: BookingReservationPlanLineContext<TEnvelope, TLine>,
  ) => Promise<TResult>
  reserveNonCatalogLine?: (
    input: BookingReservationPlanLineContext<TEnvelope, TLine>,
  ) => Promise<TResult | null | undefined>
  releaseReservedLine?: (
    input: BookingReservationPlanLineContext<TEnvelope, TLine> & { result: TResult },
  ) => Promise<BookingReservationPlanReleaseResult>
}

export interface SubmittedBookingReservationPlanLine<
  TResult extends BookingReservationPlanLineResult = BookingReservationPlanLineResult,
> {
  planLineId: string
  componentId: string
  status: TResult["status"]
  result: TResult
}

export interface BookingReservationPlanFailure {
  componentId: string
  reason: string
  code?: string
  details?: Record<string, unknown>
}

export interface BookingReservationPlanCompensation {
  componentId: string
  status: "released" | "release_failed" | "release_not_configured"
  reason?: string
}

export interface SubmitBookingReservationPlanResult<
  TResult extends BookingReservationPlanLineResult = BookingReservationPlanLineResult,
> {
  reservationPlanId: string
  status: BookingReservationPlanStatus
  reserved: SubmittedBookingReservationPlanLine<TResult>[]
  failures: BookingReservationPlanFailure[]
  compensations: BookingReservationPlanCompensation[]
  warnings: string[]
}

type ReservedLine<TLine, TResult extends BookingReservationPlanLineResult> = {
  line: BookingReservationPlanLine<TLine>
  result: TResult
  internalHold: boolean
}

export async function submitBookingReservationPlan<
  TEnvelope,
  TLine,
  TResult extends BookingReservationPlanLineResult = BookingReservationPlanLineResult,
>(
  plan: SubmitBookingReservationPlanInput<TEnvelope, TLine>,
  runtime: SubmitBookingReservationPlanRuntime<TEnvelope, TLine, TResult>,
): Promise<SubmitBookingReservationPlanResult<TResult>> {
  const warnings = new Set<string>()
  const reserved: Array<ReservedLine<TLine, TResult>> = []

  for (const line of plan.lines) {
    try {
      const { result, internalHold } = await reservePlanLine(plan, line, runtime)
      reserved.push({ line, result, internalHold })
      for (const warning of result.warnings ?? []) warnings.add(warning)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "reservation_failed"
      warnings.add(reason)
      const compensations = await compensateReservedPlanLines(plan, reserved, runtime)
      for (const compensation of compensations) {
        if (compensation.status !== "released") warnings.add(compensation.status)
      }
      return {
        reservationPlanId: plan.reservationPlanId,
        status: "failed",
        reserved: toSubmittedLines(reserved),
        failures: [{ componentId: line.componentId, reason }],
        compensations,
        warnings: [...warnings],
      }
    }
  }

  return {
    reservationPlanId: plan.reservationPlanId,
    status: "reserved",
    reserved: toSubmittedLines(reserved),
    failures: [],
    compensations: [],
    warnings: [...warnings],
  }
}

async function reservePlanLine<TEnvelope, TLine, TResult extends BookingReservationPlanLineResult>(
  plan: SubmitBookingReservationPlanInput<TEnvelope, TLine>,
  line: BookingReservationPlanLine<TLine>,
  runtime: SubmitBookingReservationPlanRuntime<TEnvelope, TLine, TResult>,
): Promise<{ result: TResult; internalHold: boolean }> {
  if (line.kind === "catalog_backed") {
    return {
      result: await runtime.reserveCatalogBackedLine({ plan, line }),
      internalHold: false,
    }
  }

  const result = await runtime.reserveNonCatalogLine?.({ plan, line })
  if (result) return { result, internalHold: false }

  return {
    result: { status: "held" } as TResult,
    internalHold: true,
  }
}

async function compensateReservedPlanLines<
  TEnvelope,
  TLine,
  TResult extends BookingReservationPlanLineResult,
>(
  plan: SubmitBookingReservationPlanInput<TEnvelope, TLine>,
  reserved: Array<ReservedLine<TLine, TResult>>,
  runtime: SubmitBookingReservationPlanRuntime<TEnvelope, TLine, TResult>,
): Promise<BookingReservationPlanCompensation[]> {
  const compensations: BookingReservationPlanCompensation[] = []

  for (const item of [...reserved].reverse()) {
    if (item.internalHold) {
      compensations.push({ componentId: item.line.componentId, status: "released" })
      continue
    }

    if (!runtime.releaseReservedLine) {
      compensations.push({
        componentId: item.line.componentId,
        status: "release_not_configured",
        reason: "release_not_configured",
      })
      continue
    }

    try {
      const released = await runtime.releaseReservedLine({
        plan,
        line: item.line,
        result: item.result,
      })
      if (released.released) {
        compensations.push({ componentId: item.line.componentId, status: "released" })
      } else {
        compensations.push({
          componentId: item.line.componentId,
          status: "release_failed",
          reason: released.reason ?? "release_failed",
        })
      }
    } catch (error) {
      compensations.push({
        componentId: item.line.componentId,
        status: "release_failed",
        reason: error instanceof Error ? error.message : "release_failed",
      })
    }
  }

  return compensations
}

function toSubmittedLines<TLine, TResult extends BookingReservationPlanLineResult>(
  reserved: Array<ReservedLine<TLine, TResult>>,
): SubmittedBookingReservationPlanLine<TResult>[] {
  return reserved.map((item) => ({
    planLineId: item.line.planLineId,
    componentId: item.line.componentId,
    status: item.result.status,
    result: item.result,
  }))
}
