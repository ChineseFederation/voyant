import type { CatalogInventoryRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import type { PaymentPolicy } from "@voyant-travel/finance"
import { availabilityService } from "@voyant-travel/operations"
import { and, asc, eq, gt, isNotNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { registerProductBookingHandler } from "./booking-engine/product-runtime.js"
import { productCatalogPolicy } from "./catalog-policy.js"
import { productDeparturesCatalogPolicy } from "./catalog-policy-departures.js"
import { productDestinationsCatalogPolicy } from "./catalog-policy-destinations.js"
import { productPricingCatalogPolicy } from "./catalog-policy-pricing.js"
import { productPromotionsCatalogPolicy } from "./catalog-policy-promotions.js"
import { productTaxonomyCatalogPolicy } from "./catalog-policy-taxonomy.js"
import { extrasCatalogPolicy } from "./extras.js"
import {
  productCategories,
  productCategoryProducts,
  products,
  productTranslations,
} from "./schema.js"
import { productsService } from "./service.js"
import {
  buildProductSnapshotInput,
  createProductClassificationProjectionExtension,
  createProductDocumentBuilder,
  createProductPublicApiCardProjectionExtension,
} from "./service-catalog-plane.js"
import { createProductDestinationsProjectionExtension } from "./service-catalog-plane-destinations.js"
import { createProductTaxonomyProjectionExtension } from "./service-catalog-plane-taxonomy.js"
import { getProductContent } from "./service-content.js"
import { listProductsReferencingAccommodationProperty } from "./service-presentation-references.js"

export const catalogInventoryRuntimeExtension = {
  productFieldPolicy: [
    ...productCatalogPolicy,
    ...productDestinationsCatalogPolicy,
    ...productTaxonomyCatalogPolicy,
    ...productDeparturesCatalogPolicy,
    ...productPricingCatalogPolicy,
    ...productPromotionsCatalogPolicy,
  ],
  extrasFieldPolicy: extrasCatalogPolicy,
  listCanonicalProductIds: (db, { afterId, limit }) =>
    db
      .select({ id: products.id })
      .from(products)
      .where(afterId ? gt(products.id, afterId) : undefined)
      .orderBy(asc(products.id))
      .limit(limit)
      .then((rows) => rows.map((row) => row.id)),
  createDocumentBuilder: ({
    db,
    sellerOperatorId,
    registry,
    extensions,
    isPublicAudienceListable,
  }) =>
    createProductDocumentBuilder(db, {
      sellerOperatorId,
      registry,
      extensions,
      isPublicAudienceListable,
    }),
  createPublicApiCardProjectionExtension: () => createProductPublicApiCardProjectionExtension(),
  createDestinationsProjectionExtension: () => createProductDestinationsProjectionExtension(),
  createTaxonomyProjectionExtension: () => createProductTaxonomyProjectionExtension(),
  createClassificationProjectionExtension: () => createProductClassificationProjectionExtension(),
  listProductsReferencingAccommodationProperty,
  registerOwnedBookingHandler: registerProductBookingHandler,
  getProductContent: (db, productId, scope, context) =>
    getProductContent(db, productId, scope, context),
  async getOwnedProductById(db, productId) {
    const product = await productsService.getProductById(db as PostgresJsDatabase, productId)
    return product ? { name: product.name, description: product.description } : null
  },
  async loadProductReservationPolicy(db, productId) {
    const [product] = await db
      .select({
        supplierId: products.supplierId,
        reservationTimeoutMinutes: products.reservationTimeoutMinutes,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)
    return product ?? null
  },
  async loadProductPaymentPolicyContext(db, productId, options) {
    const [[product], [category], translations] = await Promise.all([
      db
        .select({
          name: products.name,
          listingPolicy: products.customerPaymentPolicy,
          supplierId: products.supplierId,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1),
      db
        .select({ categoryPolicy: productCategories.customerPaymentPolicy })
        .from(productCategoryProducts)
        .innerJoin(productCategories, eq(productCategories.id, productCategoryProducts.categoryId))
        .where(
          and(
            eq(productCategoryProducts.productId, productId),
            isNotNull(productCategories.customerPaymentPolicy),
          ),
        )
        .orderBy(asc(productCategoryProducts.sortOrder), asc(productCategoryProducts.createdAt))
        .limit(1),
      options?.locale
        ? db
            .select({
              languageTag: productTranslations.languageTag,
              name: productTranslations.name,
            })
            .from(productTranslations)
            .where(eq(productTranslations.productId, productId))
        : Promise.resolve([]),
    ])
    if (!product) return null
    return {
      listingPolicy: (product.listingPolicy as PaymentPolicy | null | undefined) ?? null,
      categoryPolicy: (category?.categoryPolicy as PaymentPolicy | null | undefined) ?? null,
      supplierId: product.supplierId,
      name: pickTranslatedName(translations, options?.locale) ?? product.name,
    }
  },
  async resolveSelectedDepartureDate(db, { productId, departureSlotId }) {
    if (departureSlotId) {
      // Through availability's own service, not its table: the slot belongs to
      // `operations`, and a departure date is exactly what that module is the
      // authority on.
      const slot = await availabilityService.getSlotById(db as PostgresJsDatabase, departureSlotId)
      if (slot?.productId === productId && slot.dateLocal) return slot.dateLocal
    }
    const [product] = await db
      .select({ startDate: products.startDate })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)
    return product?.startDate ?? null
  },
  buildSnapshotInput: (db, productId, options) => buildProductSnapshotInput(db, productId, options),
} satisfies CatalogInventoryRuntimeExtension

/**
 * Resolve a product's name in `locale` from its translation rows.
 *
 * Exact tag, then case-insensitive, then the language subtag — the same
 * precedence the storefront-card projection uses. Unlike that projection this
 * does **not** fall back to an arbitrary translation: the caller is building a
 * checkout line item, where the product's base `name` is a better answer than
 * a language the shopper did not ask for.
 */
function pickTranslatedName(
  rows: ReadonlyArray<{ languageTag: string; name: string }>,
  locale: string | undefined,
): string | null {
  if (!locale) return null
  const match =
    rows.find((row) => row.languageTag === locale) ??
    rows.find((row) => row.languageTag.toLowerCase() === locale.toLowerCase()) ??
    rows.find((row) => row.languageTag.split("-")[0] === locale.split("-")[0])
  return match?.name.trim() || null
}
