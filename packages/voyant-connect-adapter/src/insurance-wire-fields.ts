/**
 * Decoding the leaves of a Connect insurance response.
 *
 * Connect has no insurance vertical, so nothing upstream is typed and every
 * field here arrives as `unknown`. These decoders are deliberately forgiving
 * about what is missing and strict about what is required: an optional field
 * that cannot be read is dropped, a required one that cannot be read makes the
 * whole value undefined so the caller can decide whether that is a refusal to
 * show or a call to fail.
 *
 * Vocabulary the contracts own — cover categories, document kinds, disclosure
 * kinds, eligibility reason codes — is listed here so the wire can carry it
 * verbatim. Anything outside a list is mapped to the contract's own catch-all
 * rather than invented, and the insurer's original string is preserved wherever
 * the contract has somewhere to put it.
 */

import type {
  InsuranceApplicationStatus,
  InsuranceContractingParty,
  InsuranceInsuredPerson,
  InsuranceQuestion,
} from "@voyant-travel/insurance-contracts/application"
import type {
  InsuranceCover,
  InsuranceCoverCategory,
  InsuranceOptionalCover,
} from "@voyant-travel/insurance-contracts/cover"
import type {
  InsuranceDisclosure,
  InsuranceDisclosureKind,
} from "@voyant-travel/insurance-contracts/disclosure"
import type {
  InsuranceDocument,
  InsuranceDocumentKind,
  InsuranceDocumentSource,
} from "@voyant-travel/insurance-contracts/document"
import type {
  InsuranceEligibility,
  InsuranceEligibilityReason,
  InsuranceEligibilityReasonCode,
} from "@voyant-travel/insurance-contracts/eligibility"
import type { InsuranceMoney } from "@voyant-travel/insurance-contracts/money"
import type {
  InsurancePolicyCancellation,
  InsurancePolicyFailure,
  InsurancePolicyIssueState,
} from "@voyant-travel/insurance-contracts/policy"

import { numberValue, recordValue, stringValue } from "./utils.js"

/** Prefer a namespaced `insurance` payload; fall back to the row itself. */
export function insurancePayload(value: unknown): Record<string, unknown> | undefined {
  const row = recordValue(value)
  return recordValue(row?.insurance) ?? row
}

export function policyPayload(value: unknown): Record<string, unknown> | undefined {
  const row = insurancePayload(value)
  return recordValue(row?.policy) ?? row
}

export function decodeList<T>(value: unknown, decode: (row: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    const decoded = decode(row)
    return decoded ? [decoded] : []
  })
}

export function decodeMoney(value: unknown): InsuranceMoney | undefined {
  const row = recordValue(value)
  const amountMinor = numberValue(row?.amountMinor)
  const currency = stringValue(row?.currency)
  if (amountMinor === undefined || !Number.isInteger(amountMinor) || !currency) return undefined
  return { amountMinor, currency: currency.toUpperCase() }
}

export function decodeEligibility(value: unknown): InsuranceEligibility {
  const row = recordValue(value)
  const raw = stringValue(row?.status)?.toLowerCase()
  const reasons = decodeList(row?.reasons, (entry) => decodeEligibilityReason(entry, raw))
  const status =
    raw === "eligible" || raw === "available" || raw === "ok"
      ? "eligible"
      : raw === "referral" || raw === "refer"
        ? "referral"
        : raw === undefined && reasons.length === 0
          ? "eligible"
          : "ineligible"
  if (status === "eligible") return { status, reasons: [] }
  // A refusal without a reason is unexplainable to the traveller, which is the
  // one thing eligibility-as-data exists to prevent.
  return {
    status,
    reasons:
      reasons.length > 0
        ? reasons
        : [
            {
              code: "provider_declined",
              message: "The insurer did not state why it declined this cover.",
              subject: { kind: "policy" },
            },
          ],
  }
}

