import { ApiHttpError } from "@voyant-travel/hono"
import { and, asc, eq, ilike, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { STANDARD_PRODUCT_FAMILY_CODES } from "./classification.js"
import { duplicateInventoryValueError } from "./duplicate-errors.js"
import {
  productCategories,
  productCategoryProducts,
  products,
  productTagProducts,
  productTags,
  productTypes,
} from "./schema.js"
import type {
  insertProductCategorySchema,
  insertProductTagSchema,
  insertProductTypeSchema,
  productCategoryListQuerySchema,
  productTagListQuerySchema,
  productTypeListQuerySchema,
  updateProductCategorySchema,
  updateProductTagSchema,
  updateProductTypeSchema,
} from "./validation.js"

type ProductTypeListQuery = z.infer<typeof productTypeListQuerySchema>
type CreateProductTypeInput = z.infer<typeof insertProductTypeSchema>
type UpdateProductTypeInput = z.infer<typeof updateProductTypeSchema>
type ProductCategoryListQuery = z.infer<typeof productCategoryListQuerySchema>
type CreateProductCategoryInput = z.infer<typeof insertProductCategorySchema>
type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>
type ProductTagListQuery = z.infer<typeof productTagListQuerySchema>
type CreateProductTagInput = z.infer<typeof insertProductTagSchema>
type UpdateProductTagInput = z.infer<typeof updateProductTagSchema>

export const taxonomyProductsService = {
  // ==========================================================================
  // Product Types
  // ==========================================================================

  async listProductTypes(db: PostgresJsDatabase, query: ProductTypeListQuery) {
    const conditions = []

    if (query.active !== undefined) {
      conditions.push(eq(productTypes.active, query.active))
    }

    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(or(ilike(productTypes.name, term), ilike(productTypes.code, term)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(productTypes)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(asc(productTypes.sortOrder), asc(productTypes.name)),
      db.select({ count: sql<number>`count(*)::int` }).from(productTypes).where(where),
    ])

    return {
      data: rows,
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getProductTypeById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(productTypes).where(eq(productTypes.id, id)).limit(1)
    return row ?? null
  },

  async createProductType(db: PostgresJsDatabase, data: CreateProductTypeInput) {
    const [row] = await db
      .insert(productTypes)
      .values(data)
      .onConflictDoNothing({ target: productTypes.code })
      .returning()

    if (!row) {
      throw duplicateInventoryValueError({
        code: "duplicate_product_type_code",
        message: "Product family code already exists",
        resource: "product_type",
        fields: [["code"]],
      })
    }

    return row
  },

  async updateProductType(db: PostgresJsDatabase, id: string, data: UpdateProductTypeInput) {
    const [row] = await db
      .update(productTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productTypes.id, id))
      .returning()

    return row ?? null
  },

  async deleteProductType(db: PostgresJsDatabase, id: string) {
    const [type] = await db
      .select({ code: productTypes.code })
      .from(productTypes)
      .where(eq(productTypes.id, id))
      .limit(1)

    if (!type) return null

    if (STANDARD_PRODUCT_FAMILY_CODES.includes(type.code)) {
      throw productFamilyInUseError(
        "Standard product families cannot be deleted. Deactivate or rename the display label instead.",
      )
    }

    const [reference] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.productTypeId, id))
      .limit(1)

    if (reference) {
      throw productFamilyInUseError(
        "This product family is assigned to products. Reclassify them before deleting it.",
      )
    }

    const [row] = await db
      .delete(productTypes)
      .where(eq(productTypes.id, id))
      .returning({ id: productTypes.id })

    return row ?? null
  },

  // ==========================================================================
  // Product Categories
  // ==========================================================================

  async listProductCategories(db: PostgresJsDatabase, query: ProductCategoryListQuery) {
    const conditions = []

    if (query.parentId) {
      conditions.push(eq(productCategories.parentId, query.parentId))
    }

    if (query.active !== undefined) {
      conditions.push(eq(productCategories.active, query.active))
    }

    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(or(ilike(productCategories.name, term), ilike(productCategories.slug, term)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(productCategories)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
      db.select({ count: sql<number>`count(*)::int` }).from(productCategories).where(where),
    ])

    return {
      data: rows,
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getProductCategoryById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, id))
      .limit(1)
    return row ?? null
  },

  async createProductCategory(db: PostgresJsDatabase, data: CreateProductCategoryInput) {
    const [row] = await db
      .insert(productCategories)
      .values(data)
      .onConflictDoNothing({ target: productCategories.slug })
      .returning()

    if (!row) {
      throw duplicateInventoryValueError({
        code: "duplicate_product_category_slug",
        message: "Product category slug already exists",
        resource: "product_category",
        fields: [["slug"]],
      })
    }

    return row
  },

  async updateProductCategory(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateProductCategoryInput,
  ) {
    const [row] = await db
      .update(productCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productCategories.id, id))
      .returning()

    return row ?? null
  },

  async deleteProductCategory(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(productCategories)
      .where(eq(productCategories.id, id))
      .returning({ id: productCategories.id })

    return row ?? null
  },

  // ==========================================================================
  // Product Tags
  // ==========================================================================

  async listProductTags(db: PostgresJsDatabase, query: ProductTagListQuery) {
    const conditions = []

    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(ilike(productTags.name, term))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(productTags)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(asc(productTags.name)),
      db.select({ count: sql<number>`count(*)::int` }).from(productTags).where(where),
    ])

    return {
      data: rows,
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getProductTagById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(productTags).where(eq(productTags.id, id)).limit(1)
    return row ?? null
  },

  async createProductTag(db: PostgresJsDatabase, data: CreateProductTagInput) {
    const [row] = await db
      .insert(productTags)
      .values(data)
      .onConflictDoNothing({ target: productTags.name })
      .returning()

    if (!row) {
      throw duplicateInventoryValueError({
        code: "duplicate_product_tag_name",
        message: "Product tag name already exists",
        resource: "product_tag",
        fields: [["name"]],
      })
    }

    return row
  },

  async updateProductTag(db: PostgresJsDatabase, id: string, data: UpdateProductTagInput) {
    const [row] = await db
      .update(productTags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productTags.id, id))
      .returning()

    return row ?? null
  },

  async deleteProductTag(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(productTags)
      .where(eq(productTags.id, id))
      .returning({ id: productTags.id })

    return row ?? null
  },

  // ==========================================================================
  // Product <-> Category associations
  // ==========================================================================

  async addProductToCategory(
    db: PostgresJsDatabase,
    productId: string,
    categoryId: string,
    sortOrder = 0,
  ) {
    const [row] = await db
      .insert(productCategoryProducts)
      .values({ productId, categoryId, sortOrder })
      .onConflictDoNothing()
      .returning()

    return row ?? null
  },

  async removeProductFromCategory(db: PostgresJsDatabase, productId: string, categoryId: string) {
    const [row] = await db
      .delete(productCategoryProducts)
      .where(
        and(
          eq(productCategoryProducts.productId, productId),
          eq(productCategoryProducts.categoryId, categoryId),
        ),
      )
      .returning({ productId: productCategoryProducts.productId })

    return row ?? null
  },

  async listProductCategories_(db: PostgresJsDatabase, productId: string) {
    const rows = await db
      .select({ category: productCategories })
      .from(productCategoryProducts)
      .innerJoin(productCategories, eq(productCategoryProducts.categoryId, productCategories.id))
      .where(eq(productCategoryProducts.productId, productId))
      .orderBy(asc(productCategoryProducts.sortOrder))

    return rows.map((r) => r.category)
  },

  // ==========================================================================
  // Product <-> Tag associations
  // ==========================================================================

  async addProductTag(db: PostgresJsDatabase, productId: string, tagId: string) {
    const [row] = await db
      .insert(productTagProducts)
      .values({ productId, tagId })
      .onConflictDoNothing()
      .returning()

    return row ?? null
  },

  async removeProductTag(db: PostgresJsDatabase, productId: string, tagId: string) {
    const [row] = await db
      .delete(productTagProducts)
      .where(and(eq(productTagProducts.productId, productId), eq(productTagProducts.tagId, tagId)))
      .returning({ productId: productTagProducts.productId })

    return row ?? null
  },

  async listProductTags_(db: PostgresJsDatabase, productId: string) {
    const rows = await db
      .select({ tag: productTags })
      .from(productTagProducts)
      .innerJoin(productTags, eq(productTagProducts.tagId, productTags.id))
      .where(eq(productTagProducts.productId, productId))
      .orderBy(asc(productTags.name))

    return rows.map((r) => r.tag)
  },
}

function productFamilyInUseError(message: string): ApiHttpError {
  return new ApiHttpError(message, {
    status: 409,
    code: "product_family_in_use",
    details: { resource: "product_family" },
  })
}
