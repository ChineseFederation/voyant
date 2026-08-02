import {
  addonPricingModeEnum,
  optionPricingModeEnum,
  optionUnitPricingModeEnum,
} from "@voyant-travel/commerce"
import { z } from "zod"
import {
  optionUnitTypeEnum,
  productBookingModeEnum,
  productCapacityModeEnum,
  productOptionStatusEnum,
  productStatusEnum,
  productVisibilityEnum,
  serviceTypeEnum,
} from "../schema.js"

/**
 * Normalized, transport-agnostic description of a bookable product graph.
 *
 * Both entry points feed the same builder:
 *  - clone   — serialize an existing product into a spec, patch the product row.
 *  - compose — caller (Max AI agent) supplies the spec directly.
 *
 * Cross-references inside an option (a unit price rule pointing at a sibling
 * unit, a pax tier pointing at a unit) use **local ref keys** (`ref` / `unitRef`),
 * which the builder resolves to freshly-minted ids. For clone, serialize sets
 * each `ref` to the source row id; for compose, the caller picks any unique
 * string. Refs never reach the database.
 *
 * NOTE: `availability_slots` (departures) are intentionally absent — they are
 * date-specific and added separately after the graph exists.
 *
 * Home of this type is under review (here vs `@voyant-travel/products-contracts`).
 */

const money = z.number().int()
const jsonRecord = z.record(z.string(), z.unknown())

export const unitSpecSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1).max(255),
  code: z.string().max(255).nullish(),
  description: z.string().nullish(),
  unitType: z.enum(optionUnitTypeEnum.enumValues).default("person"),
  minQuantity: z.number().int().nullish(),
  maxQuantity: z.number().int().nullish(),
  minAge: z.number().int().nullish(),
  maxAge: z.number().int().nullish(),
  occupancyMin: z.number().int().nullish(),
  occupancyMax: z.number().int().nullish(),
  isRequired: z.boolean().default(false),
  isHidden: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export const unitTierSpecSchema = z.object({
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullish(),
  sellAmountCents: money.nullish(),
  costAmountCents: money.nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const unitPriceRuleSpecSchema = z.object({
  /** Resolves to a sibling unit's `ref` within the same option. */
  unitRef: z.string().min(1),
  pricingCategoryId: z.string().nullish(),
  pricingMode: z.enum(optionUnitPricingModeEnum.enumValues).default("per_unit"),
  sellAmountCents: money.nullish(),
  costAmountCents: money.nullish(),
  minQuantity: z.number().int().nullish(),
  maxQuantity: z.number().int().nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: z.string().nullish(),
  metadata: jsonRecord.nullish(),
  tiers: z.array(unitTierSpecSchema).default([]),
})

export const pickupPriceRuleSpecSchema = z.object({
  pickupPointId: z.string().min(1),
  pricingMode: z.enum(addonPricingModeEnum.enumValues).default("included"),
  sellAmountCents: money.nullish(),
  costAmountCents: money.nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: z.string().nullish(),
})

export const dropoffPriceRuleSpecSchema = z.object({
  facilityId: z.string().nullish(),
  dropoffCode: z.string().nullish(),
  dropoffName: z.string().min(1).max(255),
  pricingMode: z.enum(addonPricingModeEnum.enumValues).default("included"),
  sellAmountCents: money.nullish(),
  costAmountCents: money.nullish(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: z.string().nullish(),
})

export const optionPriceRuleSpecSchema = z.object({
  /**
   * Price catalog the rule points at. Optional: clone reuses the source rule's
   * catalog; compose resolves the operator default when omitted.
   */
  priceCatalogId: z.string().nullish(),
  priceScheduleId: z.string().nullish(),
  cancellationPolicyId: z.string().nullish(),
  code: z.string().nullish(),
  name: z.string().min(1).max(255),
  description: z.string().nullish(),
  pricingMode: z.enum(optionPricingModeEnum.enumValues).default("per_person"),
  baseSellAmountCents: money.nullish(),
  baseCostAmountCents: money.nullish(),
  minPerBooking: z.number().int().nullish(),
  maxPerBooking: z.number().int().nullish(),
  allPricingCategories: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().nullish(),
  metadata: jsonRecord.nullish(),
  unitPriceRules: z.array(unitPriceRuleSpecSchema).default([]),
  pickupPriceRules: z.array(pickupPriceRuleSpecSchema).default([]),
  dropoffPriceRules: z.array(dropoffPriceRuleSpecSchema).default([]),
})

export const optionSpecSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1).max(255),
  code: z.string().max(255).nullish(),
  description: z.string().nullish(),
  status: z.enum(productOptionStatusEnum.enumValues).default("draft"),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  availableFrom: z.string().nullish(),
  availableTo: z.string().nullish(),
  units: z.array(unitSpecSchema).default([]),
  priceRules: z.array(optionPriceRuleSpecSchema).default([]),
})

