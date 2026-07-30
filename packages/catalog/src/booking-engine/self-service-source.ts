/**
 * Catalog's provider for `finance.self-service-booking-source.runtime`.
 *
 * Finance owns the durable create command; catalog owns the draft, quote, and
 * hold a public caller built it from. This module is the seam between them: it
 * verifies that state, asks the owning vertical to derive a command, and later
 * spends the state inside Finance's transaction.
 *
 * Everything the command contains is derived here or by the vertical handler.
 * A public caller supplies only identifiers — never prices, booking numbers,
 * relationship ids, tax lines, or status.
 */
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, isNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { PricingBasis } from "../snapshot/schema.js"
import { verifyBookingDraftCapabilityToken } from "./draft-capability.js"
import { bookingDraftsTable } from "./drafts-schema.js"
import { markDraftConsumed } from "./drafts-service.js"
import type { OwnedBookingHandlerRegistry, SelfServiceBillingParty } from "./owned-handler.js"
import { catalogQuotesTable, type SelectCatalogQuote } from "./schema.js"

/** Resolve or create the CRM person a booking is billed to. */
export type ResolveSelfServiceBillingPerson = (
  contact: {
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  },
  provenance: { source: string; sourceRef: string },
) => Promise<string | null>

export interface SelfServiceBookingSourceProviderDeps {
  /** Resolved per request, matching how other catalog jobs reach the registry. */
  resolveOwnedHandlers():
    | OwnedBookingHandlerRegistry
    | Promise<OwnedBookingHandlerRegistry | undefined>
    | undefined
  /**
   * Optional CRM resolver. Only called once the whole party would pass the
   * create command's own validation — resolving persists a person before the
   * durable claim exists, so a party that would be rejected downstream must
   * never reach it, or every failed attempt orphans a CRM row.
   *
   * Without it an authenticated customer can still book (they already are the
   * billing party); a verified guest is rejected as `incomplete_draft`.
   */
  resolveBillingPerson?: ResolveSelfServiceBillingPerson
  /**
   * Runtime env for verifying the draft capability. Without it the capability
   * cannot be checked, so booking is refused rather than allowed.
   */
  resolveEnv?(): Record<string, string | undefined>
}

/**
 * A draft or quote was spent between resolution and the create transaction.
 * Thrown rather than returned so the create rolls back.
 */
export class SelfServiceSourceConsumedError extends Error {
  constructor(readonly source: "draft" | "quote") {
    super(`The booking ${source} was already consumed by another request.`)
    this.name = "SelfServiceSourceConsumedError"
  }
}

type Rejection = { status: "rejected"; reason: string }

const reject = (reason: string): Rejection => ({ status: "rejected", reason })

