import type { StaffPaymentSettlementStrandedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { Callout, CTAButton, DetailList, DetailRow, StatBlock } from "../components.js"
import { formatMoney } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffPaymentSettlementStrandedEmailProps {
  context: StaffPaymentSettlementStrandedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

/**
 * The one staff alert that reports a loss rather than a milestone: money has
 * been taken and no Booking exists for it.
 *
 * Leads with the amount and says plainly that the customer has paid and holds
 * nothing, because the operator's next action is with the customer, not with
 * the software. The settlement error is carried verbatim underneath — it is the
 * only thing that distinguishes "re-run this" from "this seat is gone".
 */
export function StaffPaymentSettlementStrandedEmail({
  context,
  brand,
  messages,
}: StaffPaymentSettlementStrandedEmailProps) {
  const copy = messages.paymentSettlementStranded
  const amount = formatMoney(context.amount, brand.locale)

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(amount)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(amount)}
      lead={copy.lead}
    >
      <StatBlock value={amount} caption={copy.captured} brand={brand} />

      <Callout brand={brand} text={copy.action} />

      <DetailList>
        <DetailRow label={copy.paymentSession} value={context.paymentSessionId} />
        <DetailRow label={copy.bookingSession} value={context.bookingSessionId} />
        <DetailRow label={copy.provider} value={context.provider} />
        <DetailRow label={copy.attempts} value={String(context.attempts)} />
        <DetailRow label={copy.reason} value={context.error} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
