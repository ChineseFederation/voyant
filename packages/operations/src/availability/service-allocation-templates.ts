import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { productOptionResourceTemplates } from "./schema.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"
import type { upsertResourceTemplateSchema } from "./validation.js"

export type UpsertResourceTemplateInput = z.infer<typeof upsertResourceTemplateSchema>

export interface ResourceTemplate {
  id: string
  productOptionId: string
  kind: string
  refType: string | null
  refId: string | null
  /** Maximum occupancy. */
  capacity: number
  occupancyMin: number | null
  occupancyMax: number | null
  minAge: number | null
  maxAge: number | null
  roomTypeId: string | null
  bedConfiguration: string | null
  accessible: boolean
  namePattern: string
  layout: string | null
  defaultCount: number | null
  flags: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProductOptionResourceTemplates {
  id: string
  name: string
  code: string | null
  description: string | null
  status: string
  isDefault: boolean
  sortOrder: number
  templates: ResourceTemplate[]
}

export async function listProductOptionResourceTemplates(
  db: PostgresJsDatabase,
  productId: string,
): Promise<ProductOptionResourceTemplates[]> {
  const optionRows = await executeRows<ProductOptionRow>(
    db,
    sql`
      SELECT id, name, code, description, status, is_default, sort_order
      FROM product_options
      WHERE product_id = ${productId}
      ORDER BY sort_order, created_at
    `,
  )

  if (optionRows.length === 0) return []

  const optionIds = optionRows.map((row) => row.id)
  const templateRows = await executeRows<ResourceTemplateRow>(
    db,
    sql`
      SELECT id, product_option_id, kind, ref_type, ref_id, capacity, occupancy_min, occupancy_max,
             min_age, max_age, room_type_id, bed_configuration, accessible,
             name_pattern, layout, default_count, flags, created_at, updated_at
      FROM product_option_resource_templates
      WHERE product_option_id = ANY(${sqlTextArray(optionIds)})
      ORDER BY kind, created_at
    `,
  )

  const byOption = new Map<string, ResourceTemplate[]>()
  for (const row of templateRows) {
    const list = byOption.get(row.product_option_id) ?? []
    list.push(toResourceTemplate(row))
    byOption.set(row.product_option_id, list)
  }

  return optionRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    templates: byOption.get(row.id) ?? [],
  }))
}

export async function upsertProductOptionResourceTemplate(
  db: PostgresJsDatabase,
  productId: string,
  productOptionId: string,
  kind: string,
  input: UpsertResourceTemplateInput,
): Promise<ResourceTemplate> {
  await assertProductOptionBelongsToProduct(db, productId, productOptionId)

  const refId = input.refId ?? null
  // `occupancyMax` is the authoritative maximum when supplied; `capacity` is
  // kept in step with it so every materializer still reads one number.
  const values = {
    refType: input.refType ?? null,
    refId,
    capacity: input.occupancyMax ?? input.capacity,
    occupancyMin: input.occupancyMin ?? null,
    occupancyMax: input.occupancyMax ?? null,
    minAge: input.minAge ?? null,
    maxAge: input.maxAge ?? null,
    roomTypeId: input.roomTypeId ?? null,
    bedConfiguration: input.bedConfiguration ?? null,
    accessible: input.accessible ?? false,
    namePattern: input.namePattern,
    layout: input.layout ?? null,
    defaultCount: input.defaultCount ?? null,
    flags: input.flags ?? {},
  }

  // An option can hold several templates of the same kind, one per option_unit
  // (see the widened unique index in migration 0053:
  // (product_option_id, kind, coalesce(ref_id, ''))). Drizzle 0.45 can't express
  // that coalesce in an onConflict target, so we resolve the row by (option,
  // kind, refId) ourselves -- coalescing so a null refId matches the ref-less
  // template -- then update it in place or insert a new one. The unique index
  // still guards against a concurrent duplicate.
  const [existing] = await db
    .select({ id: productOptionResourceTemplates.id })
    .from(productOptionResourceTemplates)
    .where(
      and(
        eq(productOptionResourceTemplates.productOptionId, productOptionId),
        eq(productOptionResourceTemplates.kind, kind),
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`coalesce(${productOptionResourceTemplates.refId}, '') = ${refId ?? ""}`,
      ),
    )
    .limit(1)

  const [row] = existing
    ? await db
        .update(productOptionResourceTemplates)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(productOptionResourceTemplates.id, existing.id))
        .returning()
    : await db
        .insert(productOptionResourceTemplates)
        .values({ productOptionId, kind, ...values })
        .returning()

  if (!row) throw new AllocationServiceError("Resource template upsert failed", 500)
  return toResourceTemplate({
    id: row.id,
    product_option_id: row.productOptionId,
    kind: row.kind,
    ref_type: row.refType,
    ref_id: row.refId,
    capacity: row.capacity,
    occupancy_min: row.occupancyMin,
    occupancy_max: row.occupancyMax,
    min_age: row.minAge,
    max_age: row.maxAge,
    room_type_id: row.roomTypeId,
    bed_configuration: row.bedConfiguration,
    accessible: row.accessible,
    name_pattern: row.namePattern,
    layout: row.layout,
    default_count: row.defaultCount,
    flags: row.flags,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  })
}

