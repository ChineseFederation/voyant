import type { LegalContractRecord } from "./schemas.js"

/**
 * Whether this contract is a managed booking-contract revision — the shape
 * whose lifecycle is gated on the reviewed revision and content fingerprint
 * (voyant#4706).
 *
 * The generic contract detail redacts such a revision's body and variables but
 * keeps the workflow marker, which is what this reads. It is the UI's signal to
 * route Issue and Send through the review rather than firing them directly.
 */
export function isManagedBookingContractRevision(contract: LegalContractRecord): boolean {
  const metadata = contract.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const workflow = (metadata as Record<string, unknown>).bookingContractWorkflow
  return !!workflow && typeof workflow === "object" && !Array.isArray(workflow)
}
