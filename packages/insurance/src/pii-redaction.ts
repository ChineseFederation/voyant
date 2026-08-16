/**
 * Insurance PII redaction at the API boundary.
 *
 * Mirrors `packages/bookings/src/pii-redaction.ts`, with one difference that
 * matters: bookings redacts plaintext columns, and this redacts a shape that
 * only exists because something already decrypted it. So the order is
 * decrypt-then-redact and never the reverse — a route decides whether the
 * caller may see identity data BEFORE it asks the PII service for it, and the
 * redacted shape below exists for the surfaces that must still render a row.
 *
 * The gate is `insurance-pii:read` (or `insurance-pii:*`, or superuser `*`),
 * declared as its own sensitive access resource in `voyant.ts`. It is separate
 * from `insurance:read` on purpose: an operator agent reconciling premiums
 * needs to list policies, and nothing about that job requires a passport
 * number.
 */

const PII_SCOPE_ANY = "insurance-pii:*"
const PII_SCOPE_READ = "insurance-pii:read"
const SUPERUSER_SCOPE = "*"

export interface InsurancePiiAccessContext {
  actor?: string | null
  scopes?: string[] | null
  callerType?: string | null
  isInternalRequest?: boolean
  /**
   * When true, staff sessions are gated by the scope like everyone else. Unlike
   * bookings, this has no "staff always sees it" legacy to preserve: insurance
   * identity data has never been readable without the scope, so the default is
   * the strict one.
   */
  enforceRbac?: boolean
}

/**
 * Whether the caller has earned identity data in the clear.
 *
 * Internal requests (in-process fulfilment calling the provider) reveal: they
 * have to send the insurer a name and a document number, which is the entire
 * point of holding them. Everyone else needs the explicit scope.
 */
export function shouldRevealInsurancePii(ctx: InsurancePiiAccessContext): boolean {
  if (ctx.isInternalRequest) return true
  const scopes = ctx.scopes ?? []
  return (
    scopes.includes(SUPERUSER_SCOPE) ||
    scopes.includes(PII_SCOPE_ANY) ||
    scopes.includes(PII_SCOPE_READ)
  )
}

/** Mask a value to a fixed marker, keeping the field present so clients don't break. */
export function redactInsuranceString(value: string | null | undefined): string | null {
  if (value == null) return value ?? null
  return value.length === 0 ? value : "***"
}

/** `alice@example.com` → `a***e@example.com`. The domain survives; the person does not. */
export function redactInsuranceEmail(email: string | null | undefined): string | null {
  if (email == null) return email ?? null
  const at = email.lastIndexOf("@")
  if (at < 1) return "***"
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return `${"*".repeat(local.length)}${domain}`
  return `${local[0]}***${local[local.length - 1]}${domain}`
}

/**
 * Mask a document number to its last two characters.
 *
 * Two, not four: a passport number is short enough that four characters plus an
 * issuing country narrows a person considerably, and the only reason to show
 * any of it is so an operator on the phone can confirm they are looking at the
 * right record.
 */
export function redactInsuranceDocumentNumber(value: string | null | undefined): string | null {
  if (value == null) return value ?? null
  const trimmed = value.trim()
  if (trimmed.length <= 2) return "***"
  return `***${trimmed.slice(-2)}`
}

/** A date of birth reduced to the year, which is the part underwriting is about. */
export function redactInsuranceDateOfBirth(value: string | null | undefined): string | null {
  if (value == null) return value ?? null
  const year = value.slice(0, 4)
  return /^\d{4}$/.test(year) ? `${year}-**-**` : "***"
}

export interface RedactableInsuredIdentity {
  givenName?: string | null
  familyName?: string | null
  dateOfBirth?: string | null
  residencyCountry?: string | null
  identityDocuments?: ReadonlyArray<{
    type: string
    number: string
    issuingCountry: string
    expiresAt?: string | undefined
  }> | null
}

/**
 * The redacted projection of an insured person's identity.
 *
 * Note what survives: `type` and `issuingCountry`. Those are what an operator
 * needs to answer "did we send the insurer a passport or an ID card?", and
 * neither identifies anyone on its own.
 */
export function redactInsuredIdentity<T extends RedactableInsuredIdentity>(identity: T): T {
  return {
    ...identity,
    givenName: redactInsuranceString(identity.givenName),
    familyName: redactInsuranceString(identity.familyName),
    dateOfBirth: redactInsuranceDateOfBirth(identity.dateOfBirth),
    identityDocuments: (identity.identityDocuments ?? []).map((document) => ({
      ...document,
      number: redactInsuranceDocumentNumber(document.number) ?? "***",
    })),
  }
}

export interface RedactableContractingParty {
  givenName?: string | null
  familyName?: string | null
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  address?: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    postalCode?: string | null
    country?: string | null
  } | null
}

/** Contracting-party redaction. The country survives; the address does not. */
export function redactInsuranceContractingParty<T extends RedactableContractingParty>(party: T): T {
  return {
    ...party,
    givenName: redactInsuranceString(party.givenName),
    familyName: redactInsuranceString(party.familyName),
    email: redactInsuranceEmail(party.email),
    phone: redactInsuranceString(party.phone),
    dateOfBirth: redactInsuranceDateOfBirth(party.dateOfBirth),
    ...(party.address
      ? {
          address: {
            ...party.address,
            line1: redactInsuranceString(party.address.line1),
            line2: redactInsuranceString(party.address.line2),
            city: redactInsuranceString(party.address.city),
            postalCode: redactInsuranceString(party.address.postalCode),
          },
        }
      : {}),
  }
}

/**
 * Underwriting answers, redacted wholesale.
 *
 * There is no partial view of a medical declaration worth having: the question
 * text alone ("do you have a pre-existing cardiac condition?") plus a boolean
 * is the sensitive fact. So the value goes and the question id stays, which is
 * enough to say an answer exists without saying what it was.
 */
export function redactInsuranceAnswers<T extends { questionId: string; value: unknown }>(
  answers: readonly T[],
): Array<Omit<T, "value"> & { value: string }> {
  return answers.map(({ value: _value, ...answer }) => ({ ...answer, value: "***" }))
}
