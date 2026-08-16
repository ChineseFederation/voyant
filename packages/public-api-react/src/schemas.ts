import {
  publicApiDepartureItineraryQuerySchema,
  publicApiDepartureItinerarySchema,
  publicApiDepartureListQuerySchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePriceAllocationSchema,
  publicApiDeparturePriceExtraImpactSchema,
  publicApiDeparturePriceLineItemSchema,
  publicApiDeparturePriceOfferImpactSchema,
  publicApiDeparturePriceOffersSchema,
  publicApiDeparturePricePaxSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDeparturePricePreviewSchema,
  publicApiDeparturePriceRequestedOfferSchema,
  publicApiDeparturePriceRoomRowSchema,
  publicApiDeparturePriceSlotSchema,
  publicApiDeparturePriceTotalsSchema,
  publicApiDeparturePriceUnitRowSchema,
  publicApiDepartureSchema,
  publicApiOfferApplyInputSchema,
  publicApiOfferMutationResponseSchema,
  publicApiOfferMutationResultSchema,
  publicApiOfferRedeemInputSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferSchema,
  publicApiSettingsInputSchema,
  publicApiSettingsPatchSchema,
  publicApiSettingsSchema,
} from "@voyant-travel/public-api/validation"
import { z } from "zod"

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const arrayEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })

export {
  publicApiDepartureItineraryQuerySchema,
  publicApiDepartureItinerarySchema,
  publicApiDepartureListQuerySchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePriceAllocationSchema,
  publicApiDeparturePriceExtraImpactSchema,
  publicApiDeparturePriceLineItemSchema,
  publicApiDeparturePriceOfferImpactSchema,
  publicApiDeparturePriceOffersSchema,
  publicApiDeparturePricePaxSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDeparturePricePreviewSchema,
  publicApiDeparturePriceRequestedOfferSchema,
  publicApiDeparturePriceRoomRowSchema,
  publicApiDeparturePriceSlotSchema,
  publicApiDeparturePriceTotalsSchema,
  publicApiDeparturePriceUnitRowSchema,
  publicApiDepartureSchema,
  publicApiOfferApplyInputSchema,
  publicApiOfferMutationResponseSchema,
  publicApiOfferMutationResultSchema,
  publicApiOfferRedeemInputSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferSchema,
  publicApiSettingsInputSchema,
  publicApiSettingsPatchSchema,
  publicApiSettingsSchema,
}

/**
 * Public market discovery contract (voyant#2643). Mirrors the narrow projection
 * served by `GET /v1/public/markets` (see `packages/commerce` `PublicMarket`).
 * Defined locally so the storefront client stays decoupled from the commerce
 * package while validating the anonymous discovery response.
 *
 * The market `id` is the catalog-search scope key — thread it into catalog
 * search as the `market` parameter. `code`/`name` are display-only.
 */
export const publicApiMarketLocaleSchema = z.object({
  languageTag: z.string(),
  isDefault: z.boolean(),
})

export const publicApiMarketCurrencySchema = z.object({
  currencyCode: z.string(),
  isDefault: z.boolean(),
})

export const publicApiMarketSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  regionCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  defaultLocale: z.string(),
  defaultCurrency: z.string(),
  locales: z.array(publicApiMarketLocaleSchema),
  currencies: z.array(publicApiMarketCurrencySchema),
})

export const publicApiMarketsResponseSchema = arrayEnvelope(publicApiMarketSchema)

export type PublicApiMarketLocale = z.infer<typeof publicApiMarketLocaleSchema>
export type PublicApiMarketCurrency = z.infer<typeof publicApiMarketCurrencySchema>
export type PublicApiMarketRecord = z.infer<typeof publicApiMarketSchema>

export const publicApiSettingsResponseSchema = singleEnvelope(publicApiSettingsSchema)
export const publicApiDepartureResponseSchema = singleEnvelope(publicApiDepartureSchema)
export const publicApiDeparturePricePreviewResponseSchema = singleEnvelope(
  publicApiDeparturePricePreviewSchema,
)
export const publicApiDepartureItineraryResponseSchema = singleEnvelope(
  publicApiDepartureItinerarySchema,
)
export const publicApiPromotionalOfferListResponseSchema = arrayEnvelope(
  publicApiPromotionalOfferSchema,
)
export const publicApiPromotionalOfferResponseSchema = singleEnvelope(
  publicApiPromotionalOfferSchema,
)

export type PublicApiSettingsRecord = z.infer<typeof publicApiSettingsSchema>
export type PublicApiSettingsInput = z.input<typeof publicApiSettingsInputSchema>
export type PublicApiSettingsPatchInput = z.input<typeof publicApiSettingsPatchSchema>
export type PublicApiDepartureRecord = z.infer<typeof publicApiDepartureSchema>
export type PublicApiDepartureItineraryQuery = z.input<
  typeof publicApiDepartureItineraryQuerySchema
>
export type PublicApiDepartureListQuery = z.input<typeof publicApiDepartureListQuerySchema>
export type PublicApiDeparturePricePreviewInput = z.input<
  typeof publicApiDeparturePricePreviewInputSchema
>
export type PublicApiDeparturePricePreviewRecord = z.infer<
  typeof publicApiDeparturePricePreviewSchema
>
export type PublicApiDepartureItineraryRecord = z.infer<typeof publicApiDepartureItinerarySchema>
export type PublicApiProductExtensionsQuery = z.input<typeof publicApiProductExtensionsQuerySchema>
export type PublicApiPromotionalOfferListQuery = z.input<
  typeof publicApiPromotionalOfferListQuerySchema
>
export type PublicApiPromotionalOfferRecord = z.infer<typeof publicApiPromotionalOfferSchema>
export type PublicApiOfferApplyInput = z.input<typeof publicApiOfferApplyInputSchema>
export type PublicApiOfferRedeemInput = z.input<typeof publicApiOfferRedeemInputSchema>
export type PublicApiOfferMutationRecord = z.infer<typeof publicApiOfferMutationResultSchema>