export const paxPricingTierSpecSchema = z.object({
  /** Optional link to a unit (by `ref`) within the spec. */
  unitRef: z.string().nullish(),
  tierPax: z.number().int(),
  pricePerPaxCents: money,
  promoPricePerPaxCents: money.nullish(),
  effectiveFrom: z.string().nullish(),
  effectiveTo: z.string().nullish(),
})

export const dayServiceSpecSchema = z.object({
  supplierServiceId: z.string().nullish(),
  serviceType: z.enum(serviceTypeEnum.enumValues),
  name: z.string().min(1).max(255),
  description: z.string().nullish(),
  countryCode: z.string().nullish(),
  costCurrency: z.string().min(3).max(3),
  costAmountCents: money,
  quantity: z.number().int().default(1),
  sortOrder: z.number().int().nullish(),
  notes: z.string().nullish(),
})

export const daySpecSchema = z.object({
  dayNumber: z.number().int(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  location: z.string().nullish(),
  services: z.array(dayServiceSpecSchema).default([]),
})

export const itinerarySpecSchema = z.object({
  name: z.string().min(1).max(255),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  days: z.array(daySpecSchema).default([]),
})

export const productRowSpecSchema = z.object({
  name: z.string().min(1).max(255),
  status: z.enum(productStatusEnum.enumValues).default("draft"),
  description: z.string().nullish(),
  inclusionsHtml: z.string().nullish(),
  exclusionsHtml: z.string().nullish(),
  termsHtml: z.string().nullish(),
  termsShowOnContract: z.boolean().default(false),
  bookingMode: z.enum(productBookingModeEnum.enumValues).default("date"),
  capacityMode: z.enum(productCapacityModeEnum.enumValues).default("limited"),
  timezone: z.string().nullish(),
  defaultLanguageTag: z.string().nullish(),
  visibility: z.enum(productVisibilityEnum.enumValues).default("private"),
  sellCurrency: z.string().min(3).max(3),
  sellAmountCents: money.nullish(),
  costAmountCents: money.nullish(),
  marginPercent: z.number().int().nullish(),
  reservationTimeoutMinutes: z.number().int().nullish(),
  facilityId: z.string().nullish(),
  supplierId: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  pax: z.number().int().nullish(),
  productTypeId: z.string().nullish(),
  /** Optional Product subtype stable code (e.g. `boat-tour`). */
  productSubtypeCode: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64)
    .nullish(),
  /** Explicit product duration in minutes (positive). */
  durationMinutes: z.number().int().positive().nullish(),
  contractTemplateId: z.string().nullish(),
  taxClassId: z.string().nullish(),
  customerPaymentPolicy: z.unknown().nullish(),
  tags: z.array(z.string()).default([]),
})

export const productGraphSpecSchema = z.object({
  product: productRowSpecSchema,
  options: z.array(optionSpecSchema).default([]),
  paxPricingTiers: z.array(paxPricingTierSpecSchema).default([]),
  itineraries: z.array(itinerarySpecSchema).default([]),
})

export type UnitSpec = z.infer<typeof unitSpecSchema>
export type UnitTierSpec = z.infer<typeof unitTierSpecSchema>
export type UnitPriceRuleSpec = z.infer<typeof unitPriceRuleSpecSchema>
export type PickupPriceRuleSpec = z.infer<typeof pickupPriceRuleSpecSchema>
export type DropoffPriceRuleSpec = z.infer<typeof dropoffPriceRuleSpecSchema>
export type OptionPriceRuleSpec = z.infer<typeof optionPriceRuleSpecSchema>
export type OptionSpec = z.infer<typeof optionSpecSchema>
export type PaxPricingTierSpec = z.infer<typeof paxPricingTierSpecSchema>
export type DayServiceSpec = z.infer<typeof dayServiceSpecSchema>
export type DaySpec = z.infer<typeof daySpecSchema>
export type ItinerarySpec = z.infer<typeof itinerarySpecSchema>
export type ProductRowSpec = z.infer<typeof productRowSpecSchema>
export type ProductGraphSpec = z.infer<typeof productGraphSpecSchema>
