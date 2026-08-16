import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { type SQL, type SQLWrapper, sql } from "drizzle-orm"

import { optionUnits, productOptions, products } from "./schema-core.js"
import {
  productDayServices,
  productDays,
  productItineraries,
  productMedia,
} from "./schema-itinerary.js"
import { productCapabilities, productDeliveryFormats } from "./schema-settings.js"

const DEFAULT_SAMPLE_LIMIT = 20
const MAX_SAMPLE_LIMIT = 100

const PRODUCT_CREATE_ACTION_NAME = "product.create"
const PRODUCT_OPTION_CREATE_ACTION_NAME = "product.option.create"
const OPTION_UNIT_CREATE_ACTION_NAME = "product.option_unit.create"
const PRODUCT_ITINERARY_CREATE_ACTION_NAMES = [
  "product.itinerary.create",
  "product.itinerary.duplicate",
] as const
const PRODUCT_DAY_CREATE_ACTION_NAME = "product.day.create"
const PRODUCT_DAY_SERVICE_CREATE_ACTION_NAME = "product.day_service.create"
const PRODUCT_MEDIA_CREATE_ACTION_NAME = "product.media.create"
const PRODUCT_DAY_MEDIA_CREATE_ACTION_NAME = "product.day_media.create"
const PRODUCT_BROCHURE_CREATE_ACTION_NAME = "product.brochure.create"
const PRODUCT_CAPABILITY_CREATE_ACTION_NAME = "product.capability.create"
const PRODUCT_DELIVERY_FORMAT_CREATE_ACTION_NAME = "product.delivery_format.create"

export type ProductActionLedgerDriftCheck =
  | "product"
  | "product_option"
  | "option_unit"
  | "product_itinerary"
  | "product_day"
  | "product_day_service"
  | "product_media"
  | "product_capability"
  | "product_delivery_format"

export interface CheckProductActionLedgerDriftInput {
  createdAtFrom?: Date | string | null
  sampleLimit?: number | null
}

export interface ProductActionLedgerDriftRow {
  check: ProductActionLedgerDriftCheck
  missingCount: number
  sampleIds: string[]
}

export interface CheckProductActionLedgerDriftResult {
  ok: boolean
  rows: ProductActionLedgerDriftRow[]
}

interface ProductActionLedgerDriftQueryRow extends Record<string, unknown> {
  check: ProductActionLedgerDriftCheck
  missing_count: number | string
  sample_ids: string[] | null
}

