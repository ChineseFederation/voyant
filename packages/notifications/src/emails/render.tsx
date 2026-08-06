import { render } from "@react-email/render"
import type { ReactElement } from "react"

import type { StaffAlertContextMap, StaffAlertEventKey } from "../staff-alert-registry.js"
import type { StaffAlertBrand } from "./brand.js"
import { formatMoney } from "./format.js"
import { staffAlertEmailMessagesFor } from "./messages/index.js"
import { StaffBookingCancelledEmail } from "./staff/booking-cancelled.js"
import { StaffBookingConfirmedEmail } from "./staff/booking-confirmed.js"
import { StaffContractSignedEmail } from "./staff/contract-signed.js"
import { StaffCustomerSignalCreatedEmail } from "./staff/customer-signal-created.js"
import { StaffInvoiceSettledEmail } from "./staff/invoice-settled.js"
import { StaffPaymentCompletedEmail } from "./staff/payment-completed.js"

export interface RenderStaffAlertEmailInput<K extends StaffAlertEventKey = StaffAlertEventKey> {
  eventKey: K
  context: StaffAlertContextMap[K]
  brand: StaffAlertBrand
  /** True when rendering the copy addressed to the record's assignee. */
  isAssignee?: boolean
}

export interface RenderedStaffAlertEmail {
  subject: string
  html: string
  text: string
}

/**
 * Renders one staff alert to the `{subject, html, text}` triple
 * `enqueueNotification` expects.
 *
 * A plain-text alternative is produced alongside the HTML rather than left
 * empty: an HTML-only message scores badly with spam filters, and staff alerts
 * are exactly the mail an operator cannot afford to have filtered.
 */
export async function renderStaffAlertEmail<K extends StaffAlertEventKey>(
  input: RenderStaffAlertEmailInput<K>,
): Promise<RenderedStaffAlertEmail> {
  const messages = staffAlertEmailMessagesFor(input.brand.locale)
  const { element, subject } = selectTemplate(input, messages)

  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])

  return { subject, html, text }
}

function selectTemplate<K extends StaffAlertEventKey>(
  input: RenderStaffAlertEmailInput<K>,
  messages: ReturnType<typeof staffAlertEmailMessagesFor>,
): { element: ReactElement; subject: string } {
  const { brand } = input

  switch (input.eventKey) {
    case "staff.booking.confirmed": {
      const context = input.context as StaffAlertContextMap["staff.booking.confirmed"]
      return {
        element: <StaffBookingConfirmedEmail context={context} brand={brand} messages={messages} />,
        subject: messages.bookingConfirmed.subject(context.bookingNumber),
      }
    }
    case "staff.booking.cancelled": {
      const context = input.context as StaffAlertContextMap["staff.booking.cancelled"]
      return {
        element: <StaffBookingCancelledEmail context={context} brand={brand} messages={messages} />,
        subject: messages.bookingCancelled.subject(context.bookingNumber),
      }
    }
    case "staff.payment.completed": {
      const context = input.context as StaffAlertContextMap["staff.payment.completed"]
      return {
        element: <StaffPaymentCompletedEmail context={context} brand={brand} messages={messages} />,
        subject: messages.paymentCompleted.subject(formatMoney(context.amount, brand.locale)),
      }
    }
    case "staff.invoice.settled": {
      const context = input.context as StaffAlertContextMap["staff.invoice.settled"]
      return {
        element: <StaffInvoiceSettledEmail context={context} brand={brand} messages={messages} />,
        subject: messages.invoiceSettled.subject(context.invoiceNumber ?? context.invoiceId),
      }
    }
    case "staff.contract.signed": {
      const context = input.context as StaffAlertContextMap["staff.contract.signed"]
      return {
        element: <StaffContractSignedEmail context={context} brand={brand} messages={messages} />,
        subject: messages.contractSigned.subject(context.bookingNumber ?? context.contractId),
      }
    }
    case "staff.customer-signal.created": {
      const context = input.context as StaffAlertContextMap["staff.customer-signal.created"]
      return {
        element: (
          <StaffCustomerSignalCreatedEmail
            context={context}
            brand={brand}
            messages={messages}
            isAssignee={input.isAssignee ?? false}
          />
        ),
        subject: messages.customerSignalCreated.subject(
          context.person?.name ?? messages.common.unknownCustomer,
        ),
      }
    }
    default: {
      // Exhaustive: a new registry key without a template is a compile error
      // here rather than a runtime send of an empty email.
      const exhaustive: never = input.eventKey
      throw new Error(`No staff alert email template for "${String(exhaustive)}".`)
    }
  }
}
