// agent-quality: file-size exception -- owner: finance; existing service module stays co-located until a dedicated split preserves behavior and tests.
import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
} from "@voyant-travel/action-ledger"
import { bookings } from "@voyant-travel/bookings/schema"
import { type AnyColumn, and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { type FxMoneyInput, resolveFxMoneyBaseAmount } from "./fx-money.js"
import { type InvoiceFxOptions, resolveInvoiceFxSettingsOrDefault } from "./invoice-fx.js"
import {
  supplierCostAllocations,
  supplierInvoiceAttachments,
  supplierInvoiceLines,
  supplierInvoices,
  supplierPayments,
} from "./schema.js"
import {
  buildSupplierInvoiceAllocationsActionLedgerInput,
  buildSupplierInvoiceCreateActionLedgerInput,
  buildSupplierInvoiceDeleteActionLedgerInput,
  buildSupplierInvoiceUpdateActionLedgerInput,
} from "./service-action-ledger-supplier-invoices.js"
import { executeBoundaryRows, normalizeDateOnly, sqlList } from "./service-boundary-sql.js"
import { toRows } from "./service-shared.js"
import type {
  insertSupplierInvoiceAttachmentSchema,
  insertSupplierInvoiceSchema,
  setSupplierCostAllocationsSchema,
  setSupplierInvoiceLinesSchema,
  supplierCostAllocationInputSchema,
  supplierInvoiceLineInputSchema,
  supplierInvoiceListQuerySchema,
  updateSupplierInvoiceSchema,
} from "./validation.js"

type CreateSupplierInvoiceInput = z.infer<typeof insertSupplierInvoiceSchema>
type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>
type SupplierInvoiceListQuery = z.infer<typeof supplierInvoiceListQuerySchema>
type SupplierInvoiceLineInput = z.infer<typeof supplierInvoiceLineInputSchema>
type SupplierCostAllocationInput = z.infer<typeof supplierCostAllocationInputSchema>
type SetLinesInput = z.infer<typeof setSupplierInvoiceLinesSchema>
type SetAllocationsInput = z.infer<typeof setSupplierCostAllocationsSchema>
type CreateAttachmentInput = z.infer<typeof insertSupplierInvoiceAttachmentSchema>

export type SupplierInvoiceErrorCode =
  | "supplier_invoice_not_found"
  | "invalid_payable_state"
  | "mixed_allocation_modes"
  | "over_allocated"
  | "unknown_allocation_line"
  | "allocate_lines_after_create"

/**
 * Raised by the supplier-invoice (AP) service. Route handlers map `code` to HTTP.
 */
export class SupplierInvoiceServiceError extends Error {
  constructor(
    readonly code: SupplierInvoiceErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "SupplierInvoiceServiceError"
  }
}

export interface SupplierInvoiceServiceRuntime extends InvoiceFxOptions {
  actionLedgerContext?: ActionLedgerRequestContextValues
  actionLedgerAuthorizationSource?: string | null
}

interface SupplierInvoiceFxSnapshot {
  baseCurrency: string | null
  fxRateSetId: string | null
  baseSubtotalCents: number | null
  baseTaxCents: number | null
  baseTotalCents: number | null
}

const NO_FX_SNAPSHOT: SupplierInvoiceFxSnapshot = {
  baseCurrency: null,
  fxRateSetId: null,
  baseSubtotalCents: null,
  baseTaxCents: null,
  baseTotalCents: null,
}

function toIssueDateString(value: string | Date | null | undefined): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * Snapshot the operator accounting-base value of a supplier invoice using the FX
 * rate effective on its issue date (end-to-end FX §). The total is converted via
 * the shared {@link resolveFxMoneyBaseAmount} (persisted rate as-of the issue
 * date, then runtime resolver); subtotal/tax are pro-rated from the resolved base
 * total so the parts always sum to the whole. When no rate resolves, every base
 * column stays null (lazy/forward-only) rather than guessing at the latest rate.
 */
async function snapshotSupplierInvoiceFx(
  db: PostgresJsDatabase,
  input: {
    currency: string
    subtotalCents: number
    taxCents: number
    totalCents: number
    baseCurrency?: string | null
    fxRateSetId?: string | null
    issueDate: string | Date
  },
  runtime: SupplierInvoiceServiceRuntime,
): Promise<SupplierInvoiceFxSnapshot> {
  // Target the operator accounting base (declared on the invoice, else the
  // configured/default base from FX settings — "RON" by default) so AP invoices
  // snapshot into the same base the rest of finance reports in.
  const settings = await resolveInvoiceFxSettingsOrDefault(db, runtime)
  const targetBaseCurrency = input.baseCurrency ?? settings.baseCurrency
  const fxInput: FxMoneyInput = {
    amountCents: input.totalCents,
    currency: input.currency,
    baseCurrency: input.baseCurrency ?? null,
    fxRateSetId: input.fxRateSetId ?? null,
  }
  const resolved = await resolveFxMoneyBaseAmount(db, fxInput, {
    ...runtime,
    ...(targetBaseCurrency ? { targetBaseCurrency } : {}),
    fallbackFxRateSetId: input.fxRateSetId ?? null,
    date: toIssueDateString(input.issueDate) ?? null,
    setBaseCurrencyWhenUnresolved: false,
  })

  const baseCurrency = resolved.baseCurrency ?? null
  const baseTotalCents = resolved.baseAmountCents ?? null
  // The check constraint requires base_currency whenever any base amount is set;
  // a bare currency with no amounts (or a stray fxRateSetId) is just noise.
  if (!baseCurrency || baseTotalCents == null) return NO_FX_SNAPSHOT

  const baseSubtotalCents =
    input.totalCents > 0
      ? Math.round((baseTotalCents * input.subtotalCents) / input.totalCents)
      : baseTotalCents
  const baseTaxCents = baseTotalCents - baseSubtotalCents

  return {
    baseCurrency,
    fxRateSetId: resolved.fxRateSetId ?? null,
    baseSubtotalCents,
    baseTaxCents,
    baseTotalCents,
  }
}

// ---------- pure helpers (unit-testable, no DB) ----------

export interface InvoiceTotals {
  subtotalCents: number
  taxCents: number
  totalCents: number
}

/**
 * Totals derived from lines. `total` is the sum of line totals (which already
 * include tax); `tax` is the sum of line tax; `subtotal = total − tax`. This is
 * internally consistent regardless of per-line unit×qty rounding.
 */
export function recomputeTotalsFromLines(
  lines: readonly SupplierInvoiceLineInput[],
): InvoiceTotals {
  let tax = 0
  let total = 0
  for (const line of lines) {
    tax += line.taxAmountCents ?? 0
    total += line.totalAmountCents
  }
  return { subtotalCents: total - tax, taxCents: tax, totalCents: total }
}

function assertNonNegativeCents(label: string, value: number | null | undefined) {
  if (value != null && value < 0) {
    throw new SupplierInvoiceServiceError(
      "invalid_payable_state",
      `${label} must be greater than or equal to 0`,
    )
  }
}

export function expectedSupplierInvoiceLineTotal(line: SupplierInvoiceLineInput): number {
  return (line.quantity ?? 1) * line.unitAmountCents + (line.taxAmountCents ?? 0)
}

export function validateSupplierInvoiceLines(lines: readonly SupplierInvoiceLineInput[]) {
  for (const [index, line] of lines.entries()) {
    const label = `line ${index + 1}`
    if ((line.quantity ?? 1) < 1) {
      throw new SupplierInvoiceServiceError(
        "invalid_payable_state",
        `${label} quantity must be at least 1`,
      )
    }
    assertNonNegativeCents(`${label} unit amount`, line.unitAmountCents)
    assertNonNegativeCents(`${label} tax amount`, line.taxAmountCents)
    assertNonNegativeCents(`${label} total amount`, line.totalAmountCents)

    const expectedTotal = expectedSupplierInvoiceLineTotal(line)
    if (line.totalAmountCents !== expectedTotal) {
      throw new SupplierInvoiceServiceError(
        "invalid_payable_state",
        `${label} total amount must equal quantity × unit amount plus tax (${expectedTotal})`,
      )
    }
  }
}

function validateHeaderTotals(input: {
  supplierId?: string | null
  subtotalCents?: number | null
  taxCents?: number | null
  totalCents?: number | null
  baseSubtotalCents?: number | null
  baseTaxCents?: number | null
  baseTotalCents?: number | null
}) {
  if (input.supplierId != null && input.supplierId.trim().length === 0) {
    throw new SupplierInvoiceServiceError(
      "invalid_payable_state",
      "supplierId is required for supplier invoices",
    )
  }
  assertNonNegativeCents("subtotalCents", input.subtotalCents)
  assertNonNegativeCents("taxCents", input.taxCents)
  assertNonNegativeCents("totalCents", input.totalCents)
  assertNonNegativeCents("baseSubtotalCents", input.baseSubtotalCents)
  assertNonNegativeCents("baseTaxCents", input.baseTaxCents)
  assertNonNegativeCents("baseTotalCents", input.baseTotalCents)
}

async function assertSupplierReferenceExists(
  db: PostgresJsDatabase,
  supplierId: string | null | undefined,
) {
  if (!supplierId) return

  const tableResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'suppliers'
    ) AS table_exists
  `)
  const tableExists = Boolean(toRows<{ table_exists: boolean }>(tableResult)[0]?.table_exists)
  if (!tableExists) return

  const supplierResult = await db.execute(
    sql`SELECT id FROM suppliers WHERE id = ${supplierId} LIMIT 1`,
  )
  if (toRows<{ id: string }>(supplierResult).length === 0) {
    throw new SupplierInvoiceServiceError(
      "invalid_payable_state",
      "supplierId does not reference an existing supplier",
    )
  }
}

function validateProvidedTotalsAgainstLines(
  input: Pick<CreateSupplierInvoiceInput, "subtotalCents" | "taxCents" | "totalCents">,
  totals: InvoiceTotals,
) {
  const mismatches = [
    ["subtotalCents", input.subtotalCents, totals.subtotalCents],
    ["taxCents", input.taxCents, totals.taxCents],
    ["totalCents", input.totalCents, totals.totalCents],
  ] as const
  for (const [field, provided, expected] of mismatches) {
    if (provided != null && provided !== expected) {
      throw new SupplierInvoiceServiceError(
        "invalid_payable_state",
        `${field} must match the totals derived from supplier invoice lines (${expected})`,
      )
    }
  }
}

export interface AllocationCheckLine {
  id: string
  totalAmountCents: number
}

export interface AllocationCheckEntry {
  supplierInvoiceLineId?: string | null
  amountCents: number
}

export type AllocationCheckResult =
  | { ok: true }
  | { ok: false; code: SupplierInvoiceErrorCode; message: string }

/**
 * Allocation invariants (§6.1):
 *  1. One mode per invoice — either every allocation is whole-invoice
 *     (no line id) OR every allocation is per-line. Never mixed.
 *  2. Exactly-one-target is enforced upstream by the zod schema + DB check.
 *  3. No over-allocation — Σ per line ≤ that line's total; for whole-invoice
 *     mode, Σ ≤ the invoice total.
 *  4. Under-allocation is allowed. Nothing is stored for the remainder; the
 *     profitability read model derives it per currency and reports it as
 *     `unallocated` (`service-profitability.ts`). It is kept apart from that
 *     model's `unattributed` figure, which counts allocations deliberately
 *     targeted at nothing — an untouched leftover is a backlog, a deliberate
 *     `unattributed` allocation is a decision.
 */
export function validateAllocations(params: {
  invoiceTotalCents: number
  lines: readonly AllocationCheckLine[]
  allocations: readonly AllocationCheckEntry[]
}): AllocationCheckResult {
  const { invoiceTotalCents, lines, allocations } = params
  if (allocations.length === 0) return { ok: true }
  for (const allocation of allocations) {
    if (allocation.amountCents < 0) {
      return {
        ok: false,
        code: "invalid_payable_state",
        message: "supplier invoice allocations must be greater than or equal to 0",
      }
    }
  }

  const hasLineLess = allocations.some((a) => a.supplierInvoiceLineId == null)
  const hasPerLine = allocations.some((a) => a.supplierInvoiceLineId != null)
  if (hasLineLess && hasPerLine) {
    return {
      ok: false,
      code: "mixed_allocation_modes",
      message:
        "an invoice is allocated either whole-invoice or per-line, not both — split every allocation the same way",
    }
  }

  if (hasPerLine) {
    const lineTotals = new Map(lines.map((l) => [l.id, l.totalAmountCents]))
    const sums = new Map<string, number>()
    for (const a of allocations) {
      const lineId = a.supplierInvoiceLineId as string
      if (!lineTotals.has(lineId)) {
        return {
          ok: false,
          code: "unknown_allocation_line",
          message: `allocation references unknown line ${lineId}`,
        }
      }
      sums.set(lineId, (sums.get(lineId) ?? 0) + a.amountCents)
    }
    for (const [lineId, sum] of sums) {
      const total = lineTotals.get(lineId) ?? 0
      if (sum > total) {
        return {
          ok: false,
          code: "over_allocated",
          message: `line ${lineId} over-allocated (${sum} > ${total})`,
        }
      }
    }
    return { ok: true }
  }

  const sum = allocations.reduce((acc, a) => acc + a.amountCents, 0)
  if (sum > invoiceTotalCents) {
    return {
      ok: false,
      code: "over_allocated",
      message: `invoice over-allocated (${sum} > ${invoiceTotalCents})`,
    }
  }
  return { ok: true }
}

type SupplierInvoiceStatus = (typeof supplierInvoices.$inferSelect)["status"]

/**
 * Next status given paid vs total. Manual/terminal states (draft, disputed,
 * void) are never auto-changed. `paid` only flips automatically among the
 * settlement states.
 */
export function nextStatusForBalance(
  current: SupplierInvoiceStatus,
  totalCents: number,
  paidCents: number,
): SupplierInvoiceStatus {
  if (current === "draft" || current === "disputed" || current === "void") return current
  if (totalCents > 0 && paidCents >= totalCents) return "paid"
  if (paidCents > 0) return "partially_paid"
  // Fully unpaid (e.g. a payment was reversed): drop back from a paid state.
  return current === "paid" || current === "partially_paid" ? "approved" : current
}

/**
 * Recompute `paidCents` / `balanceDueCents` / `status` for a supplier invoice
 * from its completed payments. Currency-aware: a payment counts in the invoice
 * currency directly, or via its base amount when the base currency matches
 * (mirrors the AR settlement approach). §5.4 / §10.
 */
export async function recomputeSupplierInvoiceBalance(
  db: PostgresJsDatabase,
  supplierInvoiceId: string,
) {
  const [invoice] = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.id, supplierInvoiceId))
    .limit(1)
  if (!invoice) return null

  const [agg] = await db
    .select({
      paid: sql<number>`coalesce(sum(
        case
          when ${supplierPayments.currency} = ${invoice.currency} then ${supplierPayments.amountCents}
          when ${supplierPayments.baseCurrency} = ${invoice.currency} then coalesce(${supplierPayments.baseAmountCents}, 0)
          else 0
        end
      ), 0)::int`,
    })
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.supplierInvoiceId, supplierInvoiceId),
        eq(supplierPayments.status, "completed"),
      ),
    )

  const paid = agg?.paid ?? 0
  const [updated] = await db
    .update(supplierInvoices)
    .set({
      paidCents: paid,
      balanceDueCents: invoice.totalCents - paid,
      status: nextStatusForBalance(invoice.status, invoice.totalCents, paid),
      updatedAt: new Date(),
    })
    .where(eq(supplierInvoices.id, supplierInvoiceId))
    .returning()
  return updated ?? null
}

// ---------- internal mappers ----------

/**
 * Map an allocation input to a DB row. `baseRate` (= invoice base total / invoice
 * total, snapshotted at the issue-date rate) converts each allocation's amount to
 * the accounting base so the per-departure rollup can sum recorded base amounts
 * without re-running FX. Null `baseRate` leaves base null (no resolvable rate).
 */
function allocationValues(
  supplierInvoiceId: string,
  a: SupplierCostAllocationInput,
  baseRate: number | null = null,
) {
  const baseAmountCents =
    baseRate != null ? Math.round(a.amountCents * baseRate) : (a.baseAmountCents ?? null)
  return {
    supplierInvoiceId,
    supplierInvoiceLineId: a.supplierInvoiceLineId ?? null,
    targetType: a.targetType,
    departureId: a.departureId ?? null,
    productId: a.productId ?? null,
    bookingId: a.bookingId ?? null,
    bookingItemId: a.bookingItemId ?? null,
    travelerId: a.travelerId ?? null,
    amountCents: a.amountCents,
    baseAmountCents,
    splitMethod: a.splitMethod ?? "manual",
  }
}

/** Base-conversion rate snapshotted on an invoice: base total ÷ original total. */
function invoiceBaseRate(invoice: {
  totalCents: number
  baseTotalCents: number | null
}): number | null {
  if (invoice.baseTotalCents == null || invoice.totalCents === 0) return null
  return invoice.baseTotalCents / invoice.totalCents
}

function lineValues(supplierInvoiceId: string, line: SupplierInvoiceLineInput, index: number) {
  return {
    supplierInvoiceId,
    description: line.description,
    serviceType: line.serviceType ?? "other",
    costCategoryId: line.costCategoryId ?? null,
    supplierServiceId: line.supplierServiceId ?? null,
    quantity: line.quantity ?? 1,
    unitAmountCents: line.unitAmountCents,
    taxRateBps: line.taxRateBps ?? null,
    taxAmountCents: line.taxAmountCents ?? 0,
    totalAmountCents: line.totalAmountCents,
    sortOrder: line.sortOrder ?? index,
  }
}

async function loadSupplierInvoice(db: PostgresJsDatabase, id: string) {
  const [invoice] = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.id, id))
    .limit(1)
  if (!invoice) return null
  const [lines, allocations] = await Promise.all([
    db
      .select()
      .from(supplierInvoiceLines)
      .where(eq(supplierInvoiceLines.supplierInvoiceId, id))
      .orderBy(asc(supplierInvoiceLines.sortOrder)),
    db
      .select()
      .from(supplierCostAllocations)
      .where(eq(supplierCostAllocations.supplierInvoiceId, id))
      .orderBy(asc(supplierCostAllocations.createdAt)),
  ])
  const [targetLabels, supplierNames] = await Promise.all([
    resolveAllocationTargetLabels(db, allocations),
    resolveSupplierNames(db, [invoice.supplierId]),
  ])
  const allocationsWithLabels = allocations.map((a) => ({
    ...a,
    targetLabel:
      targetLabels.get(a.departureId ?? a.productId ?? a.bookingId ?? a.travelerId ?? "") ?? null,
  }))
  return {
    ...invoice,
    supplierName: supplierNames.get(invoice.supplierId) ?? null,
    lines,
    allocations: allocationsWithLabels,
  }
}

/**
 * Resolve supplier display names for AP reads. The invoice stores only the
 * supplier's id (a loose text reference, no cross-package FK — see
 * `useSupplierPicker`), so every read that shows an invoice has to join the name
 * back or the screen shows a ULID. Read-only, ids parameter-bound, and tolerant
 * of a deployment whose graph does not include the suppliers module at all — the
 * same shape as {@link resolveAllocationTargetLabels}.
 */
export async function resolveSupplierNames(
  db: PostgresJsDatabase,
  supplierIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const ids = [...new Set(supplierIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return names

  const tableResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'suppliers'
    ) AS table_exists
  `)
  if (!toRows<{ table_exists: boolean }>(tableResult)[0]?.table_exists) return names

  const rows = await executeBoundaryRows<{ id: string; name: string | null }>(
    db,
    // agent-quality: raw-sql reviewed -- owner: finance; Supplier is a read-only display-name source and ids are parameter-bound.
    sql`
      SELECT id, name
      FROM suppliers
      WHERE id IN (${sqlList(ids)})
    `,
  )
  for (const row of rows) if (row.name) names.set(row.id, row.name)
  return names
}

