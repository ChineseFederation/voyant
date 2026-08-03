import type { AnyDrizzleDb } from "@voyant-travel/db"
import type {
  BookingActionLedgerDriftCheck,
  CheckBookingActionLedgerDriftInput,
  CheckBookingActionLedgerDriftResult,
} from "./action-ledger-drift.js"
import { checkBookingActionLedgerDrift } from "./action-ledger-drift.js"

const BACKFILL_ACTION_BY_CHECK = {
  booking_cancelled: {
    actionName: "booking.status.cancel",
    targetType: "booking",
    targetIdKind: "booking_id",
  },
  booking_completed: {
    actionName: "booking.status.complete",
    targetType: "booking",
    targetIdKind: "booking_id",
  },
  booking_item: {
    actionName: "booking.item.create",
    targetType: "booking_item",
    targetIdKind: "booking_item_id",
  },
  booking_traveler: {
    actionName: "booking.traveler.create",
    targetType: "booking_traveler",
    targetIdKind: "booking_traveler_id",
  },
  booking_traveler_travel_details: {
    actionName: "booking.traveler_travel_details.update",
    targetType: "booking_traveler",
    targetIdKind: "booking_traveler_id",
  },
} as const satisfies Record<
  BookingActionLedgerDriftCheck,
  {
    actionName: string
    targetType: string
    targetIdKind: string
  }
>

export interface BookingActionLedgerDriftRemediationItem {
  check: BookingActionLedgerDriftCheck
  missingCount: number
  sampleTargetIds: string[]
  sampleTruncated: boolean
  recommendedBackfillActionName: string
  targetType: string
  targetIdKind: string
  mode: "dry_run"
  note: string
}

export interface BookingActionLedgerDriftRemediationPlan {
  mode: "dry_run"
  generatedAt: string
  createdAtFrom: string | null
  sampleLimit: number | null
  totalMissingCount: number
  items: BookingActionLedgerDriftRemediationItem[]
}

export interface BuildBookingActionLedgerDriftRemediationPlanInput {
  drift: CheckBookingActionLedgerDriftResult
  createdAtFrom?: CheckBookingActionLedgerDriftInput["createdAtFrom"]
  sampleLimit?: number | null
  generatedAt?: Date | string
}

export async function planBookingActionLedgerDriftRemediation(
  db: AnyDrizzleDb,
  input: CheckBookingActionLedgerDriftInput = {},
): Promise<BookingActionLedgerDriftRemediationPlan> {
  const drift = await checkBookingActionLedgerDrift(db, input)
  return buildBookingActionLedgerDriftRemediationPlan({
    drift,
    createdAtFrom: input.createdAtFrom,
    sampleLimit: input.sampleLimit,
  })
}

export function buildBookingActionLedgerDriftRemediationPlan({
  drift,
  createdAtFrom,
  sampleLimit,
  generatedAt = new Date(),
}: BuildBookingActionLedgerDriftRemediationPlanInput): BookingActionLedgerDriftRemediationPlan {
  const generatedAtDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt)
  if (Number.isNaN(generatedAtDate.getTime())) {
    throw new Error("generatedAt must be a valid date")
  }

  const items = drift.rows
    .filter((row) => row.missingCount > 0)
    .map((row): BookingActionLedgerDriftRemediationItem => {
      const action = BACKFILL_ACTION_BY_CHECK[row.check]
      return {
        check: row.check,
        missingCount: row.missingCount,
        sampleTargetIds: row.sampleIds,
        sampleTruncated: row.missingCount > row.sampleIds.length,
        recommendedBackfillActionName: action.actionName,
        targetType: action.targetType,
        targetIdKind: action.targetIdKind,
        mode: "dry_run",
        note: "Dry run only. Review source rows and choose an explicit historical actor before writing backfill ledger entries.",
      }
    })

  return {
    mode: "dry_run",
    generatedAt: generatedAtDate.toISOString(),
    createdAtFrom: normalizeNullableDate(createdAtFrom),
    sampleLimit: sampleLimit ?? null,
    totalMissingCount: items.reduce((sum, item) => sum + item.missingCount, 0),
    items,
  }
}

function normalizeNullableDate(value: CheckBookingActionLedgerDriftInput["createdAtFrom"]) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("createdAtFrom must be a valid date")
  }
  return date.toISOString()
}
