/**
 * Response/envelope schemas for the markets admin OpenAPI routes (voyant#2276 —
 * step 3.5). The row schemas are authored from the Drizzle `$inferSelect` shapes
 * in `schema.ts` (§17: `timestamp`/`date` columns serialize to ISO strings over
 * the wire; `numeric` columns serialize to decimal strings; integer columns stay
 * numbers; jsonb bags are open records). Enum columns reuse the exported
 * `validation.ts` enum schemas so the documented values stay in lock-step with
 * request validation. The `markets` row schema (`marketSchema`) lives in
 * `validation.ts` (it is also the response-contract fixture target) and is
 * re-exported here so route declarations read every row shape from one module.
 */

import { z } from "zod"

import {
  fxRateSourceSchema,
  marketChannelScopeSchema,
  marketSchema,
  marketSellabilitySchema,
  marketVisibilitySchema,
} from "./validation.js"

export { marketSchema }

// --- shared envelopes -------------------------------------------------------

export const errorResponseSchema = z.object({ error: z.string() })
export const successResponseSchema = z.object({ success: z.literal(true) })
const idSchema = z.string()
export const idParamSchema = z.object({ id: idSchema })

// §17: `timestamp`/`date` columns are serialized to ISO strings over the wire;
// `numeric` columns serialize to decimal strings.
const isoTimestamp = z.string()
const isoDate = z.string()
const decimalString = z.string()
const jsonRecord = z.record(z.string(), z.unknown())

// --- market locale ----------------------------------------------------------

export const marketLocaleSchema = z.object({
  id: idSchema,
  marketId: z.string(),
  languageTag: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- market currency --------------------------------------------------------

export const marketCurrencySchema = z.object({
  id: idSchema,
  marketId: z.string(),
  currencyCode: z.string(),
  isDefault: z.boolean(),
  isSettlement: z.boolean(),
  isReporting: z.boolean(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- fx rate set ------------------------------------------------------------

export const fxRateSetSchema = z.object({
  id: idSchema,
  source: fxRateSourceSchema,
  baseCurrency: z.string(),
  effectiveAt: isoTimestamp,
  observedAt: isoTimestamp.nullable(),
  sourceReference: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
})

// --- exchange rate ----------------------------------------------------------

export const exchangeRateSchema = z.object({
  id: idSchema,
  fxRateSetId: z.string(),
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  rateDecimal: decimalString,
  inverseRateDecimal: decimalString.nullable(),
  /** `rateDecimal` with the operator's currency-risk margin folded in. */
  effectiveRateDecimal: decimalString.nullable(),
  /** The margin, in basis points, that produced `effectiveRateDecimal`. */
  commissionBps: z.number().int().nullable(),
  observedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
})

// --- market price catalog ---------------------------------------------------

export const marketPriceCatalogSchema = z.object({
  id: idSchema,
  marketId: z.string(),
  priceCatalogId: z.string(),
  isDefault: z.boolean(),
  priority: z.number().int(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- market product rule ----------------------------------------------------

export const marketProductRuleSchema = z.object({
  id: idSchema,
  marketId: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  priceCatalogId: z.string().nullable(),
  visibility: marketVisibilitySchema,
  sellability: marketSellabilitySchema,
  channelScope: marketChannelScopeSchema,
  active: z.boolean(),
  availableFrom: isoDate.nullable(),
  availableTo: isoDate.nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- market channel rule ----------------------------------------------------

export const marketChannelRuleSchema = z.object({
  id: idSchema,
  marketId: z.string(),
  channelId: z.string(),
  priceCatalogId: z.string().nullable(),
  visibility: marketVisibilitySchema,
  sellability: marketSellabilitySchema,
  active: z.boolean(),
  priority: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
