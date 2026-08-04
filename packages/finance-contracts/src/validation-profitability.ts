import { z } from "zod"

/**
 * Profitability read-model contracts (RFC §8). The read model is computed, not
 * stored: actual cost from `supplier_cost_allocations`, revenue from issued
 * customer invoices (AR), planned cost from `booking_items`. Rows are emitted
 * **per currency** — amounts are never summed across currencies (no FX in v1).
 *
 * Only the query inputs are contracts here; the response shapes are authored
 * from the service interfaces next to the routes that serve them
 * (`@voyant-travel/finance` `routes-reports.ts`). Alongside the rows those
 * responses carry two separate unaccounted-cost figures: `unattributed` (cost
 * allocated to no departure on purpose) and `unallocated` (the under-allocated
 * remainder of a supplier invoice, which has no allocation row at all).
 */

export const departureProfitabilityQuerySchema = z.object({
  /** Filter by departure date (derived from booking items), inclusive. */
  from: z.string().optional(),
  to: z.string().optional(),
  productId: z.string().optional(),
  departureId: z.string().optional(),
  currency: z.string().optional(),
  /** When set, also return a single-currency rollup converted via persisted FX rates. */
  baseCurrency: z.string().optional(),
})

export const productProfitabilityQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  currency: z.string().optional(),
  /** When set, also return a single-currency rollup converted via persisted FX rates. */
  baseCurrency: z.string().optional(),
})

/**
 * Per-traveller P&L for a single departure (RFC §6) — derived on read by
 * splitting the departure's revenue/cost across its travellers (equal split).
 * Scoped to one currency (the view's active currency).
 */
export const travelerProfitabilityQuerySchema = z.object({
  departureId: z.string().min(1),
  currency: z.string().min(1),
})

/**
 * Accountant share — a revocable public link scoped to a date range that opens
 * the read-only finance portal (RFC §13.2).
 */
export const createAccountantShareSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  baseCurrency: z.string().optional(),
  ttlDays: z.number().int().positive().max(365).optional(),
})

export type DepartureProfitabilityQuery = z.infer<typeof departureProfitabilityQuerySchema>
export type ProductProfitabilityQuery = z.infer<typeof productProfitabilityQuerySchema>
export type TravelerProfitabilityQuery = z.infer<typeof travelerProfitabilityQuerySchema>
export type CreateAccountantShareInput = z.infer<typeof createAccountantShareSchema>
