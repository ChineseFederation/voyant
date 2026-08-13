/**
 * Multi-vertical payment-policy cascade — owned by `@voyant-travel/finance`.
 *
 * Finance owns the `PaymentPolicy` primitive and the most-specific-wins cascade
 * (`resolveEffectivePaymentPolicy`: booking → listing → category → supplier →
 * operator default). This module packages the *cascade orchestration* + the
 * policy-source bookkeeping so no deployment recreates it: the supplier /
 * category / listing layers, the per-entity storefront-preview variant, and the
 * `__payment_policy_source__:` marker protocol stamped onto a booking's
 * `internalNotes`.
 *
 * WHY THE VERTICAL READERS ARE INJECTED (not imported):
 *
 * The actual schema walks the cascade performs — supplier policy off the
 * booking's supplier link, category policy off `product_categories`, and the
 * per-listing policy off accommodation rate plans / cruise cabin→sailing→cruise
 * layers / product rows — read tables in `@voyant-travel/inventory`,
 * `@voyant-travel/accommodations`, `@voyant-travel/cruises`, and
 * `@voyant-travel/distribution`. Finance is a retail-spine root and the spine
 * closure gate HARD-FORBIDS finance from depending on `@voyant-travel/inventory`
 * / `@voyant-travel/products` (and `@voyant-travel/accommodations` transitively
 * reaches the forbidden `@voyant-travel/operations`). So those reads MUST stay
 * in the deployment and are injected here as `options.readers` rather than
 * imported. The cascade *order*, the per-entity fan-out, and the source-marker
 * protocol are vertical-agnostic framework logic and live here.
 *
 * The `bookings` schema reads (stamp/read the source marker) ARE imported
 * directly: finance already depends on `@voyant-travel/bookings` acyclically
 * (bookings never depends back on finance).
 */

import { bookings } from "@voyant-travel/bookings/schema"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { PaymentPolicy, PaymentPolicySource } from "./payment-policy.js"

/**
 * Storefront-preview entity context passed to the per-entity cascade readers.
 * Mirrors the journey-level selections a customer makes before a booking row
 * exists — the readers walk these to find the listing / category / supplier
 * policy.
 */
export interface PaymentPolicyEntityContext {
  entityModule: string
  entityId: string
  /** Cruise journey selection — resolves cabin → sailing → cruise. */
  sailingId?: string
  cabinCategoryId?: string
  /** Accommodation journey selection — resolves the rate plan's policy. */
  ratePlanId?: string
}

/**
 * Deployment-supplied vertical readers for the cascade. Each returns the raw
 * per-layer policy override (or `null` to inherit from the next-broader layer).
 *
 * These are INJECTED because they read across vertical modules (inventory /
 * accommodations / cruises / distribution) that finance must not statically
 * import. The cascade ordering that composes them is framework logic and stays
 * in finance.
 */
export interface PaymentPolicyCascadeReaders {
  /** Supplier-layer override keyed off the booking's supplier link. */
  resolveSupplierPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  /** Product-category override (first category by sortOrder) for the booking. */
  resolveCategoryPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  /** Per-listing override (cruise / accommodation / product) for the booking. */
  resolveListingPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>

  /** Per-entity (storefront preview) supplier-layer reader. */
  resolveSupplierPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  /** Per-entity (storefront preview) category-layer reader. */
  resolveCategoryPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  /** Per-entity (storefront preview) listing-layer reader. */
  resolveListingPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
}

/** Options for {@link createPaymentPolicyCascade}. */
export interface PaymentPolicyCascadeOptions {
  /** The deployment-supplied vertical readers (see above). */
  readers: PaymentPolicyCascadeReaders
}

/**
 * The resolver surface produced by {@link createPaymentPolicyCascade}. Mirrors
 * the function names deployments wire into the booking-schedule route module so
 * a deployment can pass `cascade` fields straight into
 * `BookingScheduleRoutesOptions`.
 */
export interface PaymentPolicyCascade {
  // ── Booking-keyed cascade (booking.confirmed + regenerate paths) ──────────
  resolveSupplierPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  resolveCategoryPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  resolveListingPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>

  // ── Entity-keyed cascade (storefront resolve path) ────────────────────────
  resolveSupplierPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  resolveCategoryPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>
  resolveListingPolicyForEntity(
    db: PostgresJsDatabase,
    ctx: PaymentPolicyEntityContext,
  ): Promise<PaymentPolicy | null>