export function createSelfServiceBookingSourceProvider(deps: SelfServiceBookingSourceProviderDeps) {
  return {
    async resolveBookingSource(input: {
      db: PostgresJsDatabase
      draftId: string
      quoteId: string
      caller: {
        personId?: string
        verifiedEmail?: string
        verifiedPhone?: string
      }
      /** Proves the caller is the one who built this draft. */
      draftCapabilityToken?: string
    }) {
      // Holding the draft is what authorizes booking it. Checked before the
      // draft is even read, so a caller without it learns nothing about
      // whether the id exists.
      const capabilityOk = await verifyBookingDraftCapabilityToken(
        input.draftCapabilityToken,
        input.draftId,
        "draft:book",
        deps.resolveEnv?.() ?? {},
      )
      if (!capabilityOk) return reject("draft_forbidden")

      const draft = await loadDraft(input.db, input.draftId)
      if (!draft) return reject("draft_not_found")
      if (draft.consumed_booking_id) return reject("draft_consumed")

      const quote = await loadQuote(input.db, input.quoteId)
      if (!quote) return reject("quote_not_found")
      if (quote.consumed_booking_id) return reject("quote_consumed")

      const now = new Date()
      if (quote.expires_at <= now) return reject("quote_expired")
      // The quote must be for the row this draft is building, or a caller
      // could pair a cheap quote with a different entity.
      if (quote.entity_module !== draft.entity_module || quote.entity_id !== draft.entity_id) {
        return reject("entity_mismatch")
      }
      // Only the draft's own current quote is spendable.
      if (draft.current_quote_id && draft.current_quote_id !== quote.id) {
        return reject("price_changed")
      }
      if (draft.hold_expires_at && draft.hold_expires_at <= now) return reject("hold_expired")

      const ownedHandlers = await deps.resolveOwnedHandlers()
      const handler = ownedHandlers?.resolve(draft.entity_module)
      if (!handler?.deriveSelfServiceCommand) return reject("unsupported_vertical")

      // A vertical that implements holds manages finite inventory, so a
      // self-service booking against it must carry a live one. Otherwise the
      // absence of `hold_expires_at` silently skipped every hold check and the
      // booking was created against nothing — and hold conversion only runs
      // for slot-backed products, so a slotless one would simply oversell.
      if (handler.placeHold && !draft.hold_expires_at) return reject("hold_required")

      // Re-price the CURRENT draft and require it to still equal the quote.
      //
      // `catalog_quotes` records what a quote cost but not what it was priced
      // FOR — no pax, dates, options, or slot. The only other binding is
      // `draft.current_quote_id`, which the caller writes themselves on the
      // public draft PUT. Without this check a caller can quote one adult for
      // one night, then rewrite the draft to six travellers for thirty nights
      // keeping the cheap quote id, and every other check still passes.
      const repriced = await handler.computeQuote(
        { db: input.db, adapterContext: {} as never },
        {
          entityModule: draft.entity_module,
          entityId: draft.entity_id,
          draft: draft.draft_payload,
          // The quote's own scope, so the comparison is like for like — a
          // different market or currency would otherwise read as a price
          // change, or worse, let a cheaper market's total stand in.
          scope: {
            locale: quote.locale,
            audience: quote.audience,
            market: quote.market,
            ...(quote.currency ? { currency: quote.currency } : {}),
          },
        },
      )
      if (!repriced.available) return reject("price_changed")
      const quotedTotal = quotedTotalCents(quote)
      const currentTotal = repricedTotalCents(repriced)
      if (quotedTotal == null || currentTotal == null || quotedTotal !== currentTotal) {
        return reject("price_changed")
      }

      const payload = (draft.draft_payload ?? {}) as {
        billing?: { contact?: Record<string, string | null | undefined> }
        travelers?: unknown[]
      }
      const contact = billingContact(payload.billing?.contact)

      // The challenge proved control of ONE contact point, so only that one is
      // trusted. The unverified field is dropped rather than merely unchecked:
      // `upsertPersonFromContact` matches on email then phone, so an
      // SMS-verified caller who put a victim's email in the draft would
      // otherwise have the booking resolved onto the victim's CRM person and
      // their confirmations sent to an address they never proved control of.
      const trustedContact = trustedBillingContact(input.caller, contact)
      if (!trustedContact) return reject("contact_mismatch")

      const billing = await resolveBilling(
        deps,
        input.caller,
        trustedContact,
        payload,
        input.draftId,
      )
      if (!billing) return reject("incomplete_draft")

      const derived = await handler.deriveSelfServiceCommand(
        { db: input.db, adapterContext: {} as never },
        {
          entityModule: draft.entity_module,
          entityId: draft.entity_id,
          draft: draft.draft_payload,
          ...(readPricingFromQuote(quote) ? { pricing: readPricingFromQuote(quote) } : {}),
          billing,
          // Owned holds are keyed by draft id (see the products handler's
          // `placeHold`), so an active hold is identified by the draft itself.
          ...(draft.hold_expires_at ? { availabilityHoldToken: draft.id } : {}),
        },
      )
      if (derived.status !== "ok") return reject(derived.reason)

      return {
        status: "ok" as const,
        command: derived.command,
        holdExpiresAt: draft.hold_expires_at ?? null,
      }
    },

    /**
     * Spend the draft and quote inside Finance's transaction. Reached only on
     * a first execution — an exact retry replays at the claim and skips this.
     */
    async consumeBookingSource(
      tx: AnyDrizzleDb,
      input: { draftId: string; quoteId: string; bookingId: string },
    ) {
      // Both claims are conditional on still being unspent, and both throw on
      // failure so the create transaction rolls back. Resolution happened
      // before the transaction opened, so without these predicates two
      // concurrent creates would each pass resolution and both commit —
      // two bookings from one draft, one quote, and one hold.
      if (!(await markDraftConsumed(tx, input.draftId, input.bookingId))) {
        throw new SelfServiceSourceConsumedError("draft")
      }
      const quoteRows = (await tx
        .update(catalogQuotesTable)
        .set({ consumed_booking_id: input.bookingId, consumed_at: new Date() })
        .where(
          and(
            eq(catalogQuotesTable.id, input.quoteId),
            isNull(catalogQuotesTable.consumed_booking_id),
          ),
        )
        .returning()) as Array<{ id: string }>
      if (quoteRows.length === 0) {
        throw new SelfServiceSourceConsumedError("quote")
      }
    },
  }
}

