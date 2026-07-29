import type { bookings } from "@voyant-travel/bookings/schema"
import {
  bookingItemTaxLines,
  computeBookingItemTaxLine,
  resolveBookingSellTaxRate,
} from "@voyant-travel/finance"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { MaterializationSnapshot } from "./materialization.js"
import { inferSnapshotTaxFacts } from "./materialization-support.js"
import type { CheckoutModuleOptions } from "./options.js"

export async function rebuildBookingItemTaxLines(
  db: PostgresJsDatabase,
  bookingId: string,
  options: Pick<CheckoutModuleOptions, "resolveBookingTaxSettings">,
): Promise<{ rebuilt: number; itemsWithoutSnapshot: number }> {
  return db.transaction(async (tx) => {
    const { bookingItems: bookingItemsTable, bookings: bookingsTable } = await import(
      "@voyant-travel/bookings/schema"
    )
    const { bookingCatalogSnapshotTable } = await import("@voyant-travel/catalog")
    const [booking] = await tx
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1)
      .for("update")
    if (!booking) return { rebuilt: 0, itemsWithoutSnapshot: 0 }

    const items = await tx
      .select()
      .from(bookingItemsTable)
      .where(eq(bookingItemsTable.bookingId, bookingId))
      .for("update")

    let rebuilt = 0
    let itemsWithoutSnapshot = 0
    for (const item of items) {
      const snapshot = await loadSnapshotForItem(tx, bookingCatalogSnapshotTable, item)
      if (!snapshot) {
        itemsWithoutSnapshot += 1
        continue
      }
      await tx.delete(bookingItemTaxLines).where(eq(bookingItemTaxLines.bookingItemId, item.id))
      await materializeBookingItemTaxLineLocked(
        tx,
        booking,
        item.id,
        item.totalSellAmountCents ?? 0,
        snapshot,
        options,
      )
      rebuilt += 1
    }
    return { rebuilt, itemsWithoutSnapshot }
  })
}

async function loadSnapshotForItem(
  db: PostgresJsDatabase,
  snapshotTable: typeof import("@voyant-travel/catalog").bookingCatalogSnapshotTable,
  item: { sourceSnapshotId: string | null; bookingId: string },
): Promise<MaterializationSnapshot | null> {
  const snapshotId = item.sourceSnapshotId
  if (!snapshotId) {
    // Item wasn't materialized from a catalog snapshot; fall back to the
    // booking-level snapshot if there is exactly one for this booking.
    const rows = await db
      .select()
      .from(snapshotTable)
      .where(eq(snapshotTable.booking_id, item.bookingId))
      .limit(2)
    return rows.length === 1 && rows[0] ? toMaterializationSnapshot(rows[0]) : null
  }
  const [row] = await db
    .select()
    .from(snapshotTable)
    .where(eq(snapshotTable.id, snapshotId))
    .limit(1)
  return row ? toMaterializationSnapshot(row) : null
}

function toMaterializationSnapshot(
  row: import("@voyant-travel/catalog").SelectBookingCatalogSnapshot,
): MaterializationSnapshot {
  return {
    id: row.id,
    entity_module: row.entity_module,
    entity_id: row.entity_id,
    source_kind: row.source_kind,
    source_provider: row.source_provider,
    source_ref: row.source_ref,
    frozen_payload: row.frozen_payload as Record<string, unknown> | null,
    pricing_base_amount: row.pricing_base_amount != null ? String(row.pricing_base_amount) : null,
    pricing_taxes: row.pricing_taxes != null ? String(row.pricing_taxes) : null,
    pricing_fees: row.pricing_fees != null ? String(row.pricing_fees) : null,
    pricing_surcharges: row.pricing_surcharges != null ? String(row.pricing_surcharges) : null,
    pricing_currency: row.pricing_currency,
  }
}

export async function materializeBookingItemTaxLine(
  db: PostgresJsDatabase,
  booking: typeof bookings.$inferSelect,
  bookingItemId: string,
  amountCents: number,
  snapshot: MaterializationSnapshot,
  options: Pick<CheckoutModuleOptions, "resolveBookingTaxSettings">,
) {
  const { bookingItems: bookingItemsTable } = await import("@voyant-travel/bookings/schema")
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: bookingItemsTable.id })
      .from(bookingItemsTable)
      .where(eq(bookingItemsTable.id, bookingItemId))
      .limit(1)
      .for("update")
    if (!item) return
    return materializeBookingItemTaxLineLocked(
      tx,
      booking,
      bookingItemId,
      amountCents,
      snapshot,
      options,
    )
  })
}

async function materializeBookingItemTaxLineLocked(
  db: PostgresJsDatabase,
  booking: typeof bookings.$inferSelect,
  bookingItemId: string,
  amountCents: number,
  snapshot: MaterializationSnapshot,
  options: Pick<CheckoutModuleOptions, "resolveBookingTaxSettings">,
) {
  const currency = booking.sellCurrency ?? snapshot.pricing_currency ?? "EUR"
  const taxRate = await resolveBookingSellTaxRate(
    db,
    {
      productId: snapshot.entity_module === "products" ? snapshot.entity_id : null,
      facts: inferSnapshotTaxFacts(snapshot),
    },
    {
      resolveBookingTaxSettings: options.resolveBookingTaxSettings,
    },
  )
  const policyLine = computeBookingItemTaxLine(taxRate, amountCents, currency)
  // Fall back to the snapshot's `pricing_taxes` when the operator has no
  // tax policy configured. Without this the booking page (which reads the
  // snapshot directly) shows tax but the invoice (which reads
  // `booking_item_tax_lines`) shows zero — operators see a mismatch.
  // The booking total already includes this tax (sellAmountCents = base +
  // taxes + fees + surcharges), so the row is `includedInPrice: true`.
  const fallbackLine = policyLine ? null : buildSnapshotFallbackTaxLine(snapshot, currency)
  const taxLine = policyLine ?? fallbackLine
  if (!taxLine) return

  await db
    .insert(bookingItemTaxLines)
    .values({
      bookingItemId,
      ...taxLine,
    })
    .onConflictDoNothing()
}

function buildSnapshotFallbackTaxLine(snapshot: MaterializationSnapshot, currency: string) {
  if (!snapshot.pricing_taxes) return null
  const taxAmount = Number.parseFloat(snapshot.pricing_taxes)
  if (!Number.isFinite(taxAmount) || taxAmount <= 0) return null
  const taxCents = Math.round(taxAmount)
  if (taxCents <= 0) return null
  return {
    code: "snapshot/tax",
    name: "Tax",
    scope: "included" as const,
    currency,
    amountCents: taxCents,
    rateBasisPoints: null,
    includedInPrice: true,
    sortOrder: 0,
  }
}
