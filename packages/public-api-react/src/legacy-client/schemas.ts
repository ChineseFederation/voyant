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
  publicApiIntakeResponseSchema,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeInputSchema,
  publicApiNewsletterSubscribeResponseSchema,
  publicApiProductAvailabilitySummaryQuerySchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferSchema,
  publicApiSettingsSchema,
} from "@voyant-travel/public-api/validation"
import {
  createPublicInquirySchema,
  publicInquiryReceiptSchema,
} from "@voyant-travel/relationships-contracts"
import { z } from "zod"

export const publicApiSingleEnvelopeSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: item })
export const publicApiArrayEnvelopeSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item) })

export {
  bootstrapCheckoutCollectionSchema,
  bootstrappedCheckoutCollectionSchema,
  checkoutCollectionPlanSchema,
  createPublicInquirySchema,
  initiateCheckoutCollectionSchema,
  initiatedCheckoutCollectionSchema,
  previewCheckoutCollectionSchema,
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
  publicApiIntakeResponseSchema,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeInputSchema,
  publicApiNewsletterSubscribeResponseSchema,
  publicApiProductAvailabilitySummaryQuerySchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferSchema,
  publicApiSettingsSchema,
  publicBookingOverviewLookupQuerySchema,
  publicBookingOverviewSchema,
  publicInquiryReceiptSchema,
}

export const publicApiSettingsResponseSchema =
  publicApiSingleEnvelopeSchema(publicApiSettingsSchema)
export const publicApiIntakeResponseEnvelopeSchema = publicApiSingleEnvelopeSchema(
  publicApiIntakeResponseSchema,
)
export const publicApiNewsletterSubscribeResponseEnvelopeSchema = publicApiSingleEnvelopeSchema(
  publicApiNewsletterSubscribeResponseSchema,
)
export const publicApiDepartureResponseSchema =
  publicApiSingleEnvelopeSchema(publicApiDepartureSchema)
export const publicApiDeparturePricePreviewResponseSchema = publicApiSingleEnvelopeSchema(
  publicApiDeparturePricePreviewSchema,
)
export const publicApiDepartureItineraryResponseSchema = publicApiSingleEnvelopeSchema(
  publicApiDepartureItinerarySchema,
)
export const publicApiPromotionalOfferListResponseSchema = publicApiArrayEnvelopeSchema(
  publicApiPromotionalOfferSchema,
)
export const publicApiPromotionalOfferResponseSchema = publicApiSingleEnvelopeSchema(
  publicApiPromotionalOfferSchema,
)

export const publicBookingOverviewResponseSchema = publicApiSingleEnvelopeSchema(
  publicBookingOverviewSchema,
)
export const checkoutCollectionPlanResponseSchema = publicApiSingleEnvelopeSchema(
  checkoutCollectionPlanSchema,
)
export const initiatedCheckoutCollectionResponseSchema = publicApiSingleEnvelopeSchema(
  initiatedCheckoutCollectionSchema,
)
export const bootstrappedCheckoutCollectionResponseSchema = publicApiSingleEnvelopeSchema(
  bootstrappedCheckoutCollectionSchema,
)

export type PublicApiSettingsRecord = z.infer<typeof publicApiSettingsSchema>
export type PublicInquiryInput = z.input<typeof createPublicInquirySchema>
export type PublicInquiryReceipt = z.infer<typeof publicInquiryReceiptSchema>["data"]
export type PublicApiLeadIntakeInput = z.input<typeof publicApiLeadIntakeInputSchema>
export type PublicApiNewsletterSubscribeInput = z.input<
  typeof publicApiNewsletterSubscribeInputSchema
>
export type PublicApiIntakeRecord = z.infer<typeof publicApiIntakeResponseSchema>
export type PublicApiNewsletterSubscribeRecord = z.infer<
  typeof publicApiNewsletterSubscribeResponseSchema
>
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
export type PublicApiProductAvailabilitySummaryQuery = z.input<
  typeof publicApiProductAvailabilitySummaryQuerySchema
>
export type PublicApiProductExtensionsQuery = z.input<typeof publicApiProductExtensionsQuerySchema>
export type PublicApiPromotionalOfferListQuery = z.input<
  typeof publicApiPromotionalOfferListQuerySchema
>
export type PublicApiPromotionalOfferRecord = z.infer<typeof publicApiPromotionalOfferSchema>

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
