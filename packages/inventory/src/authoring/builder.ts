import {
  dropoffPriceRules,
  optionPriceRules,
  optionUnitPriceRules,
  optionUnitTiers,
  pickupPriceRules,
} from "@voyant-travel/commerce"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  optionUnits,
  productDayServices,
  productDays,
  productItineraries,
  productOptions,
  productPaxPricingTiers,
  products,
} from "../schema.js"
import { productsService } from "../service.js"
import { AuthoringValidationError } from "./errors.js"
import type { ProductGraphSpec } from "./spec.js"

export interface BuildProductGraphOptions {
  /** Author of the initial `product_versions` snapshot. When omitted, no snapshot is taken. */
  userId?: string
  /**
   * Catalog every option price rule resolves to when the spec rule omits its own
   * `priceCatalogId`. Clone leaves rule catalogs populated (so this is unused);
   * compose passes the operator's default. A rule with neither errors.
   */
  defaultCatalogId?: string
}

export interface BuiltOptionUnit {
  ref: string
  id: string
}

export interface BuiltOption {
  ref: string
  id: string
  units: BuiltOptionUnit[]
}

export interface BuildProductGraphResult {
  productId: string
  options: BuiltOption[]
}

/**
 * Writes a {@link ProductGraphSpec} as a fresh product graph. MUST run inside a
 * transaction (`db.transaction(async (tx) => buildProductGraph(tx, …))`) so a
 * mid-build failure leaves nothing behind — the half-built-product problem this
 * whole effort exists to kill.
 *
 * Never writes `availability_slots`: departures are date-specific and added
 * separately. Local `ref`/`unitRef` keys in the spec are resolved to the
 * freshly-minted ids here and never touch the database.
 */
