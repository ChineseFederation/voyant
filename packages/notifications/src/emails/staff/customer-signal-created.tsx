import type { StaffCustomerSignalCreatedContext } from "../../staff-alert-registry.js"
import type { StaffAlertBrand } from "../brand.js"
import { Callout, CTAButton, DetailList, DetailRow } from "../components.js"
import { StaffAlertLayout } from "../layout.js"
import type { StaffAlertEmailMessages } from "../messages/index.js"

export interface StaffCustomerSignalCreatedEmailProps {
  context: StaffCustomerSignalCreatedContext
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
  /**
   * True when this copy is going to the enquiry's assignee, so the email can
   * say so. The dispatcher knows; the context does not, because one context is
   * rendered for several recipients.
   */
  isAssignee?: boolean
}

export function StaffCustomerSignalCreatedEmail({
  context,
  brand,
  messages,
  isAssignee = false,
}: StaffCustomerSignalCreatedEmailProps) {
  const copy = messages.customerSignalCreated
  const personName = context.person?.name ?? messages.common.unknownCustomer

  return (
    <StaffAlertLayout
      brand={brand}
      messages={messages}
      preview={copy.preview(context.kind)}
      eyebrow={copy.eyebrow}
      headline={copy.headline(personName)}
      lead={copy.lead}
    >
      {isAssignee ? <Callout brand={brand} text={copy.assignedToYou} /> : null}

      <DetailList>
        <DetailRow label={messages.common.customer} value={personName} />
        <DetailRow label="Email" value={context.person?.email ?? null} />
        <DetailRow label={copy.interestedIn} value={context.productTitle} />
        <DetailRow label={copy.kind} value={context.kind} />
        <DetailRow label={copy.source} value={context.source} />
        <DetailRow label={copy.priority} value={context.priority} />
        <DetailRow label={copy.notes} value={context.notes} />
      </DetailList>

      <CTAButton brand={brand} adminPath={context.adminPath} label={messages.common.viewInAdmin} />
    </StaffAlertLayout>
  )
}
