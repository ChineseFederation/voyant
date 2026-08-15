/**
 * What a fiscal invoice needs to know about its buyer, in one place.
 *
 * A booking carries a `contact_*` snapshot of whoever the invoice is billed
 * to. Three surfaces have to agree on when that snapshot is good enough to
 * put on a fiscal document, and before voyant#4654 none of them asked:
 *
 * - the manual booking form, which must stop the operator before the gap
 *   exists (the cheapest place to fix it — the customer is on the phone)
 * - booking create, which decides whether the invoice it just wrote may be
 *   issued or has to stay a draft
 * - the booking detail, which has to name the gap on a booking that already
 *   has one
 *
 * The rule is the invoicing floor rather than any one jurisdiction's: a
 * buyer's name and their address (street, city, country), plus a fiscal code
 * when the buyer is a company. Romania's art. 319 Cod Fiscal is the case that
 * surfaced it — an invoice rendered `Adresa: -, -` / `Judet: -` to a real
 * customer — but every regime this product bills in wants the same minimum,
 * so it lives here as one predicate and not as a country rule.
 *
 * Deliberately NOT a Zod refinement on `bookingCoreSchema`: most bookings
 * never produce a fiscal document, and a booking with no billing address is a
 * legitimate row. This asks a question about a booking, it does not reject it.
 */

/** A buyer field a fiscal document cannot omit. */
export type FiscalBillingField =
  | "contactName"
  | "contactAddressLine1"
  | "contactCity"
  | "contactCountry"
  | "contactTaxId"

/**
 * The billing snapshot, in the vocabulary the booking row and the create
 * command both use. Widened to `string | null | undefined` so a partially
 * filled form draft and a fully materialised booking row are both callable
 * without adapting either.
 */
export interface FiscalBillingContact {
  /**
   * `individual` or `company`. Typed as plain text because the booking column
   * is: narrowing it here would make the booking row itself uncallable.
   *
   * Not sufficient on its own — see {@link isCompanyFiscalBuyer}.
   */
  contactPartyType?: string | null
  /**
   * The organization being billed, when it is one. Mutually exclusive with
   * `personId` (`validateExclusiveBillingParty`), so its presence is a fact
   * about the buyer rather than a hint.
   */
  organizationId?: string | null
  contactFirstName?: string | null
  contactLastName?: string | null
  contactAddressLine1?: string | null
  contactCity?: string | null
  contactCountry?: string | null
  contactTaxId?: string | null
}

function isBlank(value: string | null | undefined) {
  return typeof value !== "string" || value.trim().length === 0
}

/**
 * Whether this buyer is a company, and so owes a fiscal code.
 *
 * Both signals are consulted because `contactPartyType` alone is not
 * trustworthy: it is an independently optional column, and the booking-create
 * command lets a caller set `organizationId` without it. The manual form
 * always sets both, but `create_booking`, `book_product` (whose
 * `billingContact.partyType` is optional) and the storefront need not — and a
 * booking billed to an organization with `contactPartyType` left null would
 * otherwise be judged an individual, never asked for a fiscal code, and issued
 * as a B2B invoice carrying none. `organizationId` cannot be set on a booking
 * billed to a person, so reading it here cannot make an individual look like a
 * company.
 */
export function isCompanyFiscalBuyer(contact: FiscalBillingContact) {
  return contact.contactPartyType === "company" || !isBlank(contact.organizationId)
}

/**
 * The buyer fields this contact is missing, in the order an operator would
 * fill them. Empty means the contact can carry a fiscal invoice.
 *
 * A company buyer additionally needs a fiscal code; an individual does not,
 * and asking a private traveller for one would be wrong rather than merely
 * noisy.
 */
export function missingFiscalBillingFields(
  contact: FiscalBillingContact,
): readonly FiscalBillingField[] {
  const missing: FiscalBillingField[] = []
  if (isBlank(contact.contactFirstName) && isBlank(contact.contactLastName)) {
    missing.push("contactName")
  }
  if (isBlank(contact.contactAddressLine1)) missing.push("contactAddressLine1")
  if (isBlank(contact.contactCity)) missing.push("contactCity")
  if (isBlank(contact.contactCountry)) missing.push("contactCountry")
  if (isCompanyFiscalBuyer(contact) && isBlank(contact.contactTaxId)) {
    missing.push("contactTaxId")
  }
  return missing
}

/** True when the buyer snapshot carries everything a fiscal invoice needs. */
export function isFiscalBillingComplete(contact: FiscalBillingContact) {
  return missingFiscalBillingFields(contact).length === 0
}