async function resolveBilling(
  deps: SelfServiceBookingSourceProviderDeps,
  caller: { personId?: string },
  contact: ReturnType<typeof billingContact>,
  payload: { travelers?: unknown[] },
  draftId: string,
): Promise<SelfServiceBillingParty | null> {
  const base = {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactEmail: contact.email,
    contactPhone: contact.phone,
    organizationId: null,
  }
  // An authenticated customer already is the billing party.
  if (caller.personId) return { ...base, personId: caller.personId }
  if (!deps.resolveBillingPerson) return null

  // Guard before resolving: a person persisted for a party the create command
  // would reject is an orphaned CRM row on every retry.
  const hasName = Boolean(contact.firstName?.trim()) && Boolean(contact.lastName?.trim())
  const hasContactPoint = Boolean(contact.email) || Boolean(contact.phone)
  const hasTravelers = Array.isArray(payload.travelers) && payload.travelers.length > 0
  if (!hasName || !hasContactPoint || !hasTravelers) return null

  const personId = await deps.resolveBillingPerson(contact, {
    source: "storefront-self-service",
    sourceRef: draftId,
  })
  return personId ? { ...base, personId } : null
}

/**
 * Narrow the draft's billing contact to what the caller actually proved.
 *
 * Returns null when nothing was proven. An authenticated customer is
 * identified by their account, so their draft contact is taken as given; a
 * guest keeps only the channel their challenge verified, and the other channel
 * is discarded so it can never steer CRM resolution or delivery.
 */
function trustedBillingContact(
  caller: { personId?: string; verifiedEmail?: string; verifiedPhone?: string },
  contact: ReturnType<typeof billingContact>,
): ReturnType<typeof billingContact> | null {
  if (caller.personId) return contact

  const email = contact.email?.trim().toLowerCase()
  const phone = contact.phone?.trim()
  if (caller.verifiedEmail && email && caller.verifiedEmail.trim().toLowerCase() === email) {
    return { ...contact, phone: null }
  }
  if (caller.verifiedPhone && phone && caller.verifiedPhone.trim() === phone) {
    return { ...contact, email: null }
  }
  return null
}

function billingContact(contact: Record<string, string | null | undefined> | undefined) {
  const trim = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }
  return {
    firstName: trim(contact?.firstName),
    lastName: trim(contact?.lastName),
    email: trim(contact?.email),
    phone: trim(contact?.phone),
  }
}

async function loadDraft(db: PostgresJsDatabase, id: string) {
  const rows = await db
    .select()
    .from(bookingDraftsTable)
    .where(eq(bookingDraftsTable.id, id))
    .limit(1)
  return rows[0]
}

async function loadQuote(db: PostgresJsDatabase, id: string) {
  const rows = await db
    .select()
    .from(catalogQuotesTable)
    .where(eq(catalogQuotesTable.id, id))
    .limit(1)
  return rows[0]
}

function readPricingFromQuote(quote: SelectCatalogQuote): PricingBasis | undefined {
  const baseRaw = quote.pricing_base_amount
  if (baseRaw == null) return undefined
  const base = typeof baseRaw === "string" ? Number.parseFloat(baseRaw) : Number(baseRaw)
  if (!Number.isFinite(base)) return undefined
  const currency = quote.pricing_currency
  if (!currency) return undefined
  return {
    base_amount: base,
    taxes: numericOrZero(quote.pricing_taxes),
    fees: numericOrZero(quote.pricing_fees),
    surcharges: numericOrZero(quote.pricing_surcharges),
    currency,
    breakdown: quote.pricing_breakdown ?? undefined,
    appliedOffers: quote.pricing_applied_offers ?? undefined,
  }
}

function numericOrZero(value: unknown): number {
  if (value == null) return 0
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Total a quote was written for, in minor units.
 *
 * `catalog_quotes` stores decimal major-unit numerics, so the comparison is
 * done in cents to avoid float drift making an equal price look changed.
 */
function quotedTotalCents(quote: SelectCatalogQuote): number | null {
  const pricing = readPricingFromQuote(quote)
  if (!pricing) return null
  return pricingTotalCents(pricing)
}

function repricedTotalCents(result: { pricing?: PricingBasis }): number | null {
  return result.pricing ? pricingTotalCents(result.pricing) : null
}

function pricingTotalCents(pricing: PricingBasis): number | null {
  const total =
    Number(pricing.base_amount ?? 0) +
    Number(pricing.taxes ?? 0) +
    Number(pricing.fees ?? 0) +
    Number(pricing.surcharges ?? 0)
  return Number.isFinite(total) ? Math.round(total * 100) : null
}