/** Resolve friendly labels for allocation targets (departure date+product, product, booking no). */
async function resolveAllocationTargetLabels(
  db: PostgresJsDatabase,
  allocations: Array<{
    departureId: string | null
    productId: string | null
    bookingId: string | null
  }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const departureIds = [
    ...new Set(allocations.map((a) => a.departureId).filter(Boolean)),
  ] as string[]
  const productIds = [...new Set(allocations.map((a) => a.productId).filter(Boolean))] as string[]
  const bookingIds = [...new Set(allocations.map((a) => a.bookingId).filter(Boolean))] as string[]

  const [slotRows, productRows, bookingRows] = await Promise.all([
    departureIds.length
      ? executeBoundaryRows<{
          id: string
          date_local: Date | string
          product_name: string | null
        }>(
          db,
          // agent-quality: raw-sql reviewed -- owner: finance; Availability/Product are read-only allocation label sources and ids are parameter-bound.
          sql`
            SELECT avs.id, avs.date_local, p.name AS product_name
            FROM availability_slots avs
            LEFT JOIN products p ON avs.product_id = p.id
            WHERE avs.id IN (${sqlList(departureIds)})
          `,
        )
      : Promise.resolve([]),
    productIds.length
      ? executeBoundaryRows<{ id: string; name: string }>(
          db,
          // agent-quality: raw-sql reviewed -- owner: finance; Product is a read-only allocation label source and ids are parameter-bound.
          sql`
            SELECT id, name
            FROM products
            WHERE id IN (${sqlList(productIds)})
          `,
        )
      : Promise.resolve([]),
    bookingIds.length
      ? db
          .select({ id: bookings.id, bookingNumber: bookings.bookingNumber })
          .from(bookings)
          .where(inArray(bookings.id, bookingIds))
      : Promise.resolve([]),
  ])

  for (const s of slotRows) {
    const dateLocal = normalizeDateOnly(s.date_local) ?? String(s.date_local)
    labels.set(s.id, s.product_name ? `${s.product_name} · ${dateLocal}` : dateLocal)
  }
  for (const p of productRows) labels.set(p.id, p.name)
  for (const b of bookingRows) labels.set(b.id, b.bookingNumber)
  return labels
}

