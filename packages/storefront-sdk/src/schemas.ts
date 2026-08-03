import {
  publicBookingOverviewLookupQuerySchema,
  publicBookingOverviewSchema,
} from "@voyant-travel/bookings/public-validation"
import {
  bootstrapCheckoutCollectionSchema,
  bootstrappedCheckoutCollectionSchema,
  checkoutCollectionPlanSchema,
  initiateCheckoutCollectionSchema,
  initiatedCheckoutCollectionSchema,
  previewCheckoutCollectionSchema,
} from "@voyant-travel/finance/checkout-validation"
import {
  storefrontDepartureItineraryQuerySchema,
  storefrontDepartureItinerarySchema,
  storefrontDepartureListQuerySchema,
  storefrontDepartureListResponseSchema,
  storefrontDeparturePriceAllocationSchema,
  storefrontDeparturePriceExtraImpactSchema,
  storefrontDeparturePriceLineItemSchema,
  storefrontDeparturePriceOfferImpactSchema,
  storefrontDeparturePriceOffersSchema,
  storefrontDeparturePricePaxSchema,
  storefrontDeparturePricePreviewInputSchema,
  storefrontDeparturePricePreviewSchema,
  storefrontDeparturePriceRequestedOfferSchema,
  storefrontDeparturePriceRoomRowSchema,
  storefrontDeparturePriceSlotSchema,
  storefrontDeparturePriceTotalsSchema,
  storefrontDeparturePriceUnitRowSchema,
  storefrontDepartureSchema,
  storefrontIntakeResponseSchema,
  storefrontLeadIntakeInputSchema,
  storefrontNewsletterSubscribeInputSchema,
  storefrontNewsletterSubscribeResponseSchema,
  storefrontProductAvailabilitySummaryQuerySchema,
  storefrontProductAvailabilitySummaryResponseSchema,
  storefrontProductExtensionsQuerySchema,
  storefrontProductExtensionsResponseSchema,
  storefrontPromotionalOfferListQuerySchema,
  storefrontPromotionalOfferSchema,
  storefrontSettingsSchema,
} from "@voyant-travel/storefront/validation"
import { z } from "zod"

export const storefrontSingleEnvelopeSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: item })
export const storefrontArrayEnvelopeSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item) })

export {
  bootstrapCheckoutCollectionSchema,
  bootstrappedCheckoutCollectionSchema,
  checkoutCollectionPlanSchema,
  initiateCheckoutCollectionSchema,
  initiatedCheckoutCollectionSchema,
  previewCheckoutCollectionSchema,
  publicBookingOverviewLookupQuerySchema,
  publicBookingOverviewSchema,
  storefrontDepartureItineraryQuerySchema,
  storefrontDepartureItinerarySchema,
  storefrontDepartureListQuerySchema,
  storefrontDepartureListResponseSchema,
  storefrontDeparturePriceAllocationSchema,
  storefrontDeparturePriceExtraImpactSchema,
  storefrontDeparturePriceLineItemSchema,
  storefrontDeparturePriceOfferImpactSchema,
  storefrontDeparturePriceOffersSchema,
  storefrontDeparturePricePaxSchema,
  storefrontDeparturePricePreviewInputSchema,
  storefrontDeparturePricePreviewSchema,
  storefrontDeparturePriceRequestedOfferSchema,
  storefrontDeparturePriceRoomRowSchema,
  storefrontDeparturePriceSlotSchema,
  storefrontDeparturePriceTotalsSchema,
  storefrontDeparturePriceUnitRowSchema,
  storefrontDepartureSchema,
  storefrontIntakeResponseSchema,
  storefrontLeadIntakeInputSchema,
  storefrontNewsletterSubscribeInputSchema,
  storefrontNewsletterSubscribeResponseSchema,
  storefrontProductAvailabilitySummaryQuerySchema,
  storefrontProductAvailabilitySummaryResponseSchema,
  storefrontProductExtensionsQuerySchema,
  storefrontProductExtensionsResponseSchema,
  storefrontPromotionalOfferListQuerySchema,
  storefrontPromotionalOfferSchema,
  storefrontSettingsSchema,
}

export const storefrontSettingsResponseSchema =
  storefrontSingleEnvelopeSchema(storefrontSettingsSchema)
