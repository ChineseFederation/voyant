import type { StaffBookingCancelledContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { CTAButton, DetailList, DetailRow, StatBlock } from "../components.js"
import { formatMoney } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffBookingCancelledEmailProps {
  context: StaffBookingCancelledContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffBookingCancelledEmail({
  context,
  brand,
  messages,
}: StaffBookingCancelledEmailProps) {
  const copy = messages.bookingCancelled
  const customerName = context.customer?.name ?? messages.common.unknownCustomer
  const total = formatMoney(context.total, brand.locale)

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(customerName)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(context.bookingNumber)}
      lead={copy.lead}
    >
      {total ? <StatBlock value={total} caption={customerName} brand={brand} /> : null}

      <DetailList>
        <DetailRow label={messages.common.customer} value={customerName} />
        <DetailRow label={messages.common.booking} value={context.bookingNumber} />
        <DetailRow label={copy.previousStatus} value={context.previousStatus} />
        <DetailRow label={copy.reason} value={context.reason ?? messages.common.notProvided} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
