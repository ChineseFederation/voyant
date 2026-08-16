import { z } from "zod"
import { insuranceDocumentSchema } from "./document.js"

/**
 * A pre-contractual obligation attached to an insurance offer.
 *
 * Selling insurance carries duties that page copy does not discharge: the
 * product information document has to be shown before purchase, the insurer's
 * terms have to be the version in force at that moment, and the customer's
 * demands and needs have to be stated. Each of those has to be evidenced per
 * sale and reproducible years later, when the evidence is what answers a
 * dispute. So a disclosure travels with the offer, carrying the document and
 * the version it is, and the acceptance of it is recorded against the booking.
 */
export const INSURANCE_DISCLOSURE_KINDS = [
  "product_information",
  "insurer_terms",
  "demands_and_needs",
  "complaints_information",
  "other",
] as const

export type InsuranceDisclosureKind = (typeof INSURANCE_DISCLOSURE_KINDS)[number]

export const insuranceDisclosureKindSchema = z.enum(INSURANCE_DISCLOSURE_KINDS)

export const insuranceDisclosureSchema = z
  .object({
    kind: insuranceDisclosureKindSchema,
    /** How the disclosure is named to the traveller, already localised. */
    label: z.string().min(1),
    /**
     * The insurer's identifier for the revision in force right now. Insurers
     * change these without notice, so it is captured at sale time; resolving it
     * later reads whatever has replaced it.
     */
    versionId: z.string().min(1),
    document: insuranceDocumentSchema,
    /**
     * `true` when the traveller cannot proceed without acknowledging it. A
     * disclosure that is merely informational still has to be *available*, but
     * does not gate the sale.
     */
    required: z.boolean(),
  })
  .strict()

export type InsuranceDisclosure = z.infer<typeof insuranceDisclosureSchema>

/** Every disclosure that gates the sale. */
export function requiredDisclosures(
  disclosures: readonly InsuranceDisclosure[],
): InsuranceDisclosure[] {
  return disclosures.filter((disclosure) => disclosure.required)
}

/**
 * The disclosures a caller still has to collect, given what it already holds.
 *
 * Acceptance is keyed on `(kind, versionId)` together: an acceptance of last
 * month's wording is not an acceptance of this month's, and treating it as one
 * is exactly the failure this whole shape exists to prevent.
 */
export function outstandingDisclosures(
  disclosures: readonly InsuranceDisclosure[],
  accepted: readonly { kind: InsuranceDisclosureKind; versionId: string }[],
): InsuranceDisclosure[] {
  const seen = new Set(accepted.map((entry) => `${entry.kind}::${entry.versionId}`))
  return requiredDisclosures(disclosures).filter(
    (disclosure) => !seen.has(`${disclosure.kind}::${disclosure.versionId}`),
  )
}