  // ── Policy-source bookkeeping on the booking row (framework-owned) ─────────
  stampPolicySourceOnBooking(
    db: PostgresJsDatabase,
    bookingId: string,
    source: PaymentPolicySource,
  ): Promise<void>
  readPolicySourceFromInternalNotes(
    internalNotes: string | null | undefined,
  ): PaymentPolicySource | null
}

/**
 * The marker line stamped onto a booking's `internalNotes` recording which
 * cascade layer produced the effective policy. Framework-owned protocol so the
 * contract resolver can echo the real source rather than always "operator_default".
 */
const POLICY_SOURCE_MARKER_PREFIX = "__payment_policy_source__:"

/**
 * Build the payment-policy cascade. Composes the deployment-supplied vertical
 * readers into the cascade's per-layer resolvers (booking-level + per-entity
 * preview) and owns the source-marker protocol on the booking row.
 *
 * Behaviour is byte-for-byte equivalent to the operator's previous
 * `booking-payment-policy-runtime.ts`: same cascade order, same fallbacks, same
 * `PaymentPolicy` shape, same `source` values.
 */
export function createPaymentPolicyCascade(
  options: PaymentPolicyCascadeOptions,
): PaymentPolicyCascade {
  const { readers } = options

  return {
    resolveSupplierPolicy: (db, bookingId) => readers.resolveSupplierPolicy(db, bookingId),
    resolveCategoryPolicy: (db, bookingId) => readers.resolveCategoryPolicy(db, bookingId),
    resolveListingPolicy: (db, bookingId) => readers.resolveListingPolicy(db, bookingId),

    resolveSupplierPolicyForEntity: (db, ctx) => readers.resolveSupplierPolicyForEntity(db, ctx),
    resolveCategoryPolicyForEntity: (db, ctx) => readers.resolveCategoryPolicyForEntity(db, ctx),
    resolveListingPolicyForEntity: (db, ctx) => readers.resolveListingPolicyForEntity(db, ctx),

    stampPolicySourceOnBooking: (db, bookingId, source) =>
      stampPolicySourceOnBooking(db, bookingId, source),
    readPolicySourceFromInternalNotes,
  }
}

/**
 * Persist the winning cascade source onto a booking's `internalNotes`.
 *
 * Replaces any existing `__payment_policy_source__:` marker line so the stamp
 * is idempotent across event replay and explicit status correction. The source enum is small
 * (booking | listing | category | supplier | operator_default) so a single
 * marker line is enough.
 *
 * Touches only the `bookings` schema, which finance already depends on
 * acyclically — no vertical import, so this lives in finance.
 */
export async function stampPolicySourceOnBooking(
  db: PostgresJsDatabase,
  bookingId: string,
  source: PaymentPolicySource,
): Promise<void> {
  const [row] = await db
    .select({ internalNotes: bookings.internalNotes })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  if (!row) return

  const filtered = (row.internalNotes ?? "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(POLICY_SOURCE_MARKER_PREFIX))
    .join("\n")

  const marker = `${POLICY_SOURCE_MARKER_PREFIX}${source}`
  const next = filtered.length > 0 ? `${filtered}\n${marker}` : marker

  await db
    .update(bookings)
    .set({
      internalNotes: next,
      revision: sql`${bookings.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
}

/**
 * Read the policy-source marker stamped onto a booking by the schedule
 * subscriber. Used by the contract resolver so `booking.paymentPolicy.source`
 * reflects the actual cascade layer (`supplier`, `operator_default`, etc.)
 * rather than always echoing `"operator_default"`.
 *
 * Returns `null` when no marker is present or the stamped value isn't a known
 * `PaymentPolicySource`.
 */
export function readPolicySourceFromInternalNotes(
  internalNotes: string | null | undefined,
): PaymentPolicySource | null {
  if (!internalNotes) return null
  for (const line of internalNotes.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith(POLICY_SOURCE_MARKER_PREFIX)) {
      const value = trimmed.slice(POLICY_SOURCE_MARKER_PREFIX.length).trim()
      switch (value) {
        case "booking":
        case "proposal":
        case "listing":
        case "category":
        case "supplier":
        case "operator_default":
          return value
        default:
          return null
      }
    }
  }
  return null
}
