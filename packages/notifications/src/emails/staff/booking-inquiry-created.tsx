import type { StaffBookingInquiryCreatedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { CTAButton, DetailList, DetailRow } from "../components.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffBookingInquiryCreatedEmailProps {
  context: StaffBookingInquiryCreatedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffBookingInquiryCreatedEmail({
  context,
  brand,
  messages,
}: StaffBookingInquiryCreatedEmailProps) {
  const copy = messages.bookingInquiryCreated
  const contactName = context.contact?.name ?? messages.common.unknownCustomer

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(contactName)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(contactName)}
      lead={copy.lead}
    >
      <DetailList>
        <DetailRow label={messages.common.customer} value={contactName} />
        <DetailRow label="Email" value={context.contact?.email ?? null} />
        <DetailRow label={copy.phone} value={context.contactPhone} />
        <DetailRow label={copy.product} value={context.productId} />
        <DetailRow label={copy.departure} value={context.departureId} />
        <DetailRow label={copy.locale} value={context.locale} />
        <DetailRow label={copy.message} value={context.message} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