export async function buildProductGraph(
  tx: PostgresJsDatabase,
  spec: ProductGraphSpec,
  options: BuildProductGraphOptions = {},
): Promise<BuildProductGraphResult> {
  const { userId, defaultCatalogId } = options

  // --- product row -----------------------------------------------------------
  const [productRow] = await tx
    .insert(products)
    .values({
      name: spec.product.name,
      status: spec.product.status,
      description: spec.product.description,
      inclusionsHtml: spec.product.inclusionsHtml,
      exclusionsHtml: spec.product.exclusionsHtml,
      termsHtml: spec.product.termsHtml,
      termsShowOnContract: spec.product.termsShowOnContract,
      bookingMode: spec.product.bookingMode,
      capacityMode: spec.product.capacityMode,
      timezone: spec.product.timezone,
      defaultLanguageTag: spec.product.defaultLanguageTag,
      visibility: spec.product.visibility,
      sellCurrency: spec.product.sellCurrency,
      sellAmountCents: spec.product.sellAmountCents,
      costAmountCents: spec.product.costAmountCents,
      marginPercent: spec.product.marginPercent,
      reservationTimeoutMinutes: spec.product.reservationTimeoutMinutes,
      facilityId: spec.product.facilityId,
      supplierId: spec.product.supplierId,
      startDate: spec.product.startDate,
      endDate: spec.product.endDate,
      pax: spec.product.pax,
      productTypeId: spec.product.productTypeId,
      productSubtypeCode: spec.product.productSubtypeCode,
      durationMinutes: spec.product.durationMinutes,
      contractTemplateId: spec.product.contractTemplateId,
      taxClassId: spec.product.taxClassId,
      customerPaymentPolicy: spec.product.customerPaymentPolicy,
      tags: spec.product.tags,
    })
    .returning({ id: products.id })

  if (!productRow) throw new Error("Failed to insert product")
  const productId = productRow.id

  // Global ref → new-id maps. Refs are unique across the whole spec (clone uses
  // source ids; compose uses caller-chosen keys), so unit refs from any option
  // resolve here — covering both unit-price-rule unitRef and pax-tier unitRef.
  const unitIdByRef = new Map<string, string>()
  const builtOptions: BuiltOption[] = []

  // --- options + units -------------------------------------------------------
  for (const option of spec.options) {
    const [optionRow] = await tx
      .insert(productOptions)
      .values({
        productId,
        name: option.name,
        code: option.code,
        description: option.description,
        status: option.status,
        isDefault: option.isDefault,
        sortOrder: option.sortOrder,
        availableFrom: option.availableFrom,
        availableTo: option.availableTo,
      })
      .returning({ id: productOptions.id })

    if (!optionRow) throw new Error("Failed to insert product option")
    const optionId = optionRow.id
    const builtUnits: BuiltOptionUnit[] = []

    for (const unit of option.units) {
      const [unitRow] = await tx
        .insert(optionUnits)
        .values({
          optionId,
          name: unit.name,
          code: unit.code,
          description: unit.description,
          unitType: unit.unitType,
          minQuantity: unit.minQuantity,
          maxQuantity: unit.maxQuantity,
          minAge: unit.minAge,
          maxAge: unit.maxAge,
          occupancyMin: unit.occupancyMin,
          occupancyMax: unit.occupancyMax,
          isRequired: unit.isRequired,
          isHidden: unit.isHidden,
          sortOrder: unit.sortOrder,
        })
        .returning({ id: optionUnits.id })

      if (!unitRow) throw new Error("Failed to insert option unit")
      unitIdByRef.set(unit.ref, unitRow.id)
      builtUnits.push({ ref: unit.ref, id: unitRow.id })
    }

    // --- pricing: option rules → unit rules → tiers --------------------------
    for (const rule of option.priceRules) {
      const priceCatalogId = rule.priceCatalogId ?? defaultCatalogId
      if (!priceCatalogId) {
        throw new AuthoringValidationError([
          {
            code: "no_price_catalog",
            field: `options[].priceRules[].priceCatalogId`,
            message: `Price rule "${rule.name}" has no priceCatalogId and no default catalog was resolved.`,
            fix: "Supply priceCatalogId on the rule, or ensure a default price catalog exists.",
          },
        ])
      }

      const [ruleRow] = await tx
        .insert(optionPriceRules)
        .values({
          productId,
          optionId,
          priceCatalogId,
          priceScheduleId: rule.priceScheduleId,
          cancellationPolicyId: rule.cancellationPolicyId,
          code: rule.code,
          name: rule.name,
          description: rule.description,
          pricingMode: rule.pricingMode,
          baseSellAmountCents: rule.baseSellAmountCents,
          baseCostAmountCents: rule.baseCostAmountCents,
          minPerBooking: rule.minPerBooking,
          maxPerBooking: rule.maxPerBooking,
          allPricingCategories: rule.allPricingCategories,
          isDefault: rule.isDefault,
          active: rule.active,
          notes: rule.notes,
          metadata: rule.metadata,
        })
        .returning({ id: optionPriceRules.id })

      if (!ruleRow) throw new Error("Failed to insert option price rule")

      if (rule.pickupPriceRules.length) {
        await tx.insert(pickupPriceRules).values(
          rule.pickupPriceRules.map((pickupRule) => ({
            optionPriceRuleId: ruleRow.id,
            optionId,
            pickupPointId: pickupRule.pickupPointId,
            pricingMode: pickupRule.pricingMode,
            sellAmountCents: pickupRule.sellAmountCents,
            costAmountCents: pickupRule.costAmountCents,
            active: pickupRule.active,
            sortOrder: pickupRule.sortOrder,
            notes: pickupRule.notes,
          })),
        )
      }

      if (rule.dropoffPriceRules.length) {
        await tx.insert(dropoffPriceRules).values(
          rule.dropoffPriceRules.map((dropoffRule) => ({
            optionPriceRuleId: ruleRow.id,
            optionId,
            facilityId: dropoffRule.facilityId,
            dropoffCode: dropoffRule.dropoffCode,
            dropoffName: dropoffRule.dropoffName,
            pricingMode: dropoffRule.pricingMode,
            sellAmountCents: dropoffRule.sellAmountCents,
            costAmountCents: dropoffRule.costAmountCents,
            active: dropoffRule.active,
            sortOrder: dropoffRule.sortOrder,
            notes: dropoffRule.notes,
          })),
        )
      }

      for (const unitRule of rule.unitPriceRules) {
        const unitId = unitIdByRef.get(unitRule.unitRef)
        if (!unitId) {
          throw new AuthoringValidationError([
            {
              code: "unknown_unit_ref",
              field: "options[].priceRules[].unitPriceRules[].unitRef",
              message: `Unit price rule references unit "${unitRule.unitRef}", which is not defined in the spec.`,
              fix: "Point unitRef at a unit declared under one of the options.",
            },
          ])
        }

        const [unitRuleRow] = await tx
          .insert(optionUnitPriceRules)
          .values({
            optionPriceRuleId: ruleRow.id,
            optionId,
            unitId,
            pricingCategoryId: unitRule.pricingCategoryId,
            pricingMode: unitRule.pricingMode,
            sellAmountCents: unitRule.sellAmountCents,
            costAmountCents: unitRule.costAmountCents,
            minQuantity: unitRule.minQuantity,
            maxQuantity: unitRule.maxQuantity,
            active: unitRule.active,
            sortOrder: unitRule.sortOrder,
            notes: unitRule.notes,
            metadata: unitRule.metadata,
          })
          .returning({ id: optionUnitPriceRules.id })

        if (!unitRuleRow) throw new Error("Failed to insert option unit price rule")

        if (unitRule.tiers.length) {
          await tx.insert(optionUnitTiers).values(
            unitRule.tiers.map((tier) => ({
              optionUnitPriceRuleId: unitRuleRow.id,
              minQuantity: tier.minQuantity,
              maxQuantity: tier.maxQuantity,
              sellAmountCents: tier.sellAmountCents,
              costAmountCents: tier.costAmountCents,
              active: tier.active,
              sortOrder: tier.sortOrder,
            })),
          )
        }
      }
    }

    builtOptions.push({ ref: option.ref, id: optionId, units: builtUnits })
  }

  // --- pax pricing tiers -----------------------------------------------------
  if (spec.paxPricingTiers.length) {
    await tx.insert(productPaxPricingTiers).values(
      spec.paxPricingTiers.map((tier) => ({
        productId,
        optionUnitId: tier.unitRef ? (unitIdByRef.get(tier.unitRef) ?? null) : null,
        tierPax: tier.tierPax,
        pricePerPaxCents: tier.pricePerPaxCents,
        promoPricePerPaxCents: tier.promoPricePerPaxCents,
        effectiveFrom: tier.effectiveFrom,
        effectiveTo: tier.effectiveTo,
      })),
    )
  }

  // --- itineraries → days → services -----------------------------------------
  for (const itinerary of spec.itineraries) {
    const [itineraryRow] = await tx
      .insert(productItineraries)
      .values({
        productId,
        name: itinerary.name,
        isDefault: itinerary.isDefault,
        sortOrder: itinerary.sortOrder,
      })
      .returning({ id: productItineraries.id })

    if (!itineraryRow) throw new Error("Failed to insert product itinerary")

    for (const day of itinerary.days) {
      const [dayRow] = await tx
        .insert(productDays)
        .values({
          itineraryId: itineraryRow.id,
          dayNumber: day.dayNumber,
          title: day.title,
          description: day.description,
          location: day.location,
        })
        .returning({ id: productDays.id })

      if (!dayRow) throw new Error("Failed to insert product day")

      if (day.services.length) {
        await tx.insert(productDayServices).values(
          day.services.map((service) => ({
            dayId: dayRow.id,
            supplierServiceId: service.supplierServiceId,
            serviceType: service.serviceType,
            name: service.name,
            description: service.description,
            countryCode: service.countryCode,
            costCurrency: service.costCurrency,
            costAmountCents: service.costAmountCents,
            quantity: service.quantity,
            sortOrder: service.sortOrder,
            notes: service.notes,
          })),
        )
      }
    }
  }

  // --- initial version snapshot ----------------------------------------------
  if (userId) {
    await productsService.createVersion(tx, productId, userId, {})
  }

  return { productId, options: builtOptions }
}