function decodeEligibilityReason(
  value: unknown,
  status: string | undefined,
): InsuranceEligibilityReason | undefined {
  const row = recordValue(value)
  if (!row) return undefined
  const raw = stringValue(row.code)
  const message =
    stringValue(row.message) ?? stringValue(row.detail) ?? "The insurer declined this cover."
  const subject = recordValue(row.subject)
  const subjectKind = stringValue(subject?.kind)
  const subjectRef = stringValue(subject?.ref)
  const providerReasonCode = stringValue(row.providerReasonCode) ?? raw
  return {
    code: reasonCode(raw, status),
    message,
    subject: {
      kind:
        subjectKind === "trip" ||
        subjectKind === "traveler" ||
        subjectKind === "cover" ||
        subjectKind === "policy"
          ? subjectKind
          : subjectRef
            ? "traveler"
            : "policy",
      ...(subjectRef ? { ref: subjectRef } : {}),
    },
    ...(providerReasonCode ? { providerReasonCode } : {}),
  }
}

/**
 * Every code the contract defines, listed so the wire can carry them verbatim.
 *
 * Anything else keeps its original string in `providerReasonCode` and is
 * classified as `provider_declined` on a refusal or `other` otherwise —
 * inventing a code would be worse than admitting the insurer said something
 * this adapter does not understand.
 */
const REASON_CODES = [
  "trip_duration_exceeds_limit",
  "trip_starts_too_soon",
  "trip_starts_too_late",
  "purchase_window_closed",
  "traveler_age_above_maximum",
  "traveler_age_below_minimum",
  "party_size_exceeds_limit",
  "destination_not_covered",
  "residency_not_covered",
  "trip_cost_above_limit",
  "sum_insured_above_limit",
  "cover_not_available",
  "medical_declaration_required",
  "provider_declined",
  "other",
] as const satisfies readonly InsuranceEligibilityReasonCode[]

function reasonCode(
  raw: string | undefined,
  status: string | undefined,
): InsuranceEligibilityReasonCode {
  const known = REASON_CODES.find((code) => code === raw)
  if (known) return known
  return status === "eligible" ? "other" : "provider_declined"
}

const COVER_CATEGORIES = [
  "medical_expenses",
  "emergency_assistance",
  "repatriation",
  "trip_cancellation",
  "trip_curtailment",
  "travel_delay",
  "missed_departure",
  "baggage",
  "personal_money",
  "personal_liability",
  "personal_accident",
  "legal_expenses",
  "winter_sports",
  "adventure_activities",
  "business_equipment",
  "gadget",
  "rental_vehicle_excess",
  "other",
] as const satisfies readonly InsuranceCoverCategory[]

const LIMIT_BASES = ["per_person", "per_policy", "per_item", "per_day", "per_claim"] as const

export function decodeCover(value: unknown): InsuranceCover | undefined {
  const row = recordValue(value)
  const label = stringValue(row?.label) ?? stringValue(row?.title)
  if (!row || !label) return undefined
  const sumInsured = decodeMoney(row.sumInsured)
  const excess = decodeMoney(row.excess)
  const limitBasis = LIMIT_BASES.find((basis) => basis === row.limitBasis)
  const notes = stringValue(row.notes)
  return {
    category: COVER_CATEGORIES.find((category) => category === row.category) ?? "other",
    label,
    included: row.included !== false,
    ...(sumInsured ? { sumInsured } : {}),
    ...(limitBasis ? { limitBasis } : {}),
    ...(excess ? { excess } : {}),
    ...(notes ? { notes } : {}),
  }
}

export function decodeOptionalCover(value: unknown): InsuranceOptionalCover | undefined {
  const row = recordValue(value)
  const base = decodeCover(value)
  const id = stringValue(row?.id)
  const premium = decodeMoney(row?.premium)
  if (!base || !id || !premium) return undefined
  const { included: _included, ...cover } = base
  return { ...cover, id, premium }
}

const DISCLOSURE_KINDS = [
  "product_information",
  "insurer_terms",
  "demands_and_needs",
  "complaints_information",
  "other",
] as const satisfies readonly InsuranceDisclosureKind[]

