import type { StaffBookingConfirmedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { CTAButton, DetailList, DetailRow, StatBlock } from "../components.js"
import { formatDateRange, formatMoney } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffBookingConfirmedEmailProps {
  context: StaffBookingConfirmedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffBookingConfirmedEmail({
  context,
  brand,
  messages,
}: StaffBookingConfirmedEmailProps) {
  const copy = messages.bookingConfirmed
  const customerName = context.customer?.name ?? messages.common.unknownCustomer
  const total = formatMoney(context.total, brand.locale)
  const dates = formatDateRange(context.travelStartDate, context.travelEndDate, brand.locale)

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
        <DetailRow label={messages.common.travelDates} value={dates} />
        <DetailRow
          label={messages.common.travelers}
          value={context.travelerCount ? String(context.travelerCount) : null}
        />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