const SORT_COLUMNS = {
  issueDate: supplierInvoices.issueDate,
  dueDate: supplierInvoices.dueDate,
  totalCents: supplierInvoices.totalCents,
  balanceDueCents: supplierInvoices.balanceDueCents,
  status: supplierInvoices.status,
  createdAt: supplierInvoices.createdAt,
} as const

export const supplierInvoicesService = {
  async list(db: PostgresJsDatabase, query: SupplierInvoiceListQuery) {
    const conditions = [isNull(supplierInvoices.deletedAt)]
    if (query.supplierId) conditions.push(eq(supplierInvoices.supplierId, query.supplierId))
    if (query.status) conditions.push(eq(supplierInvoices.status, query.status))
    if (query.currency) conditions.push(eq(supplierInvoices.currency, query.currency))
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.dueDateFrom) conditions.push(sql`${supplierInvoices.dueDate} >= ${query.dueDateFrom}`)
    // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (query.dueDateTo) conditions.push(sql`${supplierInvoices.dueDate} <= ${query.dueDateTo}`)
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(supplierInvoices.supplierInvoiceNo, term),
          ilike(supplierInvoices.internalRef, term),
          ilike(supplierInvoices.notes, term),
        )!,
      )
    }
    // Attribution filters join through the allocations table.
    const attributedTo = (column: AnyColumn, value: string) =>
      inArray(
        supplierInvoices.id,
        db
          .select({ id: supplierCostAllocations.supplierInvoiceId })
          .from(supplierCostAllocations)
          .where(eq(column, value)),
      )
    if (query.departureId) {
      conditions.push(attributedTo(supplierCostAllocations.departureId, query.departureId))
    }
    if (query.productId) {
      conditions.push(attributedTo(supplierCostAllocations.productId, query.productId))
    }
    if (query.bookingId) {
      conditions.push(attributedTo(supplierCostAllocations.bookingId, query.bookingId))
    }

    const where = and(...conditions)
    const sortColumn = SORT_COLUMNS[query.sortBy]
    const orderBy = query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn)

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(supplierInvoices)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(orderBy),
      db.select({ count: sql<number>`count(*)::int` }).from(supplierInvoices).where(where),
    ])

    const supplierNames = await resolveSupplierNames(
      db,
      rows.map((row) => row.supplierId),
    )

    return {
      data: rows.map((row) => ({
        ...row,
        supplierName: supplierNames.get(row.supplierId) ?? null,
      })),
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getById(db: PostgresJsDatabase, id: string) {
    return loadSupplierInvoice(db, id)
  },

  async create(
    db: PostgresJsDatabase,
    input: CreateSupplierInvoiceInput,
    runtime: SupplierInvoiceServiceRuntime = {},
  ) {
    validateHeaderTotals(input)
    const lines = input.lines ?? []
    const allocations = input.allocations ?? []
    validateSupplierInvoiceLines(lines)

    // Create-time allocations must be whole-invoice: new lines have no ids yet,
    // so per-line allocation has to happen via setAllocations after create.
    if (allocations.some((a) => a.supplierInvoiceLineId)) {
      throw new SupplierInvoiceServiceError(
        "allocate_lines_after_create",
        "per-line allocations must be set after the invoice (and its lines) exist",
      )
    }

    const totals = lines.length
      ? recomputeTotalsFromLines(lines)
      : {
          subtotalCents: input.subtotalCents ?? 0,
          taxCents: input.taxCents ?? 0,
          totalCents: input.totalCents ?? 0,
        }
    if (lines.length) validateProvidedTotalsAgainstLines(input, totals)

    const check = validateAllocations({
      invoiceTotalCents: totals.totalCents,
      lines: [],
      allocations,
    })
    if (!check.ok) throw new SupplierInvoiceServiceError(check.code, check.message)

    await assertSupplierReferenceExists(db, input.supplierId)

    const fx = await snapshotSupplierInvoiceFx(
      db,
      {
        currency: input.currency,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        baseCurrency: input.baseCurrency ?? null,
        fxRateSetId: input.fxRateSetId ?? null,
        issueDate: input.issueDate,
      },
      runtime,
    )
    const baseRate = invoiceBaseRate({
      totalCents: totals.totalCents,
      baseTotalCents: fx.baseTotalCents,
    })

    const created = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(supplierInvoices)
        .values({
          supplierId: input.supplierId,
          supplierInvoiceNo: input.supplierInvoiceNo,
          internalRef: input.internalRef ?? null,
          status: input.status ?? "draft",
          currency: input.currency,
          baseCurrency: fx.baseCurrency,
          fxRateSetId: fx.fxRateSetId,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          baseSubtotalCents: fx.baseSubtotalCents,
          baseTaxCents: fx.baseTaxCents,
          baseTotalCents: fx.baseTotalCents,
          paidCents: 0,
          balanceDueCents: totals.totalCents,
          taxRegimeId: input.taxRegimeId ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate ?? null,
          storageKey: input.storageKey ?? null,
          extractionId: input.extractionId ?? null,
          notes: input.notes ?? null,
        })
        .returning()

      if (!invoice) return null

      if (lines.length) {
        await tx
          .insert(supplierInvoiceLines)
          .values(lines.map((line, index) => lineValues(invoice.id, line, index)))
      }
      if (allocations.length) {
        await tx
          .insert(supplierCostAllocations)
          .values(allocations.map((a) => allocationValues(invoice.id, a, baseRate)))
      }

      if (runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          await buildSupplierInvoiceCreateActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return invoice
    })

    return created ? loadSupplierInvoice(db, created.id) : null
  },

  async update(
    db: PostgresJsDatabase,
    id: string,
    input: UpdateSupplierInvoiceInput,
    runtime: SupplierInvoiceServiceRuntime = {},
  ) {
    validateHeaderTotals(input)
    await assertSupplierReferenceExists(db, input.supplierId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of [
      "supplierId",
      "supplierInvoiceNo",
      "internalRef",
      "status",
      "currency",
      "baseCurrency",
      "fxRateSetId",
      "taxRegimeId",
      "issueDate",
      "dueDate",
      "storageKey",
      "extractionId",
      "notes",
    ] as const) {
      if (input[key] !== undefined) set[key] = input[key]
    }
    // If header totals are edited directly, keep balanceDue consistent.
    if (input.totalCents !== undefined) {
      set.totalCents = input.totalCents
      if (input.subtotalCents !== undefined) set.subtotalCents = input.subtotalCents
      if (input.taxCents !== undefined) set.taxCents = input.taxCents
    }

    // Re-snapshot base amounts when any FX-affecting field changes (currency,
    // declared base/rate-set, issue date, or totals). Uses the merged row so a
    // partial edit still resolves the correct issue-date rate.
    const fxAffected =
      input.currency !== undefined ||
      input.baseCurrency !== undefined ||
      input.fxRateSetId !== undefined ||
      input.issueDate !== undefined ||
      input.totalCents !== undefined ||
      input.subtotalCents !== undefined ||
      input.taxCents !== undefined
    if (fxAffected) {
      const [current] = await db
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, id))
        .limit(1)
      if (current) {
        const totalCents = input.totalCents ?? current.totalCents
        if (totalCents < current.paidCents) {
          throw new SupplierInvoiceServiceError(
            "invalid_payable_state",
            `supplier invoice total cannot be less than completed payments (${current.paidCents})`,
          )
        }
        const fx = await snapshotSupplierInvoiceFx(
          db,
          {
            currency: input.currency ?? current.currency,
            subtotalCents: input.subtotalCents ?? current.subtotalCents,
            taxCents: input.taxCents ?? current.taxCents,
            totalCents,
            baseCurrency: input.baseCurrency ?? current.baseCurrency,
            fxRateSetId: input.fxRateSetId ?? current.fxRateSetId,
            issueDate: input.issueDate ?? current.issueDate,
          },
          runtime,
        )
        set.baseCurrency = fx.baseCurrency
        set.fxRateSetId = fx.fxRateSetId
        set.baseSubtotalCents = fx.baseSubtotalCents
        set.baseTaxCents = fx.baseTaxCents
        set.baseTotalCents = fx.baseTotalCents
      }
    }

    const runUpdate = (writer: PostgresJsDatabase) =>
      writer.update(supplierInvoices).set(set).where(eq(supplierInvoices.id, id)).returning()

    if (runtime.actionLedgerContext) {
      const row = await db.transaction(async (tx) => {
        const [updated] = await runUpdate(tx)
        if (updated && input.totalCents !== undefined) {
          await tx
            .update(supplierInvoices)
            .set({ balanceDueCents: updated.totalCents - updated.paidCents })
            .where(eq(supplierInvoices.id, id))
        }
        if (updated) {
          await appendActionLedgerMutation(
            tx,
            buildSupplierInvoiceUpdateActionLedgerInput(
              runtime.actionLedgerContext as ActionLedgerRequestContextValues,
              { invoice: updated, changes: input },
              { authorizationSource: runtime.actionLedgerAuthorizationSource },
            ),
          )
        }
        return updated ?? null
      })
      return row ? loadSupplierInvoice(db, id) : null
    }

    const [updated] = await runUpdate(db)
    if (updated && input.totalCents !== undefined) {
      await db
        .update(supplierInvoices)
        .set({ balanceDueCents: updated.totalCents - updated.paidCents })
        .where(eq(supplierInvoices.id, id))
    }
    return updated ? loadSupplierInvoice(db, id) : null
  },

  /**
   * Replace the invoice's lines and recompute header totals. Note: deleting a
   * line cascades to any per-line allocations bound to it (FK on delete cascade)
   * — re-set allocations after editing lines.
   */
  async setLines(
    db: PostgresJsDatabase,
    id: string,
    input: SetLinesInput,
    runtime: SupplierInvoiceServiceRuntime = {},
  ) {
    validateSupplierInvoiceLines(input.lines)
    const totals = recomputeTotalsFromLines(input.lines)
    const updated = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, id))
        .limit(1)
      if (!invoice) return null
      if (totals.totalCents < invoice.paidCents) {
        throw new SupplierInvoiceServiceError(
          "invalid_payable_state",
          `supplier invoice total cannot be less than completed payments (${invoice.paidCents})`,
        )
      }

      await tx.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplierInvoiceId, id))
      if (input.lines.length) {
        await tx
          .insert(supplierInvoiceLines)
          .values(input.lines.map((line, index) => lineValues(id, line, index)))
      }

      // Per-line allocations cascade out with their lines, but whole-invoice
      // (line-less) allocations survive — and a shrunk line total could leave
      // them over-allocated. Re-validate against the NEW total and reject rather
      // than silently corrupt the P&L (mirrors setAllocations' invariant).
      const survivingAllocations = await tx
        .select({
          supplierInvoiceLineId: supplierCostAllocations.supplierInvoiceLineId,
          amountCents: supplierCostAllocations.amountCents,
        })
        .from(supplierCostAllocations)
        .where(eq(supplierCostAllocations.supplierInvoiceId, id))
      if (survivingAllocations.length) {
        const check = validateAllocations({
          invoiceTotalCents: totals.totalCents,
          lines: [],
          allocations: survivingAllocations,
        })
        if (!check.ok) throw new SupplierInvoiceServiceError(check.code, check.message)
      }

      // Totals changed → re-snapshot the base value at the invoice's issue date.
      const fx = await snapshotSupplierInvoiceFx(
        db,
        {
          currency: invoice.currency,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          baseCurrency: invoice.baseCurrency,
          fxRateSetId: invoice.fxRateSetId,
          issueDate: invoice.issueDate,
        },
        runtime,
      )
      const [next] = await tx
        .update(supplierInvoices)
        .set({
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          baseCurrency: fx.baseCurrency,
          fxRateSetId: fx.fxRateSetId,
          baseSubtotalCents: fx.baseSubtotalCents,
          baseTaxCents: fx.baseTaxCents,
          baseTotalCents: fx.baseTotalCents,
          balanceDueCents: totals.totalCents - invoice.paidCents,
          updatedAt: new Date(),
        })
        .where(eq(supplierInvoices.id, id))
        .returning()

      if (next && runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildSupplierInvoiceUpdateActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice: next, changes: { lines: input.lines.length } },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }
      return next ?? null
    })
    return updated ? loadSupplierInvoice(db, id) : null
  },

  /**
   * Replace the invoice's cost allocations after validating the §6.1 invariants
   * against the current lines + invoice total.
   */
  async setAllocations(
    db: PostgresJsDatabase,
    id: string,
    input: SetAllocationsInput,
    runtime: SupplierInvoiceServiceRuntime = {},
  ) {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, id))
        .limit(1)
      if (!invoice) return { invoice: null as null }

      const lines = await tx
        .select({
          id: supplierInvoiceLines.id,
          totalAmountCents: supplierInvoiceLines.totalAmountCents,
        })
        .from(supplierInvoiceLines)
        .where(eq(supplierInvoiceLines.supplierInvoiceId, id))

      const check = validateAllocations({
        invoiceTotalCents: invoice.totalCents,
        lines,
        allocations: input.allocations,
      })
      if (!check.ok) throw new SupplierInvoiceServiceError(check.code, check.message)

      await tx
        .delete(supplierCostAllocations)
        .where(eq(supplierCostAllocations.supplierInvoiceId, id))
      if (input.allocations.length) {
        const baseRate = invoiceBaseRate(invoice)
        await tx
          .insert(supplierCostAllocations)
          .values(input.allocations.map((a) => allocationValues(id, a, baseRate)))
      }

      if (runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildSupplierInvoiceAllocationsActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice, allocationCount: input.allocations.length },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }
      return { invoice }
    })
    return result.invoice ? loadSupplierInvoice(db, id) : null
  },

  /** Soft-delete: keeps the audit trail; excluded from list + uniqueness. */
  async softDelete(
    db: PostgresJsDatabase,
    id: string,
    runtime: SupplierInvoiceServiceRuntime = {},
  ) {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, id))
        .limit(1)
      if (!existing) return null

      await tx
        .update(supplierInvoices)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(supplierInvoices.id, id))

      if (runtime.actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildSupplierInvoiceDeleteActionLedgerInput(
            runtime.actionLedgerContext,
            { invoice: existing },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }
      return { id: existing.id }
    })
    return result
  },

  // ---------- attachments ----------

  listAttachments(db: PostgresJsDatabase, supplierInvoiceId: string) {
    return db
      .select()
      .from(supplierInvoiceAttachments)
      .where(eq(supplierInvoiceAttachments.supplierInvoiceId, supplierInvoiceId))
      .orderBy(desc(supplierInvoiceAttachments.createdAt))
  },

  async getAttachmentById(db: PostgresJsDatabase, attachmentId: string) {
    const [row] = await db
      .select()
      .from(supplierInvoiceAttachments)
      .where(eq(supplierInvoiceAttachments.id, attachmentId))
      .limit(1)
    return row ?? null
  },

  async createAttachment(
    db: PostgresJsDatabase,
    supplierInvoiceId: string,
    input: CreateAttachmentInput,
  ) {
    const [invoice] = await db
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, supplierInvoiceId))
      .limit(1)
    if (!invoice) return null

    const [row] = await db
      .insert(supplierInvoiceAttachments)
      .values({
        supplierInvoiceId,
        kind: input.kind ?? "supporting_document",
        name: input.name,
        mimeType: input.mimeType ?? null,
        fileSize: input.fileSize ?? null,
        storageKey: input.storageKey ?? null,
        checksum: input.checksum ?? null,
        metadata: input.metadata ?? null,
      })
      .returning()
    return row ?? null
  },

  async deleteAttachment(db: PostgresJsDatabase, supplierInvoiceId: string, attachmentId: string) {
    const [existing] = await db
      .select({ id: supplierInvoiceAttachments.id })
      .from(supplierInvoiceAttachments)
      .where(
        and(
          eq(supplierInvoiceAttachments.id, attachmentId),
          eq(supplierInvoiceAttachments.supplierInvoiceId, supplierInvoiceId),
        ),
      )
      .limit(1)
    if (!existing) return null
    await db
      .delete(supplierInvoiceAttachments)
      .where(eq(supplierInvoiceAttachments.id, attachmentId))
    return { id: existing.id }
  },
}