export async function deleteProductOptionResourceTemplate(
  db: PostgresJsDatabase,
  productId: string,
  productOptionId: string,
  kind: string,
  refId?: string | null,
) {
  await assertProductOptionBelongsToProduct(db, productId, productOptionId)

  // An option can hold several templates of the same kind (e.g. one "room"
  // per option_unit), distinguished by ref_id. Match the specific row via
  // coalesce so a null refId targets the ref-less template rather than wiping
  // every row of that kind.
  const [row] = await db
    .delete(productOptionResourceTemplates)
    .where(
      and(
        eq(productOptionResourceTemplates.productOptionId, productOptionId),
        eq(productOptionResourceTemplates.kind, kind),
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`coalesce(${productOptionResourceTemplates.refId}, '') = coalesce(${refId ?? null}, '')`,
      ),
    )
    .returning({ id: productOptionResourceTemplates.id })

  return row ? { productOptionId, kind } : null
}

async function assertProductOptionBelongsToProduct(
  db: PostgresJsDatabase,
  productId: string,
  productOptionId: string,
) {
  const [row] = await executeRows<{ id: string }>(
    db,
    sql`
      SELECT id
      FROM product_options
      WHERE id = ${productOptionId}
        AND product_id = ${productId}
      LIMIT 1
    `,
  )

  if (!row) throw new AllocationServiceError("Product option not found for product", 404)
}

function toResourceTemplate(row: ResourceTemplateRow): ResourceTemplate {
  return {
    id: row.id,
    productOptionId: row.product_option_id,
    kind: row.kind,
    refType: row.ref_type,
    refId: row.ref_id,
    capacity: row.capacity,
    occupancyMin: row.occupancy_min ?? null,
    occupancyMax: row.occupancy_max ?? null,
    minAge: row.min_age ?? null,
    maxAge: row.max_age ?? null,
    roomTypeId: row.room_type_id ?? null,
    bedConfiguration: row.bed_configuration ?? null,
    accessible: row.accessible ?? false,
    namePattern: row.name_pattern,
    layout: row.layout,
    defaultCount: row.default_count ?? null,
    flags: row.flags ?? {},
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

interface ProductOptionRow {
  id: string
  name: string
  code: string | null
  description: string | null
  status: string
  is_default: boolean
  sort_order: number
}

interface ResourceTemplateRow {
  id: string
  product_option_id: string
  kind: string
  ref_type: string | null
  ref_id: string | null
  capacity: number
  occupancy_min: number | null
  occupancy_max: number | null
  min_age: number | null
  max_age: number | null
  room_type_id: string | null
  bed_configuration: string | null
  accessible: boolean
  name_pattern: string
  layout: string | null
  default_count: number | null
  flags: Record<string, unknown>
  created_at: string | Date
  updated_at: string | Date
}