export function buildProductActionLedgerDriftQueries(
  input: CheckProductActionLedgerDriftInput = {},
): Record<ProductActionLedgerDriftCheck, SQL<ProductActionLedgerDriftQueryRow>> {
  const sampleLimit = normalizeSampleLimit(input.sampleLimit)

  return {
    product: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${products.id} AS candidate_id,
          ${products.createdAt} AS created_at,
          row_number() OVER (ORDER BY ${products.createdAt} DESC, ${products.id} DESC) AS sample_ordinal
        FROM ${products}
        WHERE 1 = 1
          ${buildCreatedAtCondition(products.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${products.id}
          )
      ) missing
    `,
    product_option: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_option' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productOptions.id} AS candidate_id,
          ${productOptions.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productOptions.createdAt} DESC, ${productOptions.id} DESC
          ) AS sample_ordinal
        FROM ${productOptions}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productOptions.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_OPTION_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productOptions.productId}
          )
      ) missing
    `,
    option_unit: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'option_unit' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${optionUnits.id} AS candidate_id,
          ${optionUnits.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${optionUnits.createdAt} DESC, ${optionUnits.id} DESC
          ) AS sample_ordinal
        FROM ${optionUnits}
        INNER JOIN ${productOptions} ON ${productOptions.id} = ${optionUnits.optionId}
        WHERE 1 = 1
          ${buildCreatedAtCondition(optionUnits.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${OPTION_UNIT_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productOptions.productId}
          )
      ) missing
    `,
    product_itinerary: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_itinerary' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productItineraries.id} AS candidate_id,
          ${productItineraries.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productItineraries.createdAt} DESC, ${productItineraries.id} DESC
          ) AS sample_ordinal
        FROM ${productItineraries}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productItineraries.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} IN (${sql.join(
              // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
              PRODUCT_ITINERARY_CREATE_ACTION_NAMES.map((actionName) => sql`${actionName}`),
              sql`, `,
            )})
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productItineraries.productId}
          )
      ) missing
    `,
    product_day: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_day' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productDays.id} AS candidate_id,
          ${productDays.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productDays.createdAt} DESC, ${productDays.id} DESC
          ) AS sample_ordinal
        FROM ${productDays}
        INNER JOIN ${productItineraries} ON ${productItineraries.id} = ${productDays.itineraryId}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productDays.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_DAY_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productItineraries.productId}
          )
      ) missing
    `,
    product_day_service: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_day_service' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productDayServices.id} AS candidate_id,
          ${productDayServices.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productDayServices.createdAt} DESC, ${productDayServices.id} DESC
          ) AS sample_ordinal
        FROM ${productDayServices}
        INNER JOIN ${productDays} ON ${productDays.id} = ${productDayServices.dayId}
        INNER JOIN ${productItineraries} ON ${productItineraries.id} = ${productDays.itineraryId}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productDayServices.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_DAY_SERVICE_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productItineraries.productId}
          )
      ) missing
    `,
    product_media: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_media' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productMedia.id} AS candidate_id,
          ${productMedia.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productMedia.createdAt} DESC, ${productMedia.id} DESC
          ) AS sample_ordinal
        FROM ${productMedia}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productMedia.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = CASE
                WHEN ${productMedia.isBrochure} = true THEN ${PRODUCT_BROCHURE_CREATE_ACTION_NAME}
                WHEN ${productMedia.dayId} IS NOT NULL THEN ${PRODUCT_DAY_MEDIA_CREATE_ACTION_NAME}
                ELSE ${PRODUCT_MEDIA_CREATE_ACTION_NAME}
              END
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productMedia.productId}
          )
      ) missing
    `,
    product_capability: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_capability' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productCapabilities.id} AS candidate_id,
          ${productCapabilities.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productCapabilities.createdAt} DESC, ${productCapabilities.id} DESC
          ) AS sample_ordinal
        FROM ${productCapabilities}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productCapabilities.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_CAPABILITY_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productCapabilities.productId}
          )
      ) missing
    `,
    product_delivery_format: sql<ProductActionLedgerDriftQueryRow>`
      SELECT
        'product_delivery_format' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${productDeliveryFormats.id} AS candidate_id,
          ${productDeliveryFormats.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${productDeliveryFormats.createdAt} DESC, ${productDeliveryFormats.id} DESC
          ) AS sample_ordinal
        FROM ${productDeliveryFormats}
        WHERE 1 = 1
          ${buildCreatedAtCondition(productDeliveryFormats.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PRODUCT_DELIVERY_FORMAT_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"product"}
              AND ${actionLedgerEntries.targetId} = ${productDeliveryFormats.productId}
          )
      ) missing
    `,
  }
}

export async function checkProductActionLedgerDrift(
  db: AnyDrizzleDb,
  input: CheckProductActionLedgerDriftInput = {},
): Promise<CheckProductActionLedgerDriftResult> {
  const queries = buildProductActionLedgerDriftQueries(input)
  const results: unknown[] = await Promise.all([
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_option),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.option_unit),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_itinerary),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_day),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_day_service),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_media),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_capability),
    db.execute<ProductActionLedgerDriftQueryRow>(queries.product_delivery_format),
  ])
  const rows = results
    .flatMap((result: unknown) => extractRows(result))
    .map((row: ProductActionLedgerDriftQueryRow) => normalizeRow(row))

  return {
    ok: rows.every((row) => row.missingCount === 0),
    rows,
  }
}

function normalizeSampleLimit(limit: number | null | undefined): number {
  if (!limit) return DEFAULT_SAMPLE_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SAMPLE_LIMIT)
}

function buildCreatedAtCondition(
  column: SQLWrapper,
  value: CheckProductActionLedgerDriftInput["createdAtFrom"],
) {
  if (!value) return sql``
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("createdAtFrom must be a valid date")
  }
  // A `sql` interpolation hands the value to the driver as-is, and postgres-js
  // cannot bind a `Date` — the whole check threw as soon as a caller narrowed
  // it by date (voyant#4696). Bind the encoded timestamp instead.
  // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`AND ${column} >= ${date.toISOString()}::timestamptz`
}

function extractRows(result: unknown): ProductActionLedgerDriftQueryRow[] {
  if (Array.isArray(result)) return result as ProductActionLedgerDriftQueryRow[]
  const maybeRows = (result as { rows?: unknown }).rows
  return Array.isArray(maybeRows) ? (maybeRows as ProductActionLedgerDriftQueryRow[]) : []
}

function normalizeRow(row: ProductActionLedgerDriftQueryRow): ProductActionLedgerDriftRow {
  return {
    check: row.check,
    missingCount: Number(row.missing_count),
    sampleIds: row.sample_ids ?? [],
  }
}

export const __test__ = {
  normalizeRow,
}