export function decodeDisclosure(value: unknown): InsuranceDisclosure | undefined {
  const row = recordValue(value)
  const label = stringValue(row?.label)
  const versionId = stringValue(row?.versionId)
  const document = decodeDocument(row?.document)
  if (!row || !label || !versionId || !document) return undefined
  return {
    kind: DISCLOSURE_KINDS.find((kind) => kind === row.kind) ?? "other",
    label,
    versionId,
    document,
    required: row.required !== false,
  }
}

const DOCUMENT_KINDS = [
  "policy_certificate",
  "policy_schedule",
  "product_information",
  "insurer_terms",
  "demands_and_needs",
  "complaints_information",
  "invoice",
  "other",
] as const satisfies readonly InsuranceDocumentKind[]

export function decodeDocument(value: unknown): InsuranceDocument | undefined {
  const row = recordValue(value)
  const documentId = stringValue(row?.documentId) ?? stringValue(row?.id)
  const filename = stringValue(row?.filename)
  const source = decodeDocumentSource(row)
  if (!row || !documentId || !filename || !source) return undefined
  const versionId = stringValue(row.versionId)
  const checksum = stringValue(row.checksum)
  const language = stringValue(row.language)
  const issuedAt = stringValue(row.issuedAt)
  return {
    documentId,
    kind: DOCUMENT_KINDS.find((kind) => kind === row.kind) ?? "other",
    filename,
    mimeType: stringValue(row.mimeType) ?? "application/pdf",
    source,
    ...(versionId ? { versionId } : {}),
    ...(checksum ? { checksum } : {}),
    ...(language ? { language } : {}),
    ...(issuedAt ? { issuedAt } : {}),
  }
}

function decodeDocumentSource(
  row: Record<string, unknown> | undefined,
): InsuranceDocumentSource | undefined {
  const source = recordValue(row?.source) ?? row
  const contentBase64 = stringValue(source?.contentBase64)
  if (contentBase64) return { kind: "inline", contentBase64 }
  const url = stringValue(source?.url) ?? stringValue(source?.downloadUrl)
  if (!url) return undefined
  const expiresAt = stringValue(source?.expiresAt)
  return { kind: "url", url, ...(expiresAt ? { expiresAt } : {}) }
}

/**
 * The requested kind, in the requested language where the insurer has one.
 *
 * `bookings.get` takes no locale, so language selection happens here rather
 * than upstream: an exact match, then the same language in another region,
 * then whatever the insurer issued.
 */
export function pickDocument(
  documents: readonly InsuranceDocument[],
  kind: InsuranceDocumentKind,
  locale: string | undefined,
): InsuranceDocument | undefined {
  const matching = documents.filter((document) => document.kind === kind)
  if (!locale) return matching[0]
  const wanted = locale.toLowerCase()
  const language = wanted.split("-")[0] ?? wanted
  return (
    matching.find((document) => document.language?.toLowerCase() === wanted) ??
    matching.find((document) => document.language?.toLowerCase().split("-")[0] === language) ??
    matching[0]
  )
}

const IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "national_identity",
  "residence_permit",
  "driving_licence",
  "birth_certificate",
  "other",
] as const

export function decodeInsuredPerson(value: unknown): InsuranceInsuredPerson | undefined {
  const row = recordValue(value)
  const ref = stringValue(row?.ref)
  const givenName = stringValue(row?.givenName)
  const familyName = stringValue(row?.familyName)
  const dateOfBirth = stringValue(row?.dateOfBirth)
  if (!row || !ref || !givenName || !familyName || !dateOfBirth) return undefined
  const residencyCountry = stringValue(row.residencyCountry)
  const bookingTravelerRef = stringValue(row.bookingTravelerRef)
  return {
    ref,
    givenName,
    familyName,
    dateOfBirth,
    ...(residencyCountry ? { residencyCountry: residencyCountry.toUpperCase() } : {}),
    identityDocuments: decodeList(row.identityDocuments, (entry) => {
      const document = recordValue(entry)
      const number = stringValue(document?.number)
      const issuingCountry = stringValue(document?.issuingCountry)
      if (!number || !issuingCountry) return undefined
      const expiresAt = stringValue(document?.expiresAt)
      return {
        type: IDENTITY_DOCUMENT_TYPES.find((type) => type === document?.type) ?? "other",
        number,
        issuingCountry: issuingCountry.toUpperCase(),
        ...(expiresAt ? { expiresAt } : {}),
      }
    }),
    ...(bookingTravelerRef ? { bookingTravelerRef } : {}),
  }
}

