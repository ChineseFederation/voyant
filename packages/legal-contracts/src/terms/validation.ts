import { z } from "zod"
import {
  hasLegalTargetOrCompatibilityRef,
  legalTargetListQueryFieldsSchema,
  legalTargetRefFieldsSchema,
} from "../targets/validation.js"

/**
 * Term kinds that carry a pre-contractual insurance obligation.
 *
 * These are not disclaimers in page copy. Each one has to be evidenced per sale
 * and reproducible years later: the wording the traveller actually saw, in the
 * revision the insurer had published at that moment. Insurers re-version and
 * replace their documents without notice, so a URL is not evidence — an
 * archived artifact plus the insurer's own version identifier is.
 */
export const INSURER_DISCLOSURE_TERM_TYPES = [
  "insurer_product_information",
  "insurer_terms",
  "demands_and_needs",
] as const

export type InsurerDisclosureTermType = (typeof INSURER_DISCLOSURE_TERM_TYPES)[number]

export const legalTermTypeSchema = z.enum([
  "terms_and_conditions",
  "cancellation",
  "guarantee",
  "payment",
  "pricing",
  "commission",
  // Keep in step with INSURER_DISCLOSURE_TERM_TYPES above and with the
  // `legal_term_type` pgEnum in `@voyant-travel/legal`.
  "insurer_product_information",
  "insurer_terms",
  "demands_and_needs",
  "other",
])

export type LegalTermType = z.infer<typeof legalTermTypeSchema>

export const insurerDisclosureTermTypeSchema = z.enum(INSURER_DISCLOSURE_TERM_TYPES)

export function isInsurerDisclosureTermType(value: unknown): value is InsurerDisclosureTermType {
  return (
    typeof value === "string" &&
    (INSURER_DISCLOSURE_TERM_TYPES as readonly string[]).includes(value)
  )
}

export const legalTermAcceptanceStatusSchema = z.enum([
  "not_required",
  "pending",
  "accepted",
  "declined",
])

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

function optionalNullableString(schema: z.ZodString = z.string()) {
  return z
    .union([z.literal("").transform(() => undefined), schema])
    .optional()
    .nullable()
}

const legalTermCoreSchema = z.object({
  contractId: optionalNullableString(),
  policyVersionId: optionalNullableString(),
  ...legalTargetRefFieldsSchema.shape,
  termType: legalTermTypeSchema.default("terms_and_conditions"),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  language: z.string().max(35).optional().nullable(),
  required: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  acceptanceStatus: legalTermAcceptanceStatusSchema.default("pending"),
  acceptedAt: z.string().optional().nullable(),
  acceptedBy: z.string().max(255).optional().nullable(),
  /**
   * The insurer's own identifier for the revision in force when this row was
   * written. Captured at sale time because resolving it later reads whatever
   * has replaced it.
   */
  sourceVersionId: optionalNullableString(z.string().trim().min(1).max(255)),
  /** Storage key of the artifact archived from the insurer's document. */
  archivedStorageKey: optionalNullableString(z.string().trim().min(1).max(1024)),
  /** `sha256:<hex>` over the exact archived bytes. */
  archivedChecksum: optionalNullableString(z.string().trim().min(1).max(255)),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

/** The shape the archival invariant is decided from — nothing else matters. */
export interface LegalTermArchivalFields {
  termType?: string | null
  sourceVersionId?: string | null
  archivedStorageKey?: string | null
}

function isBlank(value: string | null | undefined) {
  return value === null || value === undefined || value.trim().length === 0
}

/**
 * The archival invariant, in one place so the zod schemas, the service, and the
 * database CHECK constraint all say the same thing.
 *
 * Returns the reason a row is invalid, or `null` when it is fine. A row that
 * names one of the insurer-disclosure kinds without an archived artifact looks
 * configured and is not: at dispute time it resolves to whatever the insurer
 * serves that day.
 */
export function legalTermArchivalViolation(term: LegalTermArchivalFields): string | null {
  if (!isInsurerDisclosureTermType(term.termType)) return null
  const missing: string[] = []
  if (isBlank(term.sourceVersionId)) missing.push("sourceVersionId")
  if (isBlank(term.archivedStorageKey)) missing.push("archivedStorageKey")
  if (missing.length === 0) return null
  return `A "${term.termType}" legal term must carry ${missing.join(" and ")}: the insurer's wording has to be pinned and archived at sale time, because the source is replaced without notice.`
}

function addArchivalIssue(
  term: LegalTermArchivalFields,
  ctx: z.RefinementCtx,
  path: "sourceVersionId" | "archivedStorageKey" | "termType" = "termType",
) {
  const violation = legalTermArchivalViolation(term)
  if (violation) ctx.addIssue({ code: "custom", message: violation, path: [path] })
}

export const insertLegalTermSchema = legalTermCoreSchema
  .refine(hasLegalTargetOrCompatibilityRef, {
    message: "targetKind/targetId or an explicit legacyTransaction*Id field is required",
    path: ["targetKind"],
  })
  .superRefine((value, ctx) => {
    addArchivalIssue(value, ctx)
  })

/**
 * A patch cannot see the row it lands on, so it can only reject what is
 * self-evidently wrong here: naming an insurer-disclosure kind while the same
 * patch blanks the archive fields it depends on. The row-aware check lives in
 * the service (which merges patch over row) and the database CHECK is the
 * backstop for every other writer.
 */
export const updateLegalTermSchema = legalTermCoreSchema.partial().superRefine((value, ctx) => {
  if (!isInsurerDisclosureTermType(value.termType)) return
  if ("sourceVersionId" in value && isBlank(value.sourceVersionId)) {
    addArchivalIssue(value, ctx, "sourceVersionId")
    return
  }
  if ("archivedStorageKey" in value && isBlank(value.archivedStorageKey)) {
    addArchivalIssue(value, ctx, "archivedStorageKey")
  }
})

export const legalTermListQuerySchema = paginationSchema.extend({
  contractId: z.string().optional(),
  policyVersionId: z.string().optional(),
  ...legalTargetListQueryFieldsSchema.shape,
  termType: legalTermTypeSchema.optional(),
  acceptanceStatus: legalTermAcceptanceStatusSchema.optional(),
  sourceVersionId: z.string().optional(),
})

/**
 * Acceptance of an already-archived disclosure.
 *
 * Deliberately carries no version: the version is whatever the stored row was
 * archived from. Letting a caller name one here would be a second source of
 * truth, and the whole point is that there is exactly one.
 */
export const acceptLegalTermSchema = z.object({
  acceptedBy: z.string().trim().min(1).max(255),
  acceptedAt: z.string().datetime().optional(),
})
