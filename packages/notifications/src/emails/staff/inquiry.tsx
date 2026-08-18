import type { StaffInquiryContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { Callout, CTAButton, DetailList, DetailRow } from "../components.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export function StaffInquiryEmail({
  context,
  brand,
  messages,
  isAssignee = false,
}: {
  context: StaffInquiryContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
  isAssignee?: boolean
}) {
  const copy = messages.inquiry
  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(context.subject)}
      eyebrow={copy.eyebrow(context.alertKind)}
      headline={copy.headline(context.subject)}
      lead={copy.lead(context.alertKind)}
    >
      {isAssignee ? <Callout brand={brand} text={copy.assignedToYou} /> : null}
      <DetailList>
        <DetailRow label={messages.common.customer} value={context.contact?.name ?? null} />
        <DetailRow label="Email" value={context.contact?.email ?? null} />
        <DetailRow label={copy.source} value={context.source} />
        <DetailRow label={copy.status} value={context.status} />
        <DetailRow label={copy.responseDue} value={context.firstResponseDueAt} />
      </DetailList>
      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
