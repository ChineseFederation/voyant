import type { StaffContractSignedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { CTAButton, DetailList, DetailRow } from "../components.js"
import { formatDateTime } from "../format.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffContractSignedEmailProps {
  context: StaffContractSignedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
}

export function StaffContractSignedEmail({
  context,
  brand,
  messages,
}: StaffContractSignedEmailProps) {
  const copy = messages.contractSigned
  const signer = context.signerName ?? messages.common.unknownCustomer

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(signer)}
      eyebrow={copy.eyebrow}
      headline={copy.headline}
      lead={copy.lead}
    >
      <DetailList>
        <DetailRow label={copy.signedBy} value={signer} />
        <DetailRow label={copy.signedAt} value={formatDateTime(context.signedAt, brand.locale)} />
        <DetailRow label={messages.common.booking} value={context.bookingNumber} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
