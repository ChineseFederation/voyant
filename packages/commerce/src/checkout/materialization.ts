export { rebuildBookingItemTaxLines } from "./materialization-tax.js"

export interface DraftPayload {
  billing?: {
    contact?: {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
    }
    address?: {
      country?: string
      city?: string
      line1?: string
      line2?: string
      postal?: string
    }
  }
  configure?: {
    pax?: { adult?: number; child?: number; infant?: number }
    departureSlotId?: string
    departureDate?: string
    dateRange?: { checkIn?: string; checkOut?: string }
  }
  travelers?: Array<{
    rowId?: string
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    band?: string
    dateOfBirth?: string
    nationality?: string
    documentType?: "passport" | "id_card" | "driver_license" | "visa" | "other"
    documentNumber?: string
    documentExpiry?: string
    passportNumber?: string
    passportExpiry?: string
    passportExpiresAt?: string
    dietaryRequirements?: string
    accessibilityNeeds?: string
    preferredLanguage?: string
    specialRequests?: string
    isPrimary?: boolean
    isLeadTraveler?: boolean
    documents?: Record<string, unknown>
  }>
  entity?: { module?: string; id?: string }
  internalNotes?: string
}

/**
 * Snapshot subset `materializeChildren` reads from. The catalog table
 * has more columns (idempotency_key, captured_at, etc.), but children
 * materialization only needs the parts that drive line items + supplier
 * statuses.
 */
export type MaterializationSnapshot = {
  /** Snapshot id — stamped on each `booking_items.source_snapshot_id`. */
  id?: string
  entity_module: string
  entity_id: string
  source_kind: string
  source_provider: string | null
  source_ref: string | null
  frozen_payload: Record<string, unknown> | null
  pricing_base_amount: string | null
  pricing_taxes: string | null
  pricing_fees: string | null
  pricing_surcharges: string | null
  pricing_currency: string | null
}