export const storefrontIntakeResponseEnvelopeSchema = storefrontSingleEnvelopeSchema(
  storefrontIntakeResponseSchema,
)
export const storefrontNewsletterSubscribeResponseEnvelopeSchema = storefrontSingleEnvelopeSchema(
  storefrontNewsletterSubscribeResponseSchema,
)
export const storefrontDepartureResponseSchema =
  storefrontSingleEnvelopeSchema(storefrontDepartureSchema)
export const storefrontDeparturePricePreviewResponseSchema = storefrontSingleEnvelopeSchema(
  storefrontDeparturePricePreviewSchema,
)
export const storefrontDepartureItineraryResponseSchema = storefrontSingleEnvelopeSchema(
  storefrontDepartureItinerarySchema,
)
export const storefrontPromotionalOfferListResponseSchema = storefrontArrayEnvelopeSchema(
  storefrontPromotionalOfferSchema,
)
export const storefrontPromotionalOfferResponseSchema = storefrontSingleEnvelopeSchema(
  storefrontPromotionalOfferSchema,
)

export const publicBookingOverviewResponseSchema = storefrontSingleEnvelopeSchema(
  publicBookingOverviewSchema,
)
export const checkoutCollectionPlanResponseSchema = storefrontSingleEnvelopeSchema(
  checkoutCollectionPlanSchema,
)
export const initiatedCheckoutCollectionResponseSchema = storefrontSingleEnvelopeSchema(
  initiatedCheckoutCollectionSchema,
)
export const bootstrappedCheckoutCollectionResponseSchema = storefrontSingleEnvelopeSchema(
  bootstrappedCheckoutCollectionSchema,
)

export type StorefrontSettingsRecord = z.infer<typeof storefrontSettingsSchema>
export type StorefrontLeadIntakeInput = z.input<typeof storefrontLeadIntakeInputSchema>
export type StorefrontNewsletterSubscribeInput = z.input<
  typeof storefrontNewsletterSubscribeInputSchema
>
export type StorefrontIntakeRecord = z.infer<typeof storefrontIntakeResponseSchema>
export type StorefrontNewsletterSubscribeRecord = z.infer<
  typeof storefrontNewsletterSubscribeResponseSchema
>
export type StorefrontDepartureRecord = z.infer<typeof storefrontDepartureSchema>
export type StorefrontDepartureItineraryQuery = z.input<
  typeof storefrontDepartureItineraryQuerySchema
>
export type StorefrontDepartureListQuery = z.input<typeof storefrontDepartureListQuerySchema>
export type StorefrontDeparturePricePreviewInput = z.input<
  typeof storefrontDeparturePricePreviewInputSchema
>
export type StorefrontDeparturePricePreviewRecord = z.infer<
  typeof storefrontDeparturePricePreviewSchema
>
export type StorefrontDepartureItineraryRecord = z.infer<typeof storefrontDepartureItinerarySchema>
export type StorefrontProductAvailabilitySummaryQuery = z.input<
  typeof storefrontProductAvailabilitySummaryQuerySchema
>
export type StorefrontProductExtensionsQuery = z.input<
  typeof storefrontProductExtensionsQuerySchema
>
export type StorefrontPromotionalOfferListQuery = z.input<
  typeof storefrontPromotionalOfferListQuerySchema
>
export type StorefrontPromotionalOfferRecord = z.infer<typeof storefrontPromotionalOfferSchema>

export type PublicBookingOverviewLookupQuery = z.input<
  typeof publicBookingOverviewLookupQuerySchema
>
export type PublicBookingOverviewRecord = z.infer<typeof publicBookingOverviewSchema>

export type PreviewCheckoutCollectionInput = z.input<typeof previewCheckoutCollectionSchema>
export type InitiateCheckoutCollectionInput = z.input<typeof initiateCheckoutCollectionSchema>
export type BootstrapCheckoutCollectionInput = z.input<typeof bootstrapCheckoutCollectionSchema>
export type CheckoutCollectionPlanRecord = z.infer<typeof checkoutCollectionPlanSchema>
export type InitiatedCheckoutCollectionRecord = z.infer<typeof initiatedCheckoutCollectionSchema>
export type BootstrappedCheckoutCollectionRecord = z.infer<
  typeof bootstrappedCheckoutCollectionSchema
>
