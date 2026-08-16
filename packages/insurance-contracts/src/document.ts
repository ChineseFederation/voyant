import { z } from "zod"
import { insuranceInstantSchema } from "./money.js"

/**
 * The kinds of paperwork an insurance sale produces.
 *
 * `product_information` and `insurer_terms` are pre-contractual: they must be
 * available *before* the traveller buys. `policy_certificate` is what the
 * traveller receives afterwards and carries to the destination.
 */
export const INSURANCE_DOCUMENT_KINDS = [
  "policy_certificate",
  "policy_schedule",
  "product_information",
  "insurer_terms",
  "demands_and_needs",
  "complaints_information",
  "invoice",
  "other",
] as const

export type InsuranceDocumentKind = (typeof INSURANCE_DOCUMENT_KINDS)[number]

export const insuranceDocumentKindSchema = z.enum(INSURANCE_DOCUMENT_KINDS)

/**
 * Where the bytes are.
 *
 * A `url` source is only good for as long as the insurer keeps serving it, and
 * insurers version their documents without notice. Anything that has to be
 * reproducible years later — everything evidencing a sale — must be fetched and
 * archived at sale time rather than stored as a link. The discriminator exists
 * so a caller cannot accidentally treat one as the other.
 */
export const insuranceDocumentSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("url"),
      url: z.string().url(),
      /** After this instant the URL may serve something else, or nothing. */
      expiresAt: insuranceInstantSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inline"),
      /** Base64-encoded bytes. */
      contentBase64: z.string().min(1),
    })
    .strict(),
])

export type InsuranceDocumentSource = z.infer<typeof insuranceDocumentSourceSchema>

export const insuranceDocumentSchema = z
  .object({
    documentId: z.string().min(1),
    kind: insuranceDocumentKindSchema,
    /** Display name for the traveller, including the extension. */
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    source: insuranceDocumentSourceSchema,
    /**
     * The insurer's identifier for *this* revision of the document. Captured at
     * sale time and never recomputed, because it is the only thing that says
     * which wording the traveller actually agreed to.
     */
    versionId: z.string().optional(),
    /** SHA-256 of the bytes, prefixed `sha256:`, when the provider states one. */
    checksum: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/, "checksum must be sha256:<64 hex chars>")
      .optional(),
    language: z.string().optional(),
    issuedAt: insuranceInstantSchema.optional(),
  })
  .strict()

export type InsuranceDocument = z.infer<typeof insuranceDocumentSchema>

/** True when the document's bytes are already in hand rather than behind a URL. */
export function isArchivableInsuranceDocument(document: InsuranceDocument): boolean {
  return document.source.kind === "inline"
}
