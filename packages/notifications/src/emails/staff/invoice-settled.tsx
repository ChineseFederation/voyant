import type { StaffInvoiceSettledContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { CTAButton, DetailList, DetailRow, StatBlock } from "../components.js"
import { formatMoney } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffInvoiceSettledEmailProps {
  context: StaffInvoiceSettledContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffInvoiceSettledEmail({
  context,
  brand,
  messages,
}: StaffInvoiceSettledEmailProps) {
  const copy = messages.invoiceSettled
  const customerName = context.customer?.name ?? messages.common.unknownCustomer
  const invoiceLabel = context.invoiceNumber ?? context.invoiceId
  const total = formatMoney(context.total, brand.locale)

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(customerName)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(invoiceLabel)}
      lead={copy.lead}
    >
      {total ? <StatBlock value={total} caption={customerName} brand={brand} /> : null}

      <DetailList>
        <DetailRow label={messages.common.customer} value={customerName} />
        <DetailRow label={copy.invoice} value={invoiceLabel} />
        <DetailRow label={messages.common.booking} value={context.bookingNumber} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
