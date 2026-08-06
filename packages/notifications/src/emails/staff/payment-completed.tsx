import type { StaffPaymentCompletedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { Callout, CTAButton, DetailList, DetailRow, StatBlock } from "../components.js"
import { formatMoney } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffPaymentCompletedEmailProps {
  context: StaffPaymentCompletedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffPaymentCompletedEmail({
  context,
  brand,
  messages,
}: StaffPaymentCompletedEmailProps) {
  const copy = messages.paymentCompleted
  const customerName = context.customer?.name ?? messages.common.unknownCustomer
  const amount = formatMoney(context.amount, brand.locale)

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(customerName)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(amount)}
      lead={copy.lead}
    >
      <StatBlock value={amount} caption={customerName} brand={brand} />

      {/* Null means the caller could not determine balance state — say nothing
          rather than imply a booking is settled when it may not be. */}
      {context.paidInFull === null ? null : (
        <Callout brand={brand} text={context.paidInFull ? copy.paidInFull : copy.partialPayment} />
      )}

      <DetailList>
        <DetailRow label={messages.common.customer} value={customerName} />
        <DetailRow label={messages.common.booking} value={context.bookingNumber} />
        <DetailRow label={copy.provider} value={context.provider} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