export function decodeContractingParty(value: unknown): InsuranceContractingParty | undefined {
  const row = recordValue(value)
  const givenName = stringValue(row?.givenName)
  const familyName = stringValue(row?.familyName)
  const email = stringValue(row?.email)
  if (!row || !givenName || !familyName || !email) return undefined
  const phone = stringValue(row.phone)
  const dateOfBirth = stringValue(row.dateOfBirth)
  const address = recordValue(row.address)
  const line1 = stringValue(address?.line1)
  const city = stringValue(address?.city)
  const country = stringValue(address?.country)
  const line2 = stringValue(address?.line2)
  const postalCode = stringValue(address?.postalCode)
  return {
    givenName,
    familyName,
    email,
    ...(phone ? { phone } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(line1 && city && country
      ? {
          address: {
            line1,
            ...(line2 ? { line2 } : {}),
            city,
            ...(postalCode ? { postalCode } : {}),
            country: country.toUpperCase(),
          },
        }
      : {}),
  }
}

const QUESTION_KINDS = [
  "boolean",
  "text",
  "number",
  "date",
  "single_choice",
  "multi_choice",
] as const

export function decodeQuestion(value: unknown): InsuranceQuestion | undefined {
  const row = recordValue(value)
  const id = stringValue(row?.id)
  const prompt = stringValue(row?.prompt)
  if (!row || !id || !prompt) return undefined
  const helpText = stringValue(row.helpText)
  const options = decodeList(row.options, (entry) => {
    const option = recordValue(entry)
    const optionValue = stringValue(option?.value)
    const label = stringValue(option?.label)
    return optionValue && label ? { value: optionValue, label } : undefined
  })
  return {
    id,
    prompt,
    kind: QUESTION_KINDS.find((kind) => kind === row.kind) ?? "text",
    ...(options.length > 0 ? { options } : {}),
    required: row.required !== false,
    perInsuredPerson: row.perInsuredPerson === true,
    ...(helpText ? { helpText } : {}),
  }
}

const APPLICATION_STATUSES = [
  "open",
  "submitted",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const satisfies readonly InsuranceApplicationStatus[]

export function decodeApplicationStatus(value: unknown): InsuranceApplicationStatus {
  return APPLICATION_STATUSES.find((status) => status === value) ?? "open"
}

const ISSUE_STATES = [
  "pending",
  "issued",
  "issue_failed",
  "cancelled",
] as const satisfies readonly InsurancePolicyIssueState[]

export function decodeIssueState(value: unknown): InsurancePolicyIssueState {
  return ISSUE_STATES.find((state) => state === value) ?? "pending"
}

export function decodeFailure(value: unknown): InsurancePolicyFailure | undefined {
  const row = recordValue(value)
  const code = stringValue(row?.code)
  const message = stringValue(row?.message)
  if (!row || !code || !message) return undefined
  return {
    code,
    message,
    retryable: row.retryable === true,
    occurredAt: stringValue(row.occurredAt) ?? new Date().toISOString(),
  }
}

export function decodePolicyCancellation(value: unknown): InsurancePolicyCancellation | undefined {
  const row = recordValue(value)
  const reason = stringValue(row?.reason)
  if (!row || !reason) return undefined
  const refund = decodeMoney(row.refund)
  const providerReference = stringValue(row.providerReference)
  return {
    cancelledAt: stringValue(row.cancelledAt) ?? new Date().toISOString(),
    reason,
    ...(refund ? { refund } : {}),
    ...(providerReference ? { providerReference } : {}),
  }
}
